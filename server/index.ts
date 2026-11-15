import 'dotenv/config'
import express, { type NextFunction, type Request, type Response, type RequestHandler } from 'express'
import { Database } from './database.ts'
import { ObjectStorage } from './storage.ts'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { resolve } from 'node:path'
import { isSellerEmailVerificationRequired, isEmailConfigured, sendAuthNotifications, sendPasswordResetEmail, sendSellerVerificationCode } from './email.ts'
import { prepareVerificationPhotos, optionalSsnLast4, verificationPhone, uploadVerificationPhotos, insertApplicationPhotos, queuePhotoCleanup, registerSellerVerification, type StoredVerificationPhoto } from './sellerVerification.ts'
import { registerAuthBrowser, authBrowserBinding } from './authBrowser.ts'
import { warehousePricing } from './warehousePricing.ts'
import { registerMarketing } from './marketing.ts'
import {registerSellerDisplayStats} from './sellerDisplayStats.ts'
import { registerTransactionPin, checkTransactionPin } from './transactionPin.ts'
import { registerSellerFinance } from './sellerFinance.ts'
import { registerManualOrders } from './manualOrders.ts'
import { allocateOrderNumber } from './orderNumbers.ts'
import { seedWarehouseSamples } from './warehouseSamples.ts'
import { seedImportedWarehouse } from './warehouseCatalog.ts'

type UserRole = 'customer' | 'seller' | 'admin'

interface UserRow {
  public_id: string
  id: number
  full_name: string
  email: string
  phone: string | null
  password_hash: string
  role: UserRole
  suspended: number
  seller_status: string
  created_at: string
  token_hash?: string
}

interface ProductRow {
  public_id: string
  id: number
  name: string
  category: string
  price: number
  compare_at_price: number | null
  description: string
  image_url: string
  image_urls_json: string
  colors_json: string
  sizes_json: string
  rating: number
  seller_id: number | null
  is_published: number
  is_store_published: number
  created_at: string
}

interface VerificationRow {
  requester_hash: string | null
  email: string
  code_hash: string
  expires_at: string
  attempts: number
  verified_at: string | null
  created_at: string
}

interface CategoryRow {
  id: number
  name: string
}

interface AdminUserRow extends Pick<UserRow, 'id' | 'public_id' | 'full_name' | 'email' | 'phone' | 'role' | 'created_at'> {}

interface AdminSellerRow extends Pick<UserRow, 'id' | 'public_id' | 'full_name' | 'email' | 'phone' | 'created_at'> {
  publicId: string
  store_name: string | null
  store_description: string | null
  store_logo_url: string | null
  country: string | null
  address: string | null
  city: string | null
  region: string | null
  postal_code: string | null
  verification_status: string | null
  follower_count: number
  visitor_count: number
  actual_follow_count: number
}

interface AdminEventRow {
  publicId: string
  id: number
  event_type: 'registered' | 'login'
  created_at: string
  user_id: number
  full_name: string
  email: string
}

interface ProductInput {
  name: string
  category: string
  description: string
  imageUrl: string
  price: number
  compareAtPrice: number | null
  imageUrls: string[]
  colors: string[]
  sizes: string[]
  rating: number
  isPublished: boolean
  isStorePublished: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRow
      sessionTokenHash?: string
    }
  }
}

const getErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return error.code === '23505' ? 'SQLITE_CONSTRAINT_UNIQUE' : typeof error.code === 'string' ? error.code : undefined
}

const getRow = async <Row>(sql: string, ...parameters: unknown[]): Promise<Row | undefined> =>
  (await database.prepare(sql).get(...parameters)) as Row | undefined

const getRows = async <Row>(sql: string, ...parameters: unknown[]): Promise<Row[]> =>
  (await database.prepare(sql).all(...parameters)) as Row[]

const app = express()
const port = Number(process.env.PORT) || 3001
const cookieName = 'ggu_session'
const sessionDurationMs = 365 * 24 * 60 * 60 * 1000
const sessionRenewalWindowMs = 30 * 24 * 60 * 60 * 1000
const database = new Database()
await new ObjectStorage().verifyBucket()
await database.initialize()

const starterProducts: Array<[string, string, number, string, string]> = [
  ['Gabrielle Shoulder Bag', 'Bags', 89, 'A structured everyday shoulder bag.', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85'],
  ['Mira Everyday Tote', 'Bags', 76, 'A roomy carryall for daily essentials.', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85'],
  ['Lola Ballet Flat', 'Shoes', 64, 'A versatile flat with a soft silhouette.', 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=85'],
  ['Tessa Heeled Sandal', 'Shoes', 82, 'An easy sandal for evening plans.', 'https://images.unsplash.com/photo-1515347619252-60a4bf4fff4f?auto=format&fit=crop&w=900&q=85'],
  ['Sculpted Midi Dress', 'Clothing', 118, 'A clean shape with a considered fit.', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85'],
  ['Linen Column Dress', 'Clothing', 104, 'A relaxed linen layer for warm days.', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=85'],
  ['Sol Pendant Necklace', 'Accessories', 48, 'A simple pendant for everyday wear.', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85'],
  ['Everyday Classic Watch', 'Accessories', 92, 'A timeless watch with a minimal face.', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85'],
  ['Arc Ceramic Table Lamp', 'Home', 74, 'A warm accent lamp for a reading corner.', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85'],
  ['Cotton Bath Towel Set', 'Home', 38, 'Soft cotton towels for everyday use.', 'https://images.unsplash.com/photo-1620626011761-996317b8d101?auto=format&fit=crop&w=900&q=85'],
  ['Pocket Wireless Earbuds', 'Electronics', 59, 'Compact wireless audio for daily listening.', 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?auto=format&fit=crop&w=900&q=85'],
  ['Foldable Desk Stand', 'Electronics', 32, 'An adjustable stand for phones and tablets.', 'https://images.unsplash.com/photo-1586953208448-b95a79798f07?auto=format&fit=crop&w=900&q=85'],
  ['Daily Moisture Cream', 'Beauty & Personal Care', 26, 'A lightweight daily face moisturizer.', 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?auto=format&fit=crop&w=900&q=85'],
  ['Botanical Hand Wash', 'Beauty & Personal Care', 18, 'A gentle hand wash with a fresh scent.', 'https://images.unsplash.com/photo-1600428853876-fb5a850b444f?auto=format&fit=crop&w=900&q=85'],
  ['Roasted House Coffee', 'Food & Beverage', 16, 'Whole-bean coffee for a balanced cup.', 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?auto=format&fit=crop&w=900&q=85'],
  ['Wildflower Tea Selection', 'Food & Beverage', 22, 'A selection of loose-leaf herbal teas.', 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=85'],
  ['Trail Daypack', 'Sports & Outdoors', 68, 'A light daypack for short trips outdoors.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85'],
  ['Insulated Water Bottle', 'Sports & Outdoors', 29, 'A reusable bottle for work or the trail.', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'],
  ['Field Notes Hardcover', 'Books & Stationery', 19, 'A durable notebook for ideas and lists.', 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85'],
  ['Desk Planner', 'Books & Stationery', 24, 'A weekly planner with room to make notes.', 'https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=900&q=85'],
  ['Wooden Puzzle Blocks', 'Toys & Games', 34, 'A colorful wooden building set.', 'https://images.unsplash.com/photo-1558060370-d644479cb6f7?auto=format&fit=crop&w=900&q=85'],
  ['Canvas Pet Leash', 'Pet Supplies', 21, 'A sturdy adjustable leash for daily walks.', 'https://images.unsplash.com/photo-1548199973-03cce0bbc87b?auto=format&fit=crop&w=900&q=85'],
  ['Stretch Fitness Mat', 'Health & Wellness', 42, 'A cushioned mat for movement and stretching.', 'https://images.unsplash.com/photo-1592432678016-e910b452f9a2?auto=format&fit=crop&w=900&q=85'],
  ['Everyday Desk Organizer', 'Office Supplies', 27, 'A simple organizer for a tidier workspace.', 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=85'],
  ['Compact Car Phone Mount', 'Automotive', 23, 'A dashboard mount for hands-free navigation.', 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=900&q=85'],
]

const insertStarterProduct = database.prepare(`
  INSERT INTO products (name, category, price, description, image_url)
  SELECT ?, ?, ?, ?, ?
  WHERE NOT EXISTS (
    SELECT 1 FROM products WHERE name = ? AND seller_id IS NULL
  )
`)

const seedProducts = database.transaction(async (items: typeof starterProducts) => {
  for (const product of items) await insertStarterProduct.run(...product, product[0])
})
await seedProducts(starterProducts)

const insertCategory = database.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
const defaultCategoryNames = [
  'Food & Beverage', "Men's Clothing", "Women's Clothing", 'Snack Dessert',
  'Recreational Fishing Gear', 'Phones & Accessories', 'Epidemic Prevention Supplies',
  'Office Stationery', 'Computer Peripherals', 'Digital Products', 'Sports & Outdoors',
  'Home Appliances', 'Health Beauty & Hair', 'Kids & Babies', 'Jewelry & Watches',
  'Kids Toys', 'Luxury', 'Holiday decoration', "Children's clothing", "Men's Bag", "Ladies Bag",
]
const seedCategories = database.transaction(async () => {
  for (const categoryName of defaultCategoryNames) await insertCategory.run(categoryName)
  for (const product of starterProducts) await insertCategory.run(product[1])
  await database.prepare('INSERT OR IGNORE INTO categories (name) SELECT DISTINCT category FROM products').run()
})
await seedCategories()

if (process.env.NODE_ENV !== 'production') {
  const demoProductDetails: Record<string, { imageUrls: string[]; colors: string[]; sizes: string[]; rating: number }> = {
    'Arc Table Lamp': { imageUrls: ['https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=75'], colors: ['Black', 'Cream'], sizes: ['One size'], rating: 4.7 },
    'Everyday Crossbody': { imageUrls: ['https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=85'], colors: ['Brown', 'Black'], sizes: ['One size'], rating: 4.6 },
    'Soft Knit Pullover': { imageUrls: ['https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=85'], colors: ['Cream', 'Moss'], sizes: ['S', 'M', 'L'], rating: 4.8 },
    'Trail Daypack': { imageUrls: ['https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1622560480654-d96214fdc887?auto=format&fit=crop&w=900&q=85'], colors: ['Moss', 'Black'], sizes: ['18L', '24L'], rating: 4.9 },
    'Insulated Water Bottle': { imageUrls: ['https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1523362628745-0c100150b504?auto=format&fit=crop&w=900&q=85'], colors: ['Blue', 'Black', 'Cream'], sizes: ['500ml', '750ml'], rating: 4.5 },
    'Field Notes Hardcover': { imageUrls: ['https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=900&q=85'], colors: ['Moss', 'Blue'], sizes: ['A5'], rating: 4.4 },
    'Sculpted Midi Dress': { imageUrls: ['https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=85'], colors: ['Red', 'Black'], sizes: ['XS', 'S', 'M', 'L'], rating: 4.8 },
    'Sol Pendant Necklace': { imageUrls: ['https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=900&q=85'], colors: ['Gold', 'Silver'], sizes: ['One size'], rating: 4.6 },
    'Lola Ballet Flat': { imageUrls: ['https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=85', 'https://images.unsplash.com/photo-1515347619252-60a4bf4fff4f?auto=format&fit=crop&w=900&q=85'], colors: ['Black', 'Cream'], sizes: ['6', '7', '8', '9'], rating: 4.7 },
  }
  const demoStores = [
    {
      email: 'demo.partner@ggu.local',
      ownerName: 'GGU Demo Partner',
      storeName: 'Goodform Studio',
      description: 'Thoughtful everyday objects, apparel, and accessories from an independent GGU partner.',
      products: [
        ['Arc Table Lamp', 'Home Appliances', 74, 'A sculptural lamp for a softer evening glow.', 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85'],
        ['Everyday Crossbody', 'Ladies Bag', 58, 'A compact carryall with room for daily essentials.', 'https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=85'],
        ['Soft Knit Pullover', "Women's Clothing", 66, 'An easy layer with a relaxed, comfortable fit.', 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?auto=format&fit=crop&w=900&q=85'],
      ],
    },
    {
      email: 'demo.northstar@ggu.local',
      ownerName: 'Jordan Ellis',
      storeName: 'Northstar Supply',
      description: 'Useful outdoor gear and durable essentials for weekends away.',
      products: [
        ['Trail Daypack', 'Sports & Outdoors', 68, 'A light daypack for short trips outdoors.', 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85'],
        ['Insulated Water Bottle', 'Sports & Outdoors', 29, 'A reusable bottle for work or the trail.', 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'],
        ['Field Notes Hardcover', 'Books & Stationery', 19, 'A durable notebook for ideas and lists.', 'https://images.unsplash.com/photo-1531346878377-a5be20888e57?auto=format&fit=crop&w=900&q=85'],
      ],
    },
    {
      email: 'demo.petal@ggu.local',
      ownerName: 'Casey Morgan',
      storeName: 'Petal & Thread',
      description: 'Colorful accessories and easy-to-wear pieces picked for everyday style.',
      products: [
        ['Sculpted Midi Dress', 'Clothing', 118, 'A clean shape with a considered fit.', 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?auto=format&fit=crop&w=900&q=85'],
        ['Sol Pendant Necklace', 'Accessories', 48, 'A simple pendant for everyday wear.', 'https://images.unsplash.com/photo-1611652022419-a9419f74343d?auto=format&fit=crop&w=900&q=85'],
        ['Lola Ballet Flat', 'Shoes', 64, 'A versatile flat with a soft silhouette.', 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&w=900&q=85'],
      ],
    },
  ]

  for (const demoStore of demoStores) {
    const existingDemoSeller = (await getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', demoStore.email))
    let sellerId = existingDemoSeller?.id
    if (!sellerId) {
      const seedDemoStore = database.transaction(async () => {
        const result = (await database.prepare(`
          INSERT INTO users (full_name, email, password_hash, role)
          VALUES (?, ?, ?, 'seller')
        `).run(demoStore.ownerName, demoStore.email, bcrypt.hashSync(randomBytes(32).toString('hex'), 12)))
        const newSellerId = Number(result.lastInsertRowid)
        await database.prepare(`
          INSERT INTO seller_profiles (user_id, store_name, store_description, country, address, city, region, postal_code)
          VALUES (?, ?, ?, '', '', '', '', '')
        `).run(newSellerId, demoStore.storeName, demoStore.description)
        const insertDemoProduct = database.prepare(`
          INSERT INTO products (name, category, price, description, image_url, image_urls_json, colors_json, sizes_json, rating, seller_id, is_published, is_store_published)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
        `)
        for (const [name, category, price, description, imageUrl] of demoStore.products) {
          const details = demoProductDetails[name]
          await insertDemoProduct.run(name, category, price, description, imageUrl, JSON.stringify(details.imageUrls), JSON.stringify(details.colors), JSON.stringify(details.sizes), details.rating, newSellerId)
        }
        return newSellerId
      })
      sellerId = (await seedDemoStore())
    }
    const updateDemoDetails = database.prepare(`
      UPDATE products SET image_urls_json = ?, colors_json = ?, sizes_json = ?, rating = ?
      WHERE seller_id = ? AND name = ? AND image_urls_json = '[]' AND colors_json = '[]' AND sizes_json = '[]'
    `)
    for (const [name] of demoStore.products) {
      const details = demoProductDetails[name]
      await updateDemoDetails.run(JSON.stringify(details.imageUrls), JSON.stringify(details.colors), JSON.stringify(details.sizes), details.rating, sellerId, name)
    }
  }
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

const publicUser = (user: UserRow) => ({
  id: user.id,
  publicId: user.public_id,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  sellerStatus: user.seller_status || 'none',
  createdAt: user.created_at,
})

const parseStringArray = (json: string): string[] => {
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

const publicProduct = (product: ProductRow) => ({
  id: product.id,
  publicId: product.public_id,
  name: product.name,
  category: product.category,
  price: product.price,
  compareAtPrice: product.compare_at_price,
  description: product.description,
  imageUrl: product.image_url,
  imageUrls: parseStringArray(product.image_urls_json).length ? parseStringArray(product.image_urls_json) : [product.image_url],
  colors: parseStringArray(product.colors_json),
  sizes: parseStringArray(product.sizes_json),
  rating: product.rating,
  sellerId: product.seller_id,
  isPublished: Boolean(product.is_published),
  isStorePublished: Boolean(product.is_store_published),
  createdAt: product.created_at,
})

const seedAdmin = async (): Promise<void> => {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.ADMIN_PASSWORD

  if (!email || !password) {
    console.warn('Admin account not seeded. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env.')
    return
  }

  if (Buffer.byteLength(password, 'utf8') < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw new Error('ADMIN_PASSWORD must be between 12 and 72 bytes.')
  }

  const existingAdmin = (await getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', email))
  if (existingAdmin) {
    await database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingAdmin.id)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await database.prepare(`
    INSERT INTO users (full_name, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(process.env.ADMIN_NAME?.trim() || 'Store Owner', email, process.env.ADMIN_PHONE?.trim() || null, passwordHash)
  console.log(`Created admin account ${email}`)
}

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(helmet())
app.use('/api/seller/products', express.json({ limit: '24mb' }))
app.use('/api/seller/warehouse', express.json({ limit: '24mb' }))
app.use('/api/auth/register-seller', express.json({ limit: '12mb' }))
app.use('/api/seller/application', express.json({ limit: '12mb' }))
app.use('/api/admin/warehouse', express.json({ limit: '24mb' }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())
app.use('/api',(_req,res,next)=>{res.set('Cache-Control','private, no-store').vary('X-Session-Scope');next()})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const sessionCookieName=(req:Request):string=>{
 const scope=req.get('X-Session-Scope')||(req.method==='GET'?req.query.sessionScope:'')
 if(!scope)return cookieName
 return typeof scope==='string'&&/^[a-f0-9]{32}$/.test(scope)?`${cookieName}_${scope}`:'invalid_session_scope'
}
const sessionToken=(req:Request)=>{const token=req.cookies[sessionCookieName(req)];return typeof token==='string'&&/^[a-f0-9]{64}$/.test(token)?token:null}
const setSessionCookie = (req: Request, res: Response, token: string): void => {
  res.cookie(sessionCookieName(req), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: sessionDurationMs,
  })
}

const clearSessionCookie = (req: Request, res: Response): void => {
  res.clearCookie(sessionCookieName(req), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    path: '/',
  })
}

const createSession = async (userId: number | bigint, req: Request, res: Response): Promise<void> => {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString()
  await database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, expiresAt)
  setSessionCookie(req, res, token)
}

const requireAuth: RequestHandler = async (req, res, next) => {
  const token = sessionToken(req)
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' })

  const session = (await getRow<UserRow & { session_expires_at: string }>(`
    SELECT users.*, sessions.token_hash, sessions.expires_at AS session_expires_at
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, hashToken(token), new Date().toISOString()))

  if (!session) {
    clearSessionCookie(req, res)
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
  }
  if (session.suspended) {
    clearSessionCookie(req, res)
    return res.status(403).json({ error: 'Your account is suspended. Contact the administrator.' })
  }

  if (Date.parse(session.session_expires_at) - Date.now() <= sessionRenewalWindowMs) {
    const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString()
    await database.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').run(expiresAt, session.token_hash)
    setSessionCookie(req, res, token)
  }

  req.user = session
  req.sessionTokenHash = session.token_hash
  return next()
}

const requireRole = (...roles: UserRole[]): RequestHandler => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'You do not have permission to do that.' })
  }
  return next()
}

const getSiteName = async (): Promise<string> =>
  (await getRow<{ value: string }>("SELECT value FROM site_settings WHERE key = 'site_name'"))?.value ?? 'GGU'

app.get('/api/site-settings', async (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ siteName: (await getSiteName()) })
})

app.put('/api/admin/site-settings', requireAuth, requireRole('admin'), async (req, res) => {
  const siteName = typeof req.body?.siteName === 'string' ? req.body.siteName.trim() : ''
  if (!siteName || siteName.length > 80 || [...siteName].some((char) => {
    const code = char.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159)
  })) {
    return res.status(400).json({ error: 'Enter a website name between 1 and 80 characters without control characters.' })
  }
  await database.prepare("INSERT INTO site_settings (key, value) VALUES ('site_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(siteName)
  return res.json({ siteName })
})

const validateProduct = async (body: Record<string, unknown>, newImageIds: Set<string> = new Set()): Promise<{ product: ProductInput } | { error: string }> => {
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  const price = Number(body.price)
  const compareAtPrice = body.compareAtPrice === null || body.compareAtPrice === '' || body.compareAtPrice === undefined
    ? null
    : Number(body.compareAtPrice)
  const requestedImages = Array.isArray(body.imageUrls)
    ? body.imageUrls.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean)
    : []
  const imageUrls = [...new Set([imageUrl, ...requestedImages])]
  const colors = Array.isArray(body.colors)
    ? [...new Set(body.colors.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    : []
  const sizes = Array.isArray(body.sizes)
    ? [...new Set(body.sizes.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean))]
    : []
  const rating = Number(body.rating ?? 0)

  const validImage = async (value: string) => {
    if (/^\/api\/product-images\/[a-f0-9]{64}$/.test(value)) {
      const id = value.slice('/api/product-images/'.length)
      return newImageIds.has(id) || Boolean((await database.prepare('SELECT 1 FROM product_images WHERE id = ?').get(id)))
    }
    try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
  }

  if (!name || name.length > 500) return { error: 'Product name is required and must be under 500 characters.' }
  if (!category || category.length > 200) return { error: 'Enter a product category under 200 characters.' }
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid product price.' }
  if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice <= price || compareAtPrice > 1000000)) {
    return { error: 'Compare-at price must be greater than the sale price.' }
  }
  if (!(await validImage(imageUrl))) return { error: 'Choose a product image or enter a valid image URL.' }
  if (imageUrls.length > 50 || colors.length > 300 || sizes.length > 200) return { error: 'Use up to 50 product images, 300 colors, and 200 sizes.' }
  if (colors.some((color) => color.length > 200) || sizes.some((size) => size.length > 200)) return { error: 'Color and size options must be under 200 characters each.' }
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return { error: 'Product rating must be between 0 and 5.' }
  for (const galleryImage of imageUrls) {
    if (!(await validImage(galleryImage))) return { error: 'Choose valid product images or enter valid image URLs.' }
  }
  if (description.length > 100000) return { error: 'Description must be under 100000 characters.' }

  return {
    product: {
      name,
      category,
      description,
      imageUrl,
      price,
      compareAtPrice,
      imageUrls,
      colors,
      sizes,
      rating,
      isPublished: body.isPublished !== false,
      isStorePublished: body.isStorePublished !== false,
    },
  }
}

type ProductImageUpload = { id: string, contentType: string, image: Buffer }
const prepareProductImages = (body: Record<string, unknown>): { body: Record<string, unknown>, uploads: ProductImageUpload[] } | { error: string } => {
  const raw = body.imageUploads
  if (raw === undefined) return { body, uploads: [] }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Invalid product image upload.' }
  const { primary, gallery } = raw as { primary?: unknown, gallery?: unknown }
  if (gallery !== undefined && (!Array.isArray(gallery) || gallery.length > 7)) return { error: 'Choose up to seven additional gallery images.' }
  const uploads: ProductImageUpload[] = []
  const decode = (value: unknown): string | null => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const { type, data } = value as { type?: unknown, data?: unknown }
    if (typeof type !== 'string' || typeof data !== 'string' || !['image/png', 'image/jpeg', 'image/webp'].includes(type) || data.length > 2796204 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data)) return null
    const image = Buffer.from(data, 'base64')
    if (!image.length || image.length > 2 * 1024 * 1024) return null
    const png = image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    const jpeg = image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255
    const webp = image.length >= 12 && image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP'
    if (!(type === 'image/png' && png) && !(type === 'image/jpeg' && jpeg) && !(type === 'image/webp' && webp)) return null
    const id = randomBytes(32).toString('hex')
    uploads.push({ id, contentType: type, image })
    return `/api/product-images/${id}`
  }
  const imageUrl = primary === undefined || primary === null ? body.imageUrl : decode(primary)
  if (primary != null && !imageUrl) return { error: 'Choose PNG, JPEG or WebP images up to 2 MB each.' }
  const existingGallery = Array.isArray(body.imageUrls) ? body.imageUrls : []
  const addedGallery: string[] = []
  for (const item of (gallery ?? []) as unknown[]) {
    const url = decode(item)
    if (!url) return { error: 'Choose PNG, JPEG or WebP images up to 2 MB each.' }
    addedGallery.push(url)
  }
  const previousPrimary = typeof body.imageUrl === 'string' ? body.imageUrl : ''
  const retainedGallery = existingGallery.filter((url) => url !== imageUrl && (primary == null || url !== previousPrimary))
  const imageUrls = [...new Set([imageUrl, ...retainedGallery, ...addedGallery].filter(Boolean))]
  return { body: { ...body, imageUrl, imageUrls }, uploads }
}

app.get('/api/product-images/:id', async (req, res) => {
  const id = String(req.params.id)
  if (!/^[a-f0-9]{64}$/.test(id)) return res.status(404).json({ error: 'Image not found.' })
  const image = (await getRow<{ image: Buffer, content_type: string }>('SELECT image, content_type FROM product_images WHERE id = ?', id))
  if (!image) return res.status(404).json({ error: 'Image not found.' })
  return res.set('Cache-Control', 'public, max-age=31536000, immutable').set('X-Content-Type-Options', 'nosniff').type(image.content_type).send(image.image)
})

registerAuthBrowser(app)

app.get('/api/health', (_req, res) => res.json({ status: 'ok', version: process.env.RENDER_GIT_COMMIT?.slice(0,7) || null }))

app.post(['/api/auth/seller-verification-code','/api/auth/registration-verification-code'], authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : 'there'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address first.' })
    }

    if (!isSellerEmailVerificationRequired()) return res.json({ sent: false, verificationRequired: false })

    const existing = (await getRow<Pick<VerificationRow, 'created_at'>>('SELECT created_at FROM seller_email_verifications WHERE email = ?', email))
    if (existing && Date.now() - new Date(`${existing.created_at.replace(' ', 'T')}Z`).getTime() < 60_000) {
      return res.status(429).json({ error: 'Wait one minute before requesting another code.' })
    }

    const code = String(randomInt(100000, 1000000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    await database.prepare(`
      INSERT INTO seller_email_verifications (email, code_hash, expires_at, attempts, requester_hash)
      VALUES (?, ?, ?, 0, ?)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, verified_at = NULL, requester_hash = excluded.requester_hash, created_at = CURRENT_TIMESTAMP
    `).run(email, hashToken(code), expiresAt, authBrowserBinding(req))

    const sent = await sendSellerVerificationCode({ to: email, name: fullName, code, siteName: (await getSiteName()) })
    if (!sent) {
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ sent: false, developmentCode: code, expiresInSeconds: 600 })
      }
      await database.prepare('DELETE FROM seller_email_verifications WHERE email = ?').run(email)
      return res.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again later.' })
    }
    return res.json({ sent: true, expiresInSeconds: 600 })
  } catch (error) {
    return next(error)
  }
})

app.post(['/api/auth/verify-seller-email-code','/api/auth/verify-registration-email-code'], authLimiter, async (req, res) => {
  if (!isSellerEmailVerificationRequired()) return res.json({ verified: false, verificationRequired: false })
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : ''
  const verification = (await getRow<VerificationRow>('SELECT * FROM seller_email_verifications WHERE email = ?', email))
  const codeMatches = verification && verification.expires_at > new Date().toISOString()
    && (verification.requester_hash === authBrowserBinding(req) && Boolean(authBrowserBinding(req)))
    && verification.attempts < 5 && /^\d{6}$/.test(code)
    && hashToken(code) === verification.code_hash

  if (!codeMatches) {
    if (verification && verification.attempts < 5 && (verification.requester_hash === authBrowserBinding(req))) {
      await database.prepare('UPDATE seller_email_verifications SET attempts = attempts + 1 WHERE email = ?').run(email)
    }
    return res.status(400).json({ error: 'The email verification code is invalid or expired.' })
  }

  await database.prepare('UPDATE seller_email_verifications SET verified_at = ? WHERE email = ?')
    .run(new Date().toISOString(), email)
  return res.json({ verified: true })
})

const isValidStoreLogoUrl = async (value: string): Promise<boolean> => {
  if (/^\/api\/product-images\/[a-f0-9]{64}$/.test(value)) {
    return Boolean(await database.prepare('SELECT 1 FROM product_images WHERE id = ?').get(value.slice('/api/product-images/'.length)))
  }
  try { return ['http:', 'https:'].includes(new URL(value).protocol) } catch { return false }
}

const registerAccount = (role: UserRole, existingAccount = false): RequestHandler => async (req, res, next) => {
  let uploadedVerification: StoredVerificationPhoto[] = []
  let registrationCommitted = false
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : ''
    const email = existingAccount ? req.user!.email : typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    let phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    let ssnLast4: string | null = null
    let sellerProfile = null
    let logoUpload: ProductImageUpload | undefined
    let verificationPhotos: ReturnType<typeof prepareVerificationPhotos> | undefined

    if (!fullName || fullName.length > 100) return res.status(400).json({ error: 'Enter your name (up to 100 characters).' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (phone.length > 30) return res.status(400).json({ error: 'Phone number must be under 30 characters.' })
    if (!existingAccount && (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72)) return res.status(400).json({ error: 'Password must be between 8 and 72 bytes.' })

    if (role === 'seller' || role === 'customer') {
      const verification = (await getRow<VerificationRow>('SELECT * FROM seller_email_verifications WHERE email = ?', email))
      if (isSellerEmailVerificationRequired() && (!verification?.verified_at || verification.expires_at <= new Date().toISOString() || (verification.requester_hash !== authBrowserBinding(req) || !authBrowserBinding(req)))) {
        return res.status(400).json({ error: 'The email verification code is invalid or expired.' })
      }
    }
    if (role === 'seller') {
      const profile = {
        storeName: typeof req.body.storeName === 'string' ? req.body.storeName.trim() : '',
        storeDescription: typeof req.body.storeDescription === 'string' ? req.body.storeDescription.trim() : '',
        storeLogoUrl: typeof req.body.storeLogoUrl === 'string' ? req.body.storeLogoUrl.trim() : '',
        country: typeof req.body.country === 'string' ? req.body.country.trim() : '',
        address: typeof req.body.address === 'string' ? req.body.address.trim() : '',
        city: typeof req.body.city === 'string' ? req.body.city.trim() : '',
        region: typeof req.body.region === 'string' ? req.body.region.trim() : '',
        postalCode: typeof req.body.postalCode === 'string' ? req.body.postalCode.trim() : '',
      }
      if (req.body.storeLogoUpload !== undefined && req.body.storeLogoUpload !== null) {
        const prepared = prepareProductImages({ imageUploads: { primary: req.body.storeLogoUpload } })
        if ('error' in prepared) return res.status(400).json({ error: prepared.error })
        logoUpload = prepared.uploads[0]
        if (!logoUpload) return res.status(400).json({ error: 'Choose a PNG, JPEG or WebP logo up to 2 MB.' })
        profile.storeLogoUrl = String(prepared.body.imageUrl)
      }
      const requiredProfileFields = [profile.storeName, profile.country, profile.address, profile.city, profile.region, profile.postalCode]
      if (requiredProfileFields.some((value) => !value)) return res.status(400).json({ error: 'Complete all required seller profile fields.' })
      if (profile.storeName.length > 100 || profile.storeDescription.length > 500 || profile.storeLogoUrl.length > 2000 || profile.address.length > 200 || profile.city.length > 100 || profile.region.length > 100 || profile.postalCode.length > 20 || profile.country.length > 80) {
        return res.status(400).json({ error: 'One or more seller profile fields are too long.' })
      }
      if (profile.storeLogoUrl && !logoUpload && !await isValidStoreLogoUrl(profile.storeLogoUrl)) {
        return res.status(400).json({ error: 'Enter a valid store logo URL.' })
      }
      const normalizedPhone = verificationPhone(phone)
      if (!normalizedPhone) return res.status(400).json({ error: 'Enter a valid phone number with country code (7–15 digits).' })
      phone = normalizedPhone
      verificationPhotos = prepareVerificationPhotos(req.body)
      if ('error' in verificationPhotos) return res.status(400).json({ error: verificationPhotos.error })
      const ssn = optionalSsnLast4(req.body.ssnLast4, profile.country)
      if ('error' in ssn) return res.status(400).json({error:ssn.error})
      ssnLast4 = ssn.value
      sellerProfile = profile
    }

    if (existingAccount && (req.user!.role !== 'customer' || req.user!.seller_status !== 'none')) return res.status(409).json({error:'This account already has seller access or an application. Open your seller application status.'})
    if (!existingAccount && await getRow('SELECT 1 FROM users WHERE email=?', email)) return res.status(409).json({ error: 'An account with that email already exists.' })
    if (verificationPhotos && 'photos' in verificationPhotos) uploadedVerification = await uploadVerificationPhotos(database, verificationPhotos.photos)
    const passwordHash = existingAccount ? null : await bcrypt.hash(password, 12)
    const user = await database.transaction(async () => {
      let user: UserRow
      if (existingAccount) {
        const current = await getRow<UserRow>('SELECT * FROM users WHERE id=?',req.user!.id)
        if (!current || current.role !== 'customer' || current.seller_status !== 'none') throw new Error('The seller application changed before submission.')
        await database.prepare("UPDATE users SET full_name=?,phone=?,seller_status='pending' WHERE id=?").run(fullName,phone,current.id)
        user = (await getRow<UserRow>('SELECT * FROM users WHERE id=?',current.id))!
      } else {
      const result = (await database.prepare(`
        INSERT INTO users (full_name, email, phone, password_hash, role, seller_status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(fullName, email, phone || null, passwordHash, role === 'seller' ? 'customer' : role, role === 'seller' ? 'pending' : 'none'))
      user = (await getRow<UserRow>('SELECT * FROM users WHERE id = ?', result.lastInsertRowid))!
      }
      if (role === 'seller') await database.prepare('INSERT OR IGNORE INTO buyer_wallets (user_id, balance_cents) VALUES (?, 0)').run(user.id)
      if (role === 'customer') {
        await database.prepare('INSERT INTO buyer_wallets (user_id, balance_cents) VALUES (?, 0)').run(user.id)
        await database.prepare(`
          INSERT INTO notifications (user_id, type, title, body, link)
          SELECT id, 'buyer_signup', ?, ?, ? FROM users WHERE role = 'admin'
        `).run(`New buyer #${user.public_id}`, `${fullName} (${email}) created a buyer profile.`, `/admin/users/${user.id}`)
      }
      if (sellerProfile) {
        if (logoUpload) await database.prepare('INSERT INTO product_images (id, content_type, image) VALUES (?, ?, ?)').run(logoUpload.id, logoUpload.contentType, logoUpload.image)
        await database.prepare(`
          INSERT INTO seller_profiles (user_id, store_name, store_description, logo_url, country, address, city, region, postal_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET store_name=excluded.store_name,store_description=excluded.store_description,logo_url=excluded.logo_url,
            country=excluded.country,address=excluded.address,city=excluded.city,region=excluded.region,postal_code=excluded.postal_code
        `).run(user.id, sellerProfile.storeName, sellerProfile.storeDescription, sellerProfile.storeLogoUrl, sellerProfile.country, sellerProfile.address, sellerProfile.city, sellerProfile.region, sellerProfile.postalCode)
        await database.prepare("UPDATE seller_profiles SET verification_status='pending' WHERE user_id=?").run(user.id)
        await database.prepare("INSERT INTO seller_applications(user_id,status,consented_at,submitted_at,ssn_last4) VALUES (?,'pending',?,?,?)").run(user.id, new Date().toISOString(), new Date().toISOString(), ssnLast4)
        await insertApplicationPhotos(database, user.id, uploadedVerification)
        await database.prepare('DELETE FROM seller_email_verifications WHERE email = ?').run(email)
        await database.prepare("INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'seller_signup', ?, ?, ? FROM users WHERE role = 'admin'").run(`New seller #${user.public_id}`, `${fullName} (${email}) submitted ${sellerProfile.storeName} for verification. Seller access is pending approval.`, `/admin/users/${user.id}`)
      }
      if (role === 'customer') await database.prepare('DELETE FROM seller_email_verifications WHERE email=?').run(email)
      return user
    })()
    registrationCommitted = true
    if (!existingAccount) {
      await createSession(user.id, req, res)
      await database.prepare('INSERT INTO auth_events (user_id, event_type) VALUES (?, ?)').run(user.id, 'registered')
    }
    if (role === 'seller' && sellerProfile) {
      const notifyAdmins = database.prepare(`
        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (?, 'seller_signup', ?, ?, '/messages?view=notifications')
      `)
      const adminIds = (await getRows<{ id: number }>("SELECT id FROM users WHERE role = 'admin'"))
      for (const admin of adminIds) {
        await notifyAdmins.run(
          admin.id,
          `New partner: ${sellerProfile.storeName}`,
          `${fullName} (${email}) applied to join from ${sellerProfile.city}, ${sellerProfile.country}.`,
        )
      }
    }
    const emailNotifications = existingAccount ? {userEmailSent:false,adminEmailSent:false} : await sendAuthNotifications(user, 'registered', (await getSiteName()))
    return res.status(201).json({ user: publicUser(user), emailNotifications })
  } catch (error: unknown) {
    if (!registrationCommitted && uploadedVerification.length) await queuePhotoCleanup(database, uploadedVerification)
    if (getErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' })
    return next(error)
  }
}

app.post('/api/auth/register', authLimiter, registerAccount('customer'))
app.post('/api/auth/register-seller', authLimiter, registerAccount('seller'))
app.post('/api/seller/application', requireAuth, authLimiter, registerAccount('seller', true))

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    const user = (await getRow<UserRow>('SELECT * FROM users WHERE email = ?', email))
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }
    const currentUser = (await getRow<UserRow>('SELECT * FROM users WHERE id = ?', user.id))
    if (!currentUser || currentUser.suspended) return res.status(403).json({ error: 'Your account is suspended. Contact the administrator.' })
    if (req.body.loginType === 'seller' && !['seller', 'admin'].includes(currentUser.role) && !['pending','rejected','needs_changes'].includes(currentUser.seller_status)) return res.status(403).json({ error: 'This account is not a seller account. Use customer login instead.' })

    await createSession(currentUser.id, req, res)
    await database.prepare('INSERT INTO auth_events (user_id, event_type) VALUES (?, ?)').run(currentUser.id, 'login')
    const emailNotifications = await sendAuthNotifications(currentUser, 'login', (await getSiteName()))
    return res.json({ user: publicUser(currentUser), emailNotifications })
  } catch (error: unknown) {
    return next(error)
  }
})

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

app.post('/api/auth/forgot-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (!isEmailConfigured()) return res.status(503).json({ error: 'Password reset email is not configured. Please contact the store administrator.' })
    const configuredUrl = process.env.APP_URL || (process.env.NODE_ENV !== 'production' ? 'http://localhost:5173' : '')
    let appUrl: URL
    try {
      appUrl = new URL(configuredUrl)
      if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || appUrl.pathname !== '/' || appUrl.search || appUrl.hash || (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:')) throw new Error('Invalid APP_URL')
    } catch {
      console.error('Password reset is unavailable: APP_URL must be a valid application origin (HTTPS in production).')
      return res.status(503).json({ error: 'Password reset is not configured. Please contact the store administrator.' })
    }
    const user = (await getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', email))
    const token = randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    if (user) {
      await database.prepare(`
        INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at
      `).run(user.id, tokenHash, new Date(Date.now() + 30 * 60 * 1000).toISOString())
    }
    const resetUrl = user ? `${appUrl.origin}/reset-password#${token}` : null
    const sent = await sendPasswordResetEmail(email, resetUrl, (await getSiteName()))
    if (!sent) {
      if (user) await database.prepare('DELETE FROM password_resets WHERE user_id = ? AND token_hash = ?').run(user.id, tokenHash)
      return res.status(503).json({ error: 'Unable to send the reset email. Please try again later or contact the store administrator.' })
    }
    return res.json({ ok: true })
  } catch (error: unknown) {
    return next(error)
  }
})

app.post('/api/auth/reset-password', passwordResetLimiter, async (req, res, next) => {
  try {
    const token = typeof req.body.token === 'string' ? req.body.token : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' })
    const tokenHash = hashToken(token)
    const reset = (await getRow<{ user_id: number, role: UserRole }>(`
      SELECT r.user_id, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ? AND r.expires_at > ?
    `, tokenHash, new Date().toISOString()))
    if (!reset) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' })
    const minBytes = reset.role === 'admin' ? 12 : 8
    if (Buffer.byteLength(password, 'utf8') < minBytes || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: `Password must be between ${minBytes} and 72 bytes.` })
    const passwordHash = await bcrypt.hash(password, 12)
    const updated = (await database.transaction(async () => {
      const consumed = (await database.prepare('DELETE FROM password_resets WHERE user_id = ? AND token_hash = ? AND expires_at > ?').run(reset.user_id, tokenHash, new Date().toISOString()))
      if (!consumed.changes) return false
      await database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id)
      await database.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id)
      return true
    })())
    if (!updated) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' })
    clearSessionCookie(req, res)
    return res.json({ ok: true })
  } catch (error: unknown) {
    return next(error)
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user!) }))

app.post('/api/auth/logout', async (req, res) => {
  const token = sessionToken(req)
  if (token) await database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  clearSessionCookie(req, res)
  return res.json({ ok: true })
})

app.get('/api/categories', async (_req, res) => {
  const categories = (await getRows<{ name: string }>('SELECT name FROM categories ORDER BY name'))
    .map((row) => row.name)
  return res.json({ categories })
})

app.get('/api/stores', async (_req, res) => {
  const stores = (await getRows<{
    user_id: number
    publicId: string
    full_name: string
    store_name: string
    store_description: string
    logo_url: string
    product_count: number
    image_url: string | null
    follower_count: number
    visitor_count: number
  }>(`
    SELECT users.id AS user_id, users.public_id AS publicId, users.full_name, seller_profiles.store_name,
      seller_profiles.store_description, seller_profiles.logo_url,
      (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_store_published = 1) AS product_count,
      (SELECT image_url FROM products WHERE seller_id = users.id AND is_store_published = 1
        ORDER BY created_at DESC, id DESC LIMIT 1) AS image_url,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles
    JOIN users ON users.id = seller_profiles.user_id
    WHERE users.role = 'seller' AND users.suspended = 0
    ORDER BY seller_profiles.created_at DESC, users.id DESC
  `)).map((store) => ({
    id: store.user_id,
    publicId: store.publicId,
    storeName: store.store_name,
    storeDescription: store.store_description,
    logoUrl: store.logo_url,
    ownerName: store.full_name,
    productCount: store.product_count,
    imageUrl: store.image_url,
    followerCount: store.follower_count,
    visitorCount: store.visitor_count,
  }))
  return res.json({ stores })
})

app.get('/api/stores/:sellerId', async (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Store not found.' })
  const store = (await getRow<{
    user_id: number
    publicId: string
    full_name: string
    store_name: string
    store_description: string
    logo_url: string
    follower_count: number
    visitor_count: number
  }>(`
    SELECT users.id AS user_id, users.public_id AS publicId, users.full_name, seller_profiles.store_name,
      seller_profiles.store_description, seller_profiles.logo_url,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles
    JOIN users ON users.id = seller_profiles.user_id
    WHERE users.id = ? AND users.role = 'seller' AND users.suspended = 0
  `, sellerId))
  if (!store) return res.status(404).json({ error: 'Store not found.' })
  await database.prepare('UPDATE seller_profiles SET visitor_count = visitor_count + 1 WHERE user_id = ?').run(sellerId)
  await database.prepare('INSERT INTO store_daily_visits(seller_id,day,visits) VALUES(?,SUBSTRING(CURRENT_TIMESTAMP,1,10),1) ON CONFLICT(seller_id,day) DO UPDATE SET visits=store_daily_visits.visits+1').run(sellerId)
  store.visitor_count += 1
  const token = sessionToken(req)
  if (token) {
    const visitor = (await getRow<{ id: number }>(`
      SELECT users.id FROM users JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.role = 'customer'
    `, hashToken(token), new Date().toISOString()))
    if (visitor) {
      await database.prepare(`
        INSERT INTO buyer_store_visits (user_id, seller_id) VALUES (?, ?)
        ON CONFLICT(user_id, seller_id) DO UPDATE SET last_visited_at = CURRENT_TIMESTAMP, visit_count = visit_count + 1
      `).run(visitor.id, sellerId)
    }
  }
  const products = (await getRows<ProductRow>(`
    SELECT * FROM products
    WHERE seller_id = ? AND is_store_published = 1
    ORDER BY created_at DESC, id DESC
  `, sellerId)).map(publicProduct)
  return res.json({
    store: {
      id: store.user_id,
      publicId: store.publicId,
      storeName: store.store_name,
      storeDescription: store.store_description,
      logoUrl: store.logo_url,
      ownerName: store.full_name,
      followerCount: store.follower_count,
      visitorCount: store.visitor_count,
    },
    products,
  })
})

app.get('/api/stores/:sellerId/follow', async (req, res) => {
  const sellerId = Number(req.params.sellerId)
  const token = sessionToken(req)
  if (!token) return res.json({ isFollowing: false })
  const session = (await getRow<{ id: number }>(`
    SELECT users.id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, hashToken(token), new Date().toISOString()))
  if (!session) return res.json({ isFollowing: false })
  const isFollowing = Boolean((await getRow<{ user_id: number }>(
    'SELECT user_id FROM store_follows WHERE user_id = ? AND seller_id = ?',
    session.id,
    sellerId,
  )))
  return res.json({ isFollowing })
})

app.post('/api/stores/:sellerId/follow', requireAuth, async (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Store not found.' })
  if (sellerId === req.user!.id) return res.status(400).json({ error: 'You cannot follow your own store.' })
  const store = (await getRow<{ user_id: number }>("SELECT p.user_id FROM seller_profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? AND u.role = 'seller' AND u.suspended = 0", sellerId))
  if (!store) return res.status(404).json({ error: 'Store not found.' })

  const result=await database.transaction(async()=>{
    const existingFollow=await getRow('SELECT user_id FROM store_follows WHERE user_id=? AND seller_id=?',req.user!.id,sellerId)
    const isFollowing=!existingFollow
    if(isFollowing)await database.prepare('INSERT INTO store_follows(user_id,seller_id) VALUES (?,?)').run(req.user!.id,sellerId)
    else await database.prepare('DELETE FROM store_follows WHERE user_id=? AND seller_id=?').run(req.user!.id,sellerId)
    const total=await getRow<{count:number}>(`SELECT p.follower_count+(SELECT COUNT(*) FROM store_follows f WHERE f.seller_id=p.user_id) AS count FROM seller_profiles p WHERE p.user_id=?`,sellerId)
    return {isFollowing,followerCount:total?.count||0}
  })()
  return res.json(result)
})

app.get('/api/seller/store', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const store = (await getRow<{
    store_name: string
    store_description: string
    logo_url: string
    product_count: number
    follower_count: number
    visitor_count: number
  }>(`
    SELECT seller_profiles.store_name, seller_profiles.store_description, seller_profiles.logo_url,
      (SELECT COUNT(*) FROM products WHERE seller_id = seller_profiles.user_id AND is_store_published = 1) AS product_count,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = seller_profiles.user_id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles WHERE user_id = ?
  `,
    req.user!.id,
  ))
  return res.json({ store: store ? {
    storeName: store.store_name,
    storeDescription: store.store_description,
    storeLogoUrl: store.logo_url,
    productCount: store.product_count,
    followerCount: store.follower_count,
    visitorCount: store.visitor_count,
  } : null })
})

app.get('/api/seller/dashboard-metrics', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const record = (await getRow<{ metrics_json: string }>(
    'SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?',
    req.user!.id,
  ))
  let metrics: Record<string, unknown> = {}
  if (record) {
    try {
      metrics = JSON.parse(record.metrics_json) as Record<string, unknown>
    } catch {
      metrics = {}
    }
  }
  return res.json({ metrics })
})

app.put('/api/seller/store', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const storeName = typeof req.body.storeName === 'string' ? req.body.storeName.trim() : ''
  const storeDescription = typeof req.body.storeDescription === 'string' ? req.body.storeDescription.trim() : ''
  const storeLogoUrl = typeof req.body.storeLogoUrl === 'string' ? req.body.storeLogoUrl.trim() : ''
  if (!storeName || storeName.length > 100) return res.status(400).json({ error: 'Store name is required and must be under 100 characters.' })
  if (storeDescription.length > 500) return res.status(400).json({ error: 'Store description must be under 500 characters.' })
  if (storeLogoUrl.length > 2000) return res.status(400).json({ error: 'Store logo URL must be under 2000 characters.' })
  if (storeLogoUrl && !await isValidStoreLogoUrl(storeLogoUrl)) {
    return res.status(400).json({ error: 'Enter a valid store logo URL.' })
  }

  const existingStore = (await getRow<{ user_id: number }>('SELECT user_id FROM seller_profiles WHERE user_id = ?', req.user!.id))
  if (existingStore) {
    await database.prepare('UPDATE seller_profiles SET store_name = ?, store_description = ?, logo_url = ? WHERE user_id = ?')
      .run(storeName, storeDescription, storeLogoUrl, req.user!.id)
  } else {
    await database.prepare(`
      INSERT INTO seller_profiles (user_id, store_name, store_description, logo_url, country, address, city, region, postal_code)
      VALUES (?, ?, ?, ?, '', '', '', '', '')
    `).run(req.user!.id, storeName, storeDescription, storeLogoUrl)
  }
  return res.json({ store: { storeName, storeDescription, storeLogoUrl } })
})

app.get('/api/seller/categories', requireAuth, requireRole('seller', 'admin'), async (_req, res) => {
  const categories = (await getRows<CategoryRow>('SELECT id, name FROM categories ORDER BY name'))
  return res.json({ categories })
})

app.post('/api/seller/categories', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 60) return res.status(400).json({ error: 'Category name is required and must be under 60 characters.' })

  try {
    const result = (await database.prepare('INSERT INTO categories (name, created_by) VALUES (?, ?)').run(name, req.user!.id))
    const category = (await getRow<CategoryRow>('SELECT id, name FROM categories WHERE id = ?', result.lastInsertRowid))
    return res.status(201).json({ category })
  } catch (error: unknown) {
    if (getErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That category already exists.' })
    throw error
  }
})

app.delete('/api/seller/categories/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const categoryId = Number(req.params.id)
  const category = (await getRow<CategoryRow>('SELECT id, name FROM categories WHERE id = ?', categoryId))
  if (!category) return res.status(404).json({ error: 'Category not found.' })
  const productCount = (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE category = ?', category.name))?.count ?? 0
  if (productCount) return res.status(409).json({ error: 'Move or delete products in this category before removing it.' })
  await database.prepare('DELETE FROM categories WHERE id = ?').run(categoryId)
  return res.json({ ok: true })
})

app.get('/api/products', async (req, res) => {
  const search = typeof req.query.q === 'string' ? `%${req.query.q.trim()}%` : '%'
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  const products = (await getRows<ProductRow>(`
    SELECT * FROM products
    WHERE is_published = 1 AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND name LIKE ? AND (? = '' OR category = ? OR position(? || ' / ' in category) = 1)
    ORDER BY created_at DESC, id DESC
  `, search, category, category, category)).map(publicProduct)
  return res.json({ products })
})

app.get('/api/discounts', async (_req, res) => {
  const products = (await getRows<ProductRow>(`
    SELECT * FROM products
    WHERE is_published = 1 AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND compare_at_price IS NOT NULL AND compare_at_price > price
    ORDER BY created_at DESC, id DESC
  `)).map(publicProduct)
  return res.json({ products })
})

app.get('/api/products/:id', async (req, res) => {
  const product = (await getRow<ProductRow>(`SELECT * FROM products
    WHERE id = ? AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND (is_published = 1 OR is_store_published = 1)
  `, Number(req.params.id)))
  if (!product) return res.status(404).json({ error: 'Product not found.' })
  const seller = product.seller_id ? (await getRow<{
    store_name: string
    logo_url: string
    full_name: string
    follower_count: number
    visitor_count: number
  }>(`
    SELECT seller_profiles.store_name, seller_profiles.logo_url, users.full_name,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles
    JOIN users ON users.id = seller_profiles.user_id
    WHERE users.id = ?
  `, product.seller_id)) : undefined
  const parentCategory = product.category.split(' / ')[0]
  const relatedProducts = (await getRows<ProductRow>(`
    SELECT * FROM products
    WHERE id != ? AND seller_id IS NOT NULL AND is_published = 1 AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\'))
      AND (category = ? OR substr(category, 1, length(?) + 3) = ? || ' / ')
    ORDER BY CASE WHEN category = ? THEN 0 ELSE 1 END, created_at DESC, id DESC
    LIMIT 8
  `, product.id, parentCategory, parentCategory, parentCategory, product.category)).map(publicProduct)
  return res.json({
    product: {
      ...publicProduct(product),
      sellerReportedStock: (await getRow<{ quantity: number }>('SELECT quantity FROM seller_product_stock WHERE product_id = ?', product.id))?.quantity ?? null,
    },
    store: seller ? {
      id: product.seller_id,
      storeName: seller.store_name,
      logoUrl: seller.logo_url,
      ownerName: seller.full_name,
      followerCount: seller.follower_count,
      visitorCount: seller.visitor_count,
      productCount: (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE seller_id = ? AND is_store_published = 1', product.seller_id))?.count ?? 0,
    } : null,
    relatedProducts,
  })
})

app.get('/api/seller/products', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const products = req.user!.role === 'admin'
    ? (await getRows<ProductRow>('SELECT * FROM products ORDER BY created_at DESC, id DESC'))
    : (await getRows<ProductRow>('SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC, id DESC', req.user!.id))
  return res.json({ products: products.map(publicProduct) })
})

app.post('/api/seller/products', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const prepared = prepareProductImages(req.body ?? {})
  if ('error' in prepared) return res.status(400).json({ error: prepared.error })
  const validation = (await validateProduct(prepared.body, new Set(prepared.uploads.map((image) => image.id))))
  if ('error' in validation) return res.status(400).json({ error: validation.error })
  const stock: unknown = req.body.stockQuantity
  if (stock !== undefined && stock !== null && (typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000000)) return res.status(400).json({ error: 'Enter a whole stock count between 0 and 1,000,000,000.' })
  const { name, category, price, compareAtPrice, description, imageUrl, imageUrls, colors, sizes, rating, isPublished, isStorePublished } = validation.product
  const productId = (await database.transaction(async () => {
    const insertImage = database.prepare('INSERT INTO product_images (id, content_type, image) VALUES (?, ?, ?)')
    for (const image of prepared.uploads) await insertImage.run(image.id, image.contentType, image.image)
    const result = (await database.prepare(`
      INSERT INTO products (name, category, price, compare_at_price, description, image_url, image_urls_json, colors_json, sizes_json, rating, seller_id, is_published, is_store_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, category, price, compareAtPrice, description, imageUrl, JSON.stringify(imageUrls), JSON.stringify(colors), JSON.stringify(sizes), rating, req.user!.id, Number(isPublished), Number(isStorePublished)))
    if (typeof stock === 'number') await database.prepare('INSERT INTO seller_product_stock (product_id, quantity) VALUES (?, ?)').run(result.lastInsertRowid, stock)
    await insertCategory.run(category)
    return result.lastInsertRowid
  })())
  const product = (await getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId))!
  return res.status(201).json({ product: publicProduct(product) })
})

app.patch('/api/seller/products/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const productId = Number(req.params.id)
  const existing = (await getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId))
  if (!existing) return res.status(404).json({ error: 'Product not found.' })
  if (req.user!.role !== 'admin' && existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own products.' })

  const prepared = prepareProductImages({
    name: req.body.name ?? existing.name,
    category: req.body.category ?? existing.category,
    price: req.body.price ?? existing.price,
    compareAtPrice: req.body.compareAtPrice !== undefined ? req.body.compareAtPrice : existing.compare_at_price,
    description: req.body.description ?? existing.description,
    imageUrl: req.body.imageUrl ?? existing.image_url,
    imageUrls: req.body.imageUrls ?? parseStringArray(existing.image_urls_json),
    colors: req.body.colors ?? parseStringArray(existing.colors_json),
    sizes: req.body.sizes ?? parseStringArray(existing.sizes_json),
    rating: req.body.rating ?? existing.rating,
    isPublished: req.body.isPublished ?? Boolean(existing.is_published),
    isStorePublished: req.body.isStorePublished ?? Boolean(existing.is_store_published),
    imageUploads: req.body.imageUploads,
  })
  if ('error' in prepared) return res.status(400).json({ error: prepared.error })
  const validation = (await validateProduct(prepared.body, new Set(prepared.uploads.map((image) => image.id))))
  if ('error' in validation) return res.status(400).json({ error: validation.error })
  const stock: unknown = req.body.stockQuantity
  if (stock !== undefined && stock !== null && (typeof stock !== 'number' || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000000)) return res.status(400).json({ error: 'Enter a whole stock count between 0 and 1,000,000,000.' })
  if (stock !== undefined && existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'Only the product owner can update its stock count.' })
  const { name, category, price, compareAtPrice, description, imageUrl, imageUrls, colors, sizes, rating, isPublished, isStorePublished } = validation.product
  await database.transaction(async () => {
    const insertImage = database.prepare('INSERT INTO product_images (id, content_type, image) VALUES (?, ?, ?)')
    for (const image of prepared.uploads) await insertImage.run(image.id, image.contentType, image.image)
    await database.prepare(`
      UPDATE products SET name = ?, category = ?, price = ?, compare_at_price = ?, description = ?, image_url = ?, image_urls_json = ?, colors_json = ?, sizes_json = ?, rating = ?, is_published = ?, is_store_published = ?
      WHERE id = ?
    `).run(name, category, price, compareAtPrice, description, imageUrl, JSON.stringify(imageUrls), JSON.stringify(colors), JSON.stringify(sizes), rating, Number(isPublished), Number(isStorePublished), productId)
    if (stock === null) await database.prepare('DELETE FROM seller_product_stock WHERE product_id = ?').run(productId)
    else if (typeof stock === 'number') await database.prepare('INSERT INTO seller_product_stock (product_id, quantity) VALUES (?, ?) ON CONFLICT(product_id) DO UPDATE SET quantity=excluded.quantity').run(productId, stock)
    await insertCategory.run(category)
  })()
  return res.json({ product: publicProduct((await getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId))!) })
})

app.delete('/api/seller/products/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const productId = Number(req.params.id)
  const existing = (await getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId))
  if (!existing) return res.status(404).json({ error: 'Product not found.' })
  if (req.user!.role !== 'admin' && existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own products.' })
  await database.prepare('DELETE FROM products WHERE id = ?').run(productId)
  return res.json({ ok: true })
})


await seedWarehouseSamples(database)

app.get('/api/warehouse', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const page = Math.max(1, Math.min(100000, Math.floor(Number(req.query.page) || 1)))
  const pageSize = 24
  const search = String(req.query.q || '').trim().slice(0, 200)
  const category = String(req.query.category || '').trim().slice(0, 200)
  const where = `WHERE (? = '' OR position(lower(?) in lower(product_name || ' ' || category_path)) > 0)
    AND (? = '' OR category_path = ? OR position(? || ' / ' in category_path) = 1)`
  const params = [search, search, category, category, category]
  const [totalRow, rows, categories, completeRow, importedRow] = await Promise.all([
    getRow<{count:number}>(`SELECT COUNT(*) AS count FROM warehouse_products ${where}`, ...params),
    getRows<{id:number,public_id:string,product_json:string,created_at:string}>(`SELECT id,public_id,(product_json::jsonb - 'sourceDetails')::text AS product_json,created_at FROM warehouse_products ${where} ORDER BY id DESC LIMIT ? OFFSET ?`, ...params,pageSize,(page-1)*pageSize),
    getRows<{category:string,count:number}>(`SELECT category_path AS category,COUNT(*) AS count FROM warehouse_products GROUP BY category_path ORDER BY category`),
    getRow('SELECT 1 FROM schema_migrations WHERE name=?','shopyggful_catalog_2026_11_14_v1'),
    getRow<{count:number}>("SELECT COUNT(*) AS count FROM warehouse_products WHERE source_host='shopyggful.shop'"),
  ])
  const copies = rows.length ? await getRows<{warehouse_id:number,product_id:number}>(`SELECT warehouse_id,product_id FROM seller_warehouse_imports WHERE seller_id=? AND warehouse_id IN (${rows.map(()=>'?').join(',')})`,req.user!.id,...rows.map(row=>row.id)) : []
  const importedIds = new Map(copies.map(copy=>[copy.warehouse_id,copy.product_id]))
  return res.json({ products: rows.map(row=>({...JSON.parse(row.product_json),id:row.id,publicId:row.public_id,createdAt:row.created_at,storeProductId:importedIds.get(row.id)||null})),categories,total:totalRow!.count,page,pageSize,catalogImport:{complete:Boolean(completeRow),imported:importedRow!.count} })
})

app.get('/api/warehouse/:id', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const row = await getRow<{ id: number, public_id: string, product_json: string }>('SELECT id,public_id,product_json FROM warehouse_products WHERE id=?', Number(req.params.id))
  if (!row) return res.status(404).json({ error: 'Warehouse product not found.' })
  return res.json({ product: { ...JSON.parse(row.product_json), id: row.id, publicId: row.public_id } })
})

app.get('/api/warehouse/:id/quote',requireAuth,requireRole('seller','admin'),async(req,res)=>{
  res.set('Cache-Control','private, no-store')
  const row=await getRow<{product_json:string}>("SELECT (product_json::jsonb - 'sourceDetails')::text AS product_json FROM warehouse_products WHERE id=?",Number(req.params.id))
  if(!row)return res.status(404).json({error:'Warehouse product not found.'})
  const product=JSON.parse(row.product_json),pricing=warehousePricing(product.price)
  if(!pricing)return res.status(400).json({error:'This warehouse product needs a valid retail price before publishing.'})
  const copy=await getRow<{product_id:number}>('SELECT product_id FROM seller_warehouse_imports WHERE seller_id=? AND warehouse_id=?',req.user!.id,Number(req.params.id))
  return res.json({product:{id:Number(req.params.id),name:product.name,category:product.category,imageUrl:product.imageUrl},pricing,storeProductId:copy?.product_id||null})
})

app.post('/api/admin/warehouse', requireAuth, requireRole('admin'), async (req, res) => {
  const prepared = prepareProductImages(req.body ?? {})
  if ('error' in prepared) return res.status(400).json({ error: prepared.error })
  const result = await validateProduct(prepared.body, new Set(prepared.uploads.map((image) => image.id)))
  if ('error' in result) return res.status(400).json({ error: result.error })
  const inserted = await database.transaction(async () => {
    for (const image of prepared.uploads) await database.prepare('INSERT INTO product_images (id, content_type, image) VALUES (?, ?, ?)').run(image.id, image.contentType, image.image)
    return database.prepare('INSERT INTO warehouse_products (product_json) VALUES (?)').run(JSON.stringify(result.product))
  })()
  return res.status(201).json({ product: { ...result.product, id: Number(inserted.lastInsertRowid) } })
})

app.put('/api/admin/warehouse/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const existing = await getRow<{ product_json: string }>('SELECT product_json FROM warehouse_products WHERE id=?', Number(req.params.id))
  if (!existing) return res.status(404).json({ error: 'Warehouse product not found.' })
  const saved = JSON.parse(existing.product_json)
  const prepared = prepareProductImages(req.body ?? {})
  if ('error' in prepared) return res.status(400).json({ error: prepared.error })
  const result = await validateProduct(prepared.body, new Set(prepared.uploads.map((image) => image.id)))
  if ('error' in result) return res.status(400).json({ error: result.error })
  const updated = await database.transaction(async () => {
    const record = await database.prepare('UPDATE warehouse_products SET product_json=? WHERE id=?').run(JSON.stringify({ ...result.product, ...(saved.sourceDetails ? { sourceDetails: saved.sourceDetails, source: saved.source } : {}) }), Number(req.params.id))
    if (!record.changes) return record
    for (const image of prepared.uploads) await database.prepare('INSERT INTO product_images (id, content_type, image) VALUES (?, ?, ?)').run(image.id, image.contentType, image.image)
    return record
  })()
  if (!updated.changes) return res.status(404).json({ error: 'Warehouse product not found.' })
  return res.json({ product: { ...result.product, id: Number(req.params.id) } })
})

app.delete('/api/admin/warehouse/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const removed = (await database.prepare('DELETE FROM warehouse_products WHERE id=?').run(Number(req.params.id)))
  if (!removed.changes) return res.status(404).json({ error: 'Warehouse product not found.' })
  return res.json({ ok: true })
})

app.post('/api/seller/warehouse/:id/import', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const row = (await getRow<{ product_json: string }>('SELECT product_json FROM warehouse_products WHERE id=?', Number(req.params.id)))
  if (!row) return res.status(404).json({ error: 'Warehouse product not found.' })
  if ((await getRow('SELECT 1 FROM seller_warehouse_imports WHERE seller_id=? AND warehouse_id=?', req.user!.id, Number(req.params.id)))) return res.status(409).json({ error: 'You already added this warehouse product. Edit it in Store products.' })
  const source = JSON.parse(row.product_json),publish=req.body?.publish===true,pricing=warehousePricing(source.price)
  if(publish&&(!pricing||!Number.isSafeInteger(req.body.expectedRetailCents)||req.body.pricingVersion!==pricing.version))return res.status(400).json({error:'Review a current price quote before publishing this product.'})
  if(publish&&req.body.expectedRetailCents!==pricing!.retailCents)return res.status(409).json({error:'The warehouse price changed. Refresh the price and confirm again.',priceChanged:true})
  const overrides = publish ? {price:pricing!.retailCents/100,compareAtPrice:source.compareAtPrice>pricing!.retailCents/100?source.compareAtPrice:null,isPublished:true,isStorePublished:true} : req.body?.overrides && typeof req.body.overrides === 'object' ? req.body.overrides : {}
  const prepared = prepareProductImages({ ...source, ...overrides })
  if ('error' in prepared) return res.status(400).json({ error: prepared.error })
  const validation = (await validateProduct(prepared.body, new Set(prepared.uploads.map((image) => image.id))))
  if ('error' in validation) return res.status(400).json({ error: validation.error })
  const { name, category, price, compareAtPrice, description, imageUrl, imageUrls, colors, sizes, rating, isPublished, isStorePublished } = validation.product
  let duplicate=false,priceChanged=false
  const productId = (await database.transaction(async () => {
    if(await getRow('SELECT 1 FROM seller_warehouse_imports WHERE seller_id=? AND warehouse_id=?',req.user!.id,Number(req.params.id))){duplicate=true;return 0}
    if(publish){
      const current=await getRow<{product_json:string}>('SELECT product_json FROM warehouse_products WHERE id=?',Number(req.params.id))
      if(!current||warehousePricing(JSON.parse(current.product_json).price)?.retailCents!==req.body.expectedRetailCents){priceChanged=true;return 0}
    }
    for (const image of prepared.uploads) await database.prepare('INSERT INTO product_images(id,content_type,image) VALUES (?,?,?)').run(image.id, image.contentType, image.image)
    const result = (await database.prepare(`
      INSERT INTO products (name, category, price, compare_at_price, description, image_url, image_urls_json, colors_json, sizes_json, rating, seller_id, is_published, is_store_published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, category, price, compareAtPrice, description, imageUrl, JSON.stringify(imageUrls), JSON.stringify(colors), JSON.stringify(sizes), rating, req.user!.id, Number(isPublished), Number(isStorePublished)))
    await database.prepare('INSERT INTO seller_warehouse_imports (seller_id,warehouse_id,product_id) VALUES (?,?,?)').run(req.user!.id, Number(req.params.id), result.lastInsertRowid)
    await insertCategory.run(category)
    return result.lastInsertRowid
  })())
  if(duplicate)return res.status(409).json({error:'You already added this warehouse product. Edit it in Store products.'})
  if(priceChanged)return res.status(409).json({error:'The warehouse price changed. Refresh the price and confirm again.',priceChanged:true})
  return res.status(201).json({ pricing:publish?pricing:undefined,product: publicProduct((await getRow<ProductRow>('SELECT * FROM products WHERE id=?', productId))!) })
})

app.get('/api/seller/stock', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const stock = (await getRows<{ productId: number, quantity: number }>('SELECT s.product_id AS productId,s.quantity FROM seller_product_stock s JOIN products p ON p.id=s.product_id WHERE p.seller_id=?', req.user!.id))
  return res.json({ stock })
})

app.put('/api/seller/products/:id/stock', requireAuth, requireRole('seller', 'admin'), async (req, res) => {
  const product = (await getRow<ProductRow>('SELECT * FROM products WHERE id=?', Number(req.params.id)))
  if (!product || product.seller_id !== req.user!.id) return res.status(404).json({ error: 'Product not found.' })
  const quantity: unknown = req.body?.quantity
  if (!Number.isSafeInteger(quantity) || typeof quantity !== 'number' || quantity < 0 || quantity > 1000000000) return res.status(400).json({ error: 'Enter a whole stock count between 0 and 1,000,000,000.' })
  await database.prepare('INSERT INTO seller_product_stock (product_id,quantity) VALUES (?,?) ON CONFLICT(product_id) DO UPDATE SET quantity=excluded.quantity').run(product.id, quantity)
  return res.json({ quantity })
})

const getConversationMessages = async (sellerId: number, currentUserId: number) => {
  await database.prepare(`
    UPDATE messages SET read_at = CURRENT_TIMESTAMP
    WHERE conversation_seller_id = ? AND recipient_id = ? AND read_at IS NULL
  `).run(sellerId, currentUserId)
  return (await getRows<{
    id: number
    sender_id: number
    sender_name: string
    sender_role: UserRole
    body: string
    created_at: string
    read_at: string | null
  }>(`
    SELECT messages.id, messages.sender_id, users.full_name AS sender_name,
      users.role AS sender_role, messages.body, messages.created_at, messages.read_at
    FROM messages
    JOIN users ON users.id = messages.sender_id
    WHERE messages.conversation_seller_id = ?
    ORDER BY messages.id
  `, sellerId)).map((message) => ({
    id: message.id,
    body: message.body,
    senderName: message.sender_name,
    senderRole: message.sender_role,
    isMine: message.sender_id === currentUserId,
    isRead: Boolean(message.read_at),
    createdAt: message.created_at,
  }))
}

app.get('/api/rewards', requireAuth, requireRole('customer','seller'),async(req,res)=>{
 const credit=(await getRow<{amount:number}>('SELECT balance_units AS amount FROM reward_balances WHERE user_id=?',req.user!.id))?.amount||0
 const hold=(await getRow<{amount:number}>('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?',req.user!.id))?.amount||0
 const merchant=req.user!.role==='seller'?await getRow<{balance_cents:number,reserved_cents:number}>('SELECT balance_cents,reserved_cents FROM seller_wallets WHERE seller_id=?',req.user!.id):null
 const balanceUnits=credit+(merchant?.balance_cents||0),reservedUnits=hold+(merchant?.reserved_cents||0)
 return res.set('Cache-Control','no-store').json({balanceUnits,availableUnits:Math.max(0,balanceUnits-reservedUnits),reservedUnits})
})

app.patch('/api/admin/users/:id/rewards', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  const adjustmentUnits = req.body?.adjustmentUnits
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : ''
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(adjustmentUnits) || adjustmentUnits === 0 || !reason || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a valid reward adjustment and a reason (up to 500 characters).' })
  }
  const user = (await getRow<{ role: UserRole }>("SELECT role FROM users WHERE id = ? AND role IN ('customer', 'seller')", userId))
  if (!user) return res.status(404).json({ error: 'Account not found.' })
  const balanceUnits = (await database.transaction(async () => {
    const balance = (await getRow<{ balance_units: number }>('SELECT balance_units FROM reward_balances WHERE user_id = ?', userId))?.balance_units ?? 0
    const next = balance + adjustmentUnits
    const held=(await getRow<{amount:number}>('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?',userId))?.amount||0
    if (!Number.isSafeInteger(next) || next < held || next > 10000000000) return null
    await database.prepare('INSERT INTO reward_balances (user_id, balance_units) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET balance_units = excluded.balance_units').run(userId, next)
    await database.prepare('INSERT INTO reward_history (user_id, admin_id, adjustment_units, balance_units, reason) VALUES (?, ?, ?, ?, ?)').run(userId, req.user!.id, adjustmentUnits, next, reason)
    const amount = (Math.abs(adjustmentUnits) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    await database.prepare('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)').run(userId, adjustmentUnits > 0 ? 'reward' : 'reward_adjustment', adjustmentUnits > 0 ? 'Balance added' : 'Balance updated', `$${amount} ${adjustmentUnits > 0 ? 'added to' : 'removed from'} your store-credit balance.`, user.role === 'seller' ? '/seller' : '/profile')
    return next
  })())
  if (balanceUnits === null) return res.status(400).json({ error: 'The resulting balance must be between $0 and $100,000,000.' })
  return res.json({ balanceUnits })
})

app.get('/api/notifications', requireAuth, async (req, res) => {
  const notifications = (await getRows<{
    id: number
    type: string
    title: string
    body: string
    link: string
    read_at: string | null
    created_at: string
  }>(`
    SELECT id, type, title, body, link, read_at, created_at
    FROM notifications WHERE user_id = ?
    ORDER BY id DESC LIMIT 100
  `, req.user!.id)).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    isRead: Boolean(notification.read_at),
    createdAt: notification.created_at,
  }))
  const unreadCount = (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL', req.user!.id))!.count
  return res.json({ notifications, unreadCount })
})

app.patch('/api/notifications/read-all', requireAuth, async (req, res) => {
  await database.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL')
    .run(req.user!.id)
  return res.json({ ok: true })
})

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  const notificationId = Number(req.params.id)
  if (!Number.isSafeInteger(notificationId)) return res.status(404).json({ error: 'Notification not found.' })
  const notification = (await getRow<{ id: number }>('SELECT id FROM notifications WHERE id = ? AND user_id = ?', notificationId, req.user!.id))
  if (!notification) return res.status(404).json({ error: 'Notification not found.' })
  await database.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?')
    .run(notificationId)
  return res.json({ ok: true })
})

app.get('/api/messages', requireAuth, async (req, res) => {
  if (req.user!.role === 'admin') {
    const conversations = (await getRows<{
      seller_id: number
      full_name: string
      email: string
      store_name: string | null
      last_body: string | null
      last_created_at: string | null
      unread_count: number
    }>(`
      SELECT users.id AS seller_id, users.full_name, users.email, seller_profiles.store_name,
        (SELECT body FROM messages WHERE conversation_seller_id = users.id ORDER BY id DESC LIMIT 1) AS last_body,
        (SELECT created_at FROM messages WHERE conversation_seller_id = users.id ORDER BY id DESC LIMIT 1) AS last_created_at,
        (SELECT COUNT(*) FROM messages WHERE conversation_seller_id = users.id AND recipient_id = ? AND read_at IS NULL) AS unread_count
      FROM users
      LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
      WHERE users.role IN ('seller', 'customer')
      ORDER BY (SELECT MAX(id) FROM messages WHERE conversation_seller_id = users.id) DESC, users.id DESC
    `, req.user!.id)).map((conversation) => ({
      sellerId: conversation.seller_id,
      sellerName: conversation.full_name,
      email: conversation.email,
      storeName: conversation.store_name,
      lastMessage: conversation.last_body,
      lastMessageAt: conversation.last_created_at,
      unreadCount: conversation.unread_count,
    }))
    return res.json({ conversations })
  }

  const messages = (await getConversationMessages(req.user!.id, req.user!.id))
  return res.json({ messages })
})

app.get('/api/messages/:sellerId', requireAuth, async (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Conversation not found.' })
  if (req.user!.role !== 'admin' && sellerId !== req.user!.id) return res.status(403).json({ error: 'You can only view your own conversation.' })
  const seller = (await getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role IN ('seller', 'customer')", sellerId))
  if (!seller) return res.status(404).json({ error: 'Seller not found.' })
  return res.json({ messages: (await getConversationMessages(sellerId, req.user!.id)) })
})

app.post('/api/messages', requireAuth, async (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be between 1 and 4000 characters.' })

  let sellerId: number
  let recipientId: number
  let recipient: UserRow | undefined
  if (req.user!.role === 'admin') {
    sellerId = Number(req.body.sellerId)
    recipient = (await getRow<UserRow>("SELECT * FROM users WHERE id = ? AND role IN ('seller', 'customer')", sellerId))
    if (!recipient) return res.status(404).json({ error: 'Seller not found.' })
    recipientId = recipient.id
  } else {
    sellerId = req.user!.id
    recipient = (await getRow<UserRow>("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"))
    if (!recipient) return res.status(503).json({ error: 'The admin inbox is not available yet.' })
    recipientId = recipient.id
  }

  const result = (await database.prepare(`
    INSERT INTO messages (conversation_seller_id, sender_id, recipient_id, body)
    VALUES (?, ?, ?, ?)
  `).run(sellerId, req.user!.id, recipientId, body))
  await database.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link)
    VALUES (?, 'message', ?, ?, ?)
  `).run(recipientId, `New message from ${req.user!.full_name}`, body.slice(0, 180), req.user!.role === 'admin' ? '/messages' : `/messages?user=${sellerId}`)
  return res.status(201).json({
    message: {
      id: Number(result.lastInsertRowid),
      body,
      senderName: req.user!.full_name,
      senderRole: req.user!.role,
      isMine: true,
      createdAt: new Date().toISOString(),
    },
  })
})

const buyerCoins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const buyerAddresses = async (userId: number) => (await getRows<{
  id: number, fullName: string, phone: string, address: string, city: string,
  region: string, postalCode: string, country: string, isDefault: number
}>(`
  SELECT id, full_name AS fullName, phone, address, city, region, postal_code AS postalCode,
    country, is_default AS isDefault FROM buyer_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC
`, userId))

const buyerVisits = async (userId: number) => (await getRows<{ sellerId: number, storeName: string, visitCount: number, lastVisitedAt: string }>(`
  SELECT v.seller_id AS sellerId, COALESCE(p.store_name, u.full_name || ' (store unavailable)') AS storeName, v.visit_count AS visitCount,
    v.last_visited_at AS lastVisitedAt FROM buyer_store_visits v
  JOIN users u ON u.id = v.seller_id LEFT JOIN seller_profiles p ON p.user_id = v.seller_id
  WHERE v.user_id = ? ORDER BY v.last_visited_at DESC
`, userId))

const requestReceipts = async (requestId: number) => (await getRows<{ id: number, coin: string, network: string, walletAddress: string, createdAt: string }>(`
  SELECT id, coin, network, wallet_address AS walletAddress, created_at AS createdAt
  FROM buyer_request_receipts WHERE request_id = ? ORDER BY id DESC
`, requestId))

const walletRequests = async (userId?: number) => (await Promise.all((await getRows<{
  id: number, userId: number, fullName: string, email: string, kind: string, coin: string,
  amountCents: number | null, destination: string, status: string, instructions: string,
  paymentCoin: string, walletAddress: string, network: string, createdAt: string
}>(`
  SELECT r.id, r.user_id AS userId, u.public_id AS publicId, u.full_name AS fullName, u.email, r.kind, r.coin,
    r.amount_cents AS amountCents, r.destination, r.status, r.instructions,
    r.payment_coin AS paymentCoin, r.wallet_address AS walletAddress, r.network, r.created_at AS createdAt
  FROM buyer_wallet_requests r JOIN users u ON u.id = r.user_id
  WHERE (? IS NULL OR r.user_id = ?) ORDER BY r.id DESC
`, userId ?? null, userId ?? null)).map(async (request) => ({ ...request, receipts: (await requestReceipts(request.id)) }))))

app.get('/api/buyer/profile', requireAuth, requireRole('customer'), async (req, res) => {
  res.set('Cache-Control','private, no-store')
  const userId=req.user!.id
  const [wallet,requests,follows,security,favoriteRows,addresses,visits]=await Promise.all([
    getRow<{balanceCents:number,heldCents:number,availableCents:number}>('SELECT balance_units AS balanceCents,COALESCE((SELECT amount_cents FROM buyer_wallet_holds WHERE user_id=?),0) AS heldCents,balance_units-COALESCE((SELECT amount_cents FROM buyer_wallet_holds WHERE user_id=?),0) AS availableCents FROM reward_balances WHERE user_id=?',userId,userId,userId),
    walletRequests(userId),
    getRows<{sellerId:number,storeName:string,logoUrl:string,storeDescription:string,productCount:number,followerCount:number}>(`
      SELECT p.user_id AS sellerId,p.store_name AS storeName,p.logo_url AS logoUrl,p.store_description AS storeDescription,
        (SELECT COUNT(*) FROM products item WHERE item.seller_id=p.user_id AND item.is_store_published=1) AS productCount,
        p.follower_count+(SELECT COUNT(*) FROM store_follows follower WHERE follower.seller_id=p.user_id) AS followerCount
      FROM store_follows f JOIN seller_profiles p ON p.user_id=f.seller_id JOIN users u ON u.id=p.user_id
      WHERE f.user_id=? AND u.suspended=0 AND u.role='seller' ORDER BY f.created_at DESC,p.user_id DESC`,userId),
    getRow('SELECT user_id FROM transaction_security WHERE user_id=?',userId),
    getRows<ProductRow>('SELECT p.* FROM products p JOIN buyer_favorites f ON f.product_id=p.id WHERE f.user_id=? AND EXISTS (SELECT 1 FROM users u WHERE u.id=p.seller_id AND u.suspended=0) ORDER BY f.created_at DESC',userId),
    buyerAddresses(userId),buyerVisits(userId),
  ])
  return res.json({user:publicUser(req.user!),wallet:wallet||{balanceCents:0},addresses,visits,requests,follows,coins:buyerCoins,favorites:favoriteRows.map(publicProduct),hasTransactionPin:Boolean(security)})
})

app.get('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Invalid product ID.' })
  return res.json({ isFavorite: Boolean((await getRow('SELECT product_id FROM buyer_favorites WHERE user_id = ? AND product_id = ?', req.user!.id, id))) })
})
app.put('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || !(await getRow('SELECT id FROM products WHERE id = ? AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND (is_published = 1 OR is_store_published = 1)', id))) return res.status(404).json({ error: 'Product not found.' })
  await database.prepare('INSERT OR IGNORE INTO buyer_favorites (user_id, product_id) VALUES (?, ?)').run(req.user!.id, id)
  return res.json({ ok: true })
})
app.delete('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Invalid product ID.' })
  await database.prepare('DELETE FROM buyer_favorites WHERE user_id = ? AND product_id = ?').run(req.user!.id, id)
  return res.json({ ok: true })
})

app.patch('/api/buyer/account', requireAuth, requireRole('customer'), async (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : ''
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
  if (!fullName || fullName.length > 100 || phone.length > 30) return res.status(400).json({ error: 'Enter a name up to 100 characters and a phone number up to 30 characters.' })
  const updated = await database.prepare("UPDATE users SET full_name = ?, phone = ? WHERE id = ? AND seller_status NOT IN ('pending','needs_changes','rejected')").run(fullName, phone || null, req.user!.id)
  if (!updated.changes) return res.status(409).json({error:'Your seller verification is in progress. Submit contact corrections through your seller application when changes are requested.'})
  return res.json({ user: publicUser((await getRow<UserRow>('SELECT * FROM users WHERE id = ?', req.user!.id))!) })
})

app.put('/api/buyer/password', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : ''
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : ''
  if (Buffer.byteLength(next) < 8 || Buffer.byteLength(next) > 72) return res.status(400).json({ error: 'New password must be between 8 and 72 bytes.' })
  if (!await bcrypt.compare(current, req.user!.password_hash)) return res.status(400).json({ error: 'Current login password is incorrect.' })
  const hash = await bcrypt.hash(next, 12)
  await database.transaction(async () => {
    await database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id)
    await database.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user!.id, req.sessionTokenHash)
    await database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(req.user!.id)
  })()
  return res.json({ ok: true })
})

app.put('/api/buyer/transaction-password', requireAuth, requireRole('customer'), (_req,res)=>res.status(410).json({error:'Use the four-digit transaction PIN settings in Setup.'}))

app.post('/api/buyer/cancellation-request', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!await bcrypt.compare(password, req.user!.password_hash)) return res.status(400).json({ error: 'Login password is incorrect.' })
  if ((await getRow("SELECT id FROM cancellation_requests WHERE user_id = ? AND status = 'pending'", req.user!.id))) return res.status(409).json({ error: 'You already have a pending cancellation request.' })
  await database.transaction(async () => {
    await database.prepare('INSERT INTO cancellation_requests (user_id) VALUES (?)').run(req.user!.id)
    await database.prepare("INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'cancellation', ?, ?, ? FROM users WHERE role = 'admin'").run('Account cancellation requested', `${req.user!.full_name} (#${req.user!.public_id}) requested account cancellation.`, `/admin/users/${req.user!.id}`)
  })()
  return res.status(201).json({ ok: true })
})

const demoOrders = async (userId: number) => (await Promise.all((await getRows<{ id: number, orderNumber: number, status: string, totalCents: number, createdAt: string, billingJson: string, paymentMethod: string }>(
  "SELECT d.id, n.number AS orderNumber, d.status, d.total_cents AS totalCents, d.created_at AS createdAt, d.billing_json AS billingJson, d.payment_method AS paymentMethod FROM demo_orders d JOIN order_numbers n ON n.kind = 'demo' AND n.order_id = d.id WHERE d.user_id = ? ORDER BY d.id DESC", userId
)).map(async (order) => ({
  id: order.id, orderNumber: order.orderNumber, status: order.status, totalCents: order.totalCents, createdAt: order.createdAt, paymentMethod: order.paymentMethod, billing: JSON.parse(order.billingJson),
  items: (await getRows('SELECT product_id AS productId, name, price_cents AS priceCents, quantity, color, size, image_url AS imageUrl FROM demo_order_items WHERE order_id = ?', order.id)),
  history: (await getRows('SELECT status, created_at AS createdAt FROM demo_order_status_history WHERE order_id = ? ORDER BY id', order.id)),
}))))

app.get('/api/buyer/orders', requireAuth, requireRole('customer'), async (req, res) => res.json({ orders: (await demoOrders(req.user!.id)) }))

app.post('/api/buyer/orders', requireAuth, requireRole('customer'), async (req, res) => {
  const { items, billing, paymentMethod } = req.body
  const billingFields = ['fullName', 'phone', 'address', 'city', 'region', 'postalCode', 'country']
  if (!Array.isArray(items) || !items.length || items.length > 100 || !billing || typeof billing !== 'object' ||
      !billingFields.every((field) => typeof billing[field] === 'string' && billing[field].trim().length > 0 && billing[field].length <= 200) ||
      !(['cash', 'card-demo', 'transfer-demo'].includes(paymentMethod) || (typeof paymentMethod === 'string' && paymentMethod.startsWith('coin:') && buyerCoins.includes(paymentMethod.slice(5))))) return res.status(400).json({ error: 'Invalid test order or billing details.' })
  const snapshots: { product: ProductRow, quantity: number, color: string, size: string }[] = []
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.id) || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 100 ||
        typeof item.selectedColor !== 'string' || item.selectedColor.length > 100 || typeof item.selectedSize !== 'string' || item.selectedSize.length > 100) {
      return res.status(400).json({ error: 'Invalid test order item.' })
    }
    const product = (await getRow<ProductRow>('SELECT * FROM products WHERE id = ? AND seller_id IS NOT NULL AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND u.suspended = 0 AND u.role IN (\'seller\',\'admin\')) AND (is_published = 1 OR is_store_published = 1)', item.id))
    if (!product) return res.status(400).json({ error: 'A product is no longer available. Update your cart.' })
    snapshots.push({ product, quantity: item.quantity, color: item.selectedColor, size: item.selectedSize })
  }
  const subtotal = snapshots.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0)
  const shipping = subtotal === 0 || subtotal >= 7500 ? 0 : 795
  const total = subtotal + shipping + Math.round((subtotal + shipping) * 0.08)
  if (!Number.isSafeInteger(total)) return res.status(400).json({ error: 'Test order total is too large.' })
  const id = (await database.transaction(async () => {
    const result = (await database.prepare('INSERT INTO demo_orders (user_id, total_cents, billing_json, payment_method) VALUES (?, ?, ?, ?)').run(req.user!.id, total, JSON.stringify(Object.fromEntries(billingFields.map((field) => [field, billing[field].trim()]))), paymentMethod))
    const orderId = Number(result.lastInsertRowid)
    await allocateOrderNumber(database, 'demo', orderId)
    const insert = database.prepare('INSERT INTO demo_order_items (order_id, product_id, name, price_cents, quantity, color, size, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const item of snapshots) await insert.run(orderId, item.product.id, item.product.name, Math.round(item.product.price * 100), item.quantity, item.color, item.size, item.product.image_url)
    await database.prepare("INSERT INTO demo_order_status_history (order_id, status) VALUES (?, 'pending')").run(orderId)
    return orderId
  })())
  return res.status(201).json({ id, totalCents: total })
})

app.patch('/api/admin/demo-orders/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body.status
  if (!Number.isSafeInteger(id) || !['pending', 'on_the_way', 'delivered', 'returned'].includes(status)) return res.status(400).json({ error: 'Invalid test order status.' })
  const order = (await getRow<{ user_id: number, status: string, order_number: number }>("SELECT d.user_id, d.status, n.number AS order_number FROM demo_orders d JOIN order_numbers n ON n.kind='demo' AND n.order_id=d.id WHERE d.id = ?", id))
  if (!order) return res.status(404).json({ error: 'Test order not found.' })
  if (order.status !== status) await database.transaction(async () => {
    await database.prepare('UPDATE demo_orders SET status = ? WHERE id = ?').run(status, id)
    await database.prepare('INSERT INTO demo_order_status_history (order_id, status) VALUES (?, ?)').run(id, status)
    await database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'demo_order', ?, ?, '/profile/orders')").run(order.user_id, `Test order #${order.order_number} updated`, `Test status: ${status.replaceAll('_', ' ')}. No real fulfillment is tracked.`)
  })()
  return res.json({ ok: true })
})

app.patch('/api/admin/cancellation-requests/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id)
  const status = req.body.status
  if (!Number.isSafeInteger(id) || !['reviewed', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid review status.' })
  const request = (await getRow<{ user_id: number }>("SELECT user_id FROM cancellation_requests WHERE id = ? AND status = 'pending'", id))
  if (!request) return res.status(404).json({ error: 'Pending request not found.' })
  await database.transaction(async () => {
    await database.prepare('UPDATE cancellation_requests SET status = ? WHERE id = ?').run(status, id)
    await database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'cancellation', 'Cancellation request reviewed', ?, '/profile/setup')").run(request.user_id, `Your request was marked ${status}. Your account has not been deleted.`)
  })()
  return res.json({ ok: true })
})

app.post('/api/buyer/addresses', requireAuth, requireRole('customer'), async (req, res) => {
  const fields = ['fullName', 'phone', 'address', 'city', 'region', 'postalCode', 'country'] as const
  const values = fields.map((field) => typeof req.body[field] === 'string' ? req.body[field].trim() : '')
  if (values.some((value) => !value || value.length > 200)) return res.status(400).json({ error: 'Complete every address field using at most 200 characters each.' })
  const insert = database.transaction(async () => {
    const count = (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM buyer_addresses WHERE user_id = ?', req.user!.id))!.count
    if (count >= 20) return false
    const makeDefault = count === 0 || req.body.isDefault === true
    if (makeDefault) await database.prepare('UPDATE buyer_addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id)
    await database.prepare(`
      INSERT INTO buyer_addresses (user_id, full_name, phone, address, city, region, postal_code, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user!.id, ...values, makeDefault ? 1 : 0)
    return true
  })
  if (!(await insert())) return res.status(400).json({ error: 'You can save up to 20 addresses.' })
  return res.status(201).json({ addresses: (await buyerAddresses(req.user!.id)) })
})

app.patch('/api/buyer/addresses/:id/default', requireAuth, requireRole('customer'), async (req, res) => {
  const id = Number(req.params.id)
  const address = (await getRow<{ id: number }>('SELECT id FROM buyer_addresses WHERE id = ? AND user_id = ?', id, req.user!.id))
  if (!address) return res.status(404).json({ error: 'Address not found.' })
  await database.transaction(async () => {
    await database.prepare('UPDATE buyer_addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id)
    await database.prepare('UPDATE buyer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id)
  })()
  return res.json({ addresses: (await buyerAddresses(req.user!.id)) })
})

app.post('/api/buyer/requests', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const { kind, coin } = req.body
  const amountCents = req.body.amountCents ?? null
  const destination = typeof req.body.destination === 'string' ? req.body.destination.trim() : ''
  if (!['deposit', 'withdrawal'].includes(kind) || !buyerCoins.includes(coin) || (amountCents === null ? kind !== 'deposit' : !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100000000) || destination.length > 500 || (kind === 'withdrawal' && !destination)) {
    return res.status(400).json({ error: 'Choose a supported coin, a valid amount and a withdrawal destination when required.' })
  }
  const pinError=await checkTransactionPin(database,req.user!.id,req.body.transactionPin)
  if(pinError)return res.status(403).json({error:pinError})
  let id:number
  try{id = (await database.transaction(async () => {
    let reserved=0
    if(kind==='withdrawal'){
      const balance=(await getRow<{amount:number}>('SELECT balance_units AS amount FROM reward_balances WHERE user_id=?',req.user!.id))?.amount||0
      const held=(await getRow<{amount:number}>('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?',req.user!.id))?.amount||0
      if(balance-held<amountCents)throw Object.assign(new Error('Insufficient available account balance for this withdrawal.'),{status:409})
      reserved=amountCents
      await database.prepare('INSERT INTO buyer_wallet_holds(user_id,amount_cents) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET amount_cents=buyer_wallet_holds.amount_cents+excluded.amount_cents').run(req.user!.id,reserved)
    }
    const configured=kind==='deposit'?await getRow<{network:string,address:string}>('SELECT network,address FROM payment_wallets WHERE coin=?',coin):null
    const result=await database.prepare('INSERT INTO buyer_wallet_requests(user_id,kind,coin,amount_cents,destination,reserved_cents,payment_coin,network,wallet_address) VALUES(?,?,?,?,?,?,?,?,?)').run(req.user!.id,kind,coin,amountCents,destination,reserved,configured?coin:'',configured?.network||'',configured?.address||'')
    await database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_request', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Buyer ${kind} request`, `${req.user!.full_name} (#${req.user!.public_id}) requested ${coin}.`, `/admin/users/${req.user!.id}#buyer-controls`)
    return result.lastInsertRowid
  })())
  }catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
  return res.status(201).json({ id })
})

app.patch('/api/buyer/requests/:id/amount', requireAuth, requireRole('customer'), async (req, res) => {
  const id = Number(req.params.id)
  const { amountCents } = req.body
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100000000) return res.status(400).json({ error: 'Enter an amount between $0.01 and $1,000,000.' })
  const request = (await getRow<{ id: number, status: string, wallet_address: string, kind: string, amount_cents: number | null }>(
    'SELECT id, status, wallet_address, kind, amount_cents FROM buyer_wallet_requests WHERE id = ? AND user_id = ?', id, req.user!.id,
  ))
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.kind !== 'deposit' || request.status !== 'pending' || !request.wallet_address || request.amount_cents !== null) return res.status(409).json({ error: 'The amount can only be set once after wallet details are provided for a pending deposit.' })
  await database.transaction(async () => {
    await database.prepare('UPDATE buyer_wallet_requests SET amount_cents = ? WHERE id = ?').run(amountCents, id)
    await database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_request', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Deposit amount for request #${id}`, `${req.user!.full_name} (#${req.user!.public_id}) entered a deposit amount.`, `/admin/users/${req.user!.id}#buyer-controls`)
  })()
  return res.json({ ok: true })
})

app.post('/api/buyer/requests/:id/receipt', requireAuth, requireRole('customer'), express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), async (req, res) => {
  const requestId = Number(req.params.id)
  const request = (await getRow<{ id: number, user_id: number, kind: string, status: string, payment_coin: string, wallet_address: string, network: string, amount_cents: number | null }>(
    'SELECT id, user_id, kind, status, payment_coin, wallet_address, network, amount_cents FROM buyer_wallet_requests WHERE id = ? AND user_id = ?', requestId, req.user!.id,
  ))
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.kind !== 'deposit' || request.status !== 'pending' || !request.wallet_address) return res.status(400).json({ error: 'A pending deposit with payment instructions is required.' })
  if (request.amount_cents === null) return res.status(400).json({ error: 'Enter the deposit amount before uploading a screenshot.' })
  const image = req.body
  const png = Buffer.isBuffer(image) && image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = Buffer.isBuffer(image) && image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255
  if ((!png && !jpeg) || (png && !req.is('image/png')) || (jpeg && !req.is('image/jpeg'))) return res.status(400).json({ error: 'Upload a PNG or JPEG screenshot up to 2 MB.' })
  const count = (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM buyer_request_receipts WHERE request_id = ?', request.id))!.count
  if (count >= 10) return res.status(400).json({ error: 'This request already has 10 screenshots. Contact the administrator.' })
  await database.transaction(async () => {
    await database.prepare('INSERT INTO buyer_request_receipts (request_id, content_type, image, wallet_address, network, coin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(request.id, png ? 'image/png' : 'image/jpeg', image, request.wallet_address, request.network, request.payment_coin)
    await database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_receipt', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Screenshot for request #${request.id}`, `${req.user!.full_name} (#${req.user!.public_id}) submitted a payment screenshot. Verify independently.`, `/admin/users/${req.user!.id}#buyer-controls`)
  })()
  return res.status(201).json({ ok: true })
})

app.get('/api/admin/receipts/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const receipt = (await getRow<{ image: Buffer, content_type: string }>('SELECT image, content_type FROM buyer_request_receipts WHERE id = ?', Number(req.params.id)))
  if (!receipt) return res.status(404).json({ error: 'Screenshot not found.' })
  res.set('Cache-Control', 'no-store')
  res.set('Content-Disposition', `attachment; filename="receipt-${Number(req.params.id)}.${receipt.content_type === 'image/png' ? 'png' : 'jpg'}"`)
  return res.type(receipt.content_type).send(receipt.image)
})

app.get('/api/admin/buyers', requireAuth, requireRole('admin'), async (_req, res) => {
  const buyers = (await Promise.all((await getRows<{ id: number, fullName: string, email: string, phone: string | null, createdAt: string, balanceCents: number }>(`
    SELECT u.id, u.public_id AS publicId, u.full_name AS fullName, u.email, u.phone, u.created_at AS createdAt, COALESCE(w.balance_units, 0) AS balanceCents
    FROM users u LEFT JOIN reward_balances w ON w.user_id = u.id WHERE u.role = 'customer' ORDER BY u.id DESC
  `)).map(async (buyer) => ({ ...buyer, visits: (await buyerVisits(buyer.id)), addresses: (await buyerAddresses(buyer.id)) }))))
  const requests = (await walletRequests())
  return res.json({ buyers, requests })
})

app.patch('/api/admin/buyers/:id/balance', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  const { balanceCents, adjustmentCents } = req.body
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  const isAdjustment = adjustmentCents !== undefined && balanceCents === undefined
  if (!Number.isSafeInteger(userId) || !(isAdjustment ? Number.isSafeInteger(adjustmentCents) && adjustmentCents !== 0 : Number.isSafeInteger(balanceCents) && adjustmentCents === undefined) || !reason || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a valid manual wallet balance and a reason (up to 500 characters).' })
  }
  const newBalance=await database.transaction(async()=>{
    const wallet=await getRow<{balance_cents:number}>("SELECT COALESCE(w.balance_units,0) AS balance_cents FROM users u LEFT JOIN reward_balances w ON w.user_id=u.id WHERE u.id=? AND u.role='customer'",userId)
    if(!wallet)return null
    const next=isAdjustment?wallet.balance_cents+adjustmentCents:balanceCents
    const held=(await getRow<{amount:number}>('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?',userId))?.amount||0
    if(!Number.isSafeInteger(next)||next<held||next>10000000000)return null
    await database.prepare('INSERT INTO reward_balances(user_id,balance_units) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance_units=excluded.balance_units').run(userId,next)
    await database.prepare('INSERT INTO buyer_balance_history(user_id,admin_id,old_cents,new_cents,reason) VALUES(?,?,?,?,?)').run(userId,req.user!.id,wallet.balance_cents,next,reason)
    await database.prepare('INSERT INTO reward_history(user_id,admin_id,adjustment_units,balance_units,reason) VALUES(?,?,?,?,?)').run(userId,req.user!.id,next-wallet.balance_cents,next,reason)
    await database.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'balance','Account balance updated',?,'/profile/wallet')").run(userId,reason)
    return next
  })()
  if(newBalance===null)return res.status(400).json({error:'Buyer not found or resulting balance is invalid. Pending withdrawal holds must stay covered.'})
  return res.json({ balanceCents: newBalance })
})

app.patch('/api/admin/buyer-requests/:id',requireAuth,requireRole('admin'),async(req,res)=>{
 const id=Number(req.params.id),{status}=req.body||{}
 const instructions=typeof req.body.instructions==='string'?req.body.instructions.trim():''
 const reference=typeof req.body.transferReference==='string'?req.body.transferReference.trim():''
 if(!Number.isSafeInteger(id)||!['pending','confirmed','rejected'].includes(status)||instructions.length>2000||reference.length>300)return res.status(400).json({error:'Enter valid request details.'})
 type WalletReview={user_id:number,status:string,kind:string,coin:string,payment_coin:string,network:string,wallet_address:string,amount_cents:number|null,reserved_cents:number}
 try{await database.transaction(async()=>{
  const request=await getRow<WalletReview>('SELECT * FROM buyer_wallet_requests WHERE id=?',id)
  if(!request)throw Object.assign(new Error('Request not found.'),{status:404})
  if(request.status!=='pending')throw Object.assign(new Error('This request has already been resolved.'),{status:409})
  const paymentCoin=typeof req.body.paymentCoin==='string'?req.body.paymentCoin.trim():request.payment_coin
  const network=typeof req.body.network==='string'?req.body.network.trim():request.network
  const wallet=typeof req.body.walletAddress==='string'?req.body.walletAddress.trim():request.wallet_address
  if(network.length>100||wallet.length>500||(paymentCoin&&!buyerCoins.includes(paymentCoin)))throw Object.assign(new Error('Enter supported payment details.'),{status:400})
  if(status==='pending'&&request.kind==='deposit'&&(!paymentCoin||!network||!wallet))throw Object.assign(new Error('Choose a coin, network and funding wallet.'),{status:400})
  if(status==='confirmed'){
   if(!request.amount_cents||req.body.verified!==true||!reference)throw Object.assign(new Error('Verify the transfer independently and enter its transaction reference and amount.'),{status:400})
   if(request.kind==='deposit'){
    if(!request.payment_coin||!request.network||!request.wallet_address||!await getRow('SELECT id FROM buyer_request_receipts WHERE request_id=?',id))throw Object.assign(new Error('A configured deposit wallet and receipt are required.'),{status:409})
    if(await getRow('SELECT request_id FROM buyer_deposit_credits WHERE coin=? AND network=? AND transfer_reference=?',request.payment_coin,request.network,reference))throw Object.assign(new Error('That transfer has already credited an account.'),{status:409})
    await database.prepare('INSERT INTO buyer_deposit_credits(request_id,user_id,amount_cents,coin,network,transfer_reference,admin_id) VALUES(?,?,?,?,?,?,?)').run(id,request.user_id,request.amount_cents,request.payment_coin,request.network,reference,req.user!.id)
   }
   const before=(await getRow<{amount:number}>('SELECT balance_units AS amount FROM reward_balances WHERE user_id=?',request.user_id))?.amount||0
   const after=before+(request.kind==='deposit'?request.amount_cents:-request.amount_cents)
   const held=(await getRow<{amount:number}>('SELECT amount_cents AS amount FROM buyer_wallet_holds WHERE user_id=?',request.user_id))?.amount||0
   if(!Number.isSafeInteger(after)||after>10000000000||after<held-request.reserved_cents)throw Object.assign(new Error('Insufficient available account balance to complete this withdrawal.'),{status:409})
   await database.prepare('INSERT INTO reward_balances(user_id,balance_units) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET balance_units=excluded.balance_units').run(request.user_id,after)
   const reason=`Verified ${request.kind} request #${id}; transfer ${reference}`
   await database.prepare('INSERT INTO buyer_balance_history(user_id,admin_id,old_cents,new_cents,reason) VALUES(?,?,?,?,?)').run(request.user_id,req.user!.id,before,after,reason)
   await database.prepare('INSERT INTO reward_history(user_id,admin_id,adjustment_units,balance_units,reason) VALUES(?,?,?,?,?)').run(request.user_id,req.user!.id,after-before,after,reason)
  }
  if(status!=='pending'&&request.reserved_cents)await database.prepare('UPDATE buyer_wallet_holds SET amount_cents=amount_cents-? WHERE user_id=?').run(request.reserved_cents,request.user_id)
  await database.prepare('UPDATE buyer_wallet_requests SET status=?,instructions=?,payment_coin=?,network=?,wallet_address=? WHERE id=?').run(status,instructions,paymentCoin,network,wallet,id)
  await database.prepare("INSERT INTO notifications(user_id,type,title,body,link) VALUES(?,'buyer_request',?,?, '/profile/wallet')").run(request.user_id,`Request #${id} ${status}`,status==='confirmed'?`${request.kind==='deposit'?'Funds added to':'Funds withdrawn from'} your account balance.`:instructions||'Your request status changed.')
 })()}catch(error){const e=error as Error&{status?:number};if(e.status)return res.status(e.status).json({error:e.message});throw error}
 return res.json({ok:true})
})

app.get('/api/admin/users', requireAuth, requireRole('admin'), async (_req, res) => {
  const users = (await getRows<AdminUserRow>(`
    SELECT id, public_id, full_name, email, phone, role, created_at
    FROM users ORDER BY id
  `)).map((user) => ({
    id: user.id,
    publicId: user.public_id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.created_at,
  }))
  return res.json({ users })
})

app.get('/api/admin/users/:id/details', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(404).json({ error: 'User not found.' })
  const user = (await getRow<{ id: number, fullName: string, email: string, phone: string | null, role: UserRole, suspended: number, createdAt: string }>(`
    SELECT id, public_id AS publicId, full_name AS fullName, email, phone, role, suspended, created_at AS createdAt FROM users WHERE id = ?
  `, userId))
  if (!user) return res.status(404).json({ error: 'User not found.' })
  const wallet = (await getRow<{ balanceCents: number }>('SELECT balance_units AS balanceCents FROM reward_balances WHERE user_id = ?', userId)) ?? { balanceCents: 0 }
  const seller = (await getRow(`
    SELECT store_name AS storeName, store_description AS storeDescription, logo_url AS logoUrl,
      country, address, city, region, postal_code AS postalCode, verification_status AS verificationStatus,
      follower_count AS followerCount, visitor_count AS visitorCount
    FROM seller_profiles WHERE user_id = ?
  `, userId))
  const events = (await getRows('SELECT event_type AS type, created_at AS createdAt FROM auth_events WHERE user_id = ? ORDER BY id DESC LIMIT 200', userId))
  const balanceHistory = (await getRows(`
    SELECT h.old_cents AS oldCents, h.new_cents AS newCents, h.reason, h.created_at AS createdAt,
      u.full_name AS adminName FROM buyer_balance_history h JOIN users u ON u.id = h.admin_id WHERE h.user_id = ? ORDER BY h.id DESC
  `, userId))
  const balanceResets = (await getRows('SELECT previous_cents AS previousCents, reset_at AS resetAt FROM buyer_balance_reset_audit WHERE user_id = ? ORDER BY reset_at DESC', userId))
  const rewards = (await getRow<{ balanceUnits: number }>('SELECT balance_units AS balanceUnits FROM reward_balances WHERE user_id = ?', userId)) ?? { balanceUnits: 0 }
  const rewardHistory = (await getRows('SELECT h.id, h.adjustment_units AS adjustmentUnits, h.balance_units AS balanceUnits, h.reason, h.created_at AS createdAt, u.full_name AS adminName FROM reward_history h JOIN users u ON u.id = h.admin_id WHERE h.user_id = ? ORDER BY h.id DESC LIMIT 200', userId))
  const balancePurchases = (await getRows("SELECT h.order_id AS orderId, n.number AS orderNumber, h.amount_cents AS amountCents, h.balance_after_cents AS balanceCents, h.created_at AS createdAt FROM balance_purchase_history h JOIN order_numbers n ON n.kind = 'purchase' AND n.order_id = h.order_id WHERE h.user_id = ? ORDER BY h.order_id DESC LIMIT 200", userId))
  const products = (await getRows<ProductRow>('SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC', userId)).map(publicProduct)
  const cancellationRequests = (await getRows('SELECT id, status, created_at AS createdAt FROM cancellation_requests WHERE user_id = ? ORDER BY id DESC', userId))
  const favorites = (await getRows<ProductRow>('SELECT p.* FROM products p JOIN buyer_favorites f ON f.product_id = p.id WHERE f.user_id = ? ORDER BY f.created_at DESC', userId)).map(publicProduct)
  const follows = (await getRows('SELECT p.user_id AS sellerId, p.store_name AS storeName FROM store_follows f JOIN seller_profiles p ON p.user_id = f.seller_id WHERE f.user_id = ? ORDER BY f.created_at DESC', userId))
  const metricsRow = (await getRow<{ metrics_json: string }>('SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?', userId))
  const sellerMetrics = metricsRow ? JSON.parse(metricsRow.metrics_json) : null
  const accountHistory = (await getRows('SELECT h.action, h.details, h.created_at AS createdAt, u.full_name AS adminName FROM account_admin_history h JOIN users u ON u.id = h.admin_id WHERE h.user_id = ? ORDER BY h.id DESC', userId))
  return res.json({ user, wallet: wallet || null, seller: seller || null, addresses: (await buyerAddresses(userId)), visits: (await buyerVisits(userId)), requests: (await walletRequests(userId)), events, balanceHistory, balanceResets, rewards, rewardHistory, balancePurchases, products, orders: (await demoOrders(userId)), cancellationRequests, favorites, follows, sellerMetrics, accountHistory })
})

app.patch('/api/admin/users/:id/suspension', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  const { suspended } = req.body
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (!Number.isSafeInteger(userId) || userId < 1 || typeof suspended !== 'boolean' || !reason || reason.length > 500) return res.status(400).json({ error: 'Provide a valid account status and reason (up to 500 characters).' })
  const user = (await getRow<{ role: UserRole, suspended: number }>('SELECT role, suspended FROM users WHERE id = ?', userId))
  if (!user || user.role === 'admin') return res.status(404).json({ error: 'User not found or admin accounts cannot be suspended.' })
  if (Boolean(user.suspended) === suspended) return res.status(409).json({ error: 'The account already has that status.' })
  await database.transaction(async () => {
    await database.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended ? 1 : 0, userId)
    if (suspended) await database.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
    await database.prepare('INSERT INTO account_admin_history (user_id, admin_id, action, details) VALUES (?, ?, ?, ?)').run(userId, req.user!.id, suspended ? 'Suspended' : 'Restored', reason)
  })()
  return res.json({ suspended })
})

app.patch('/api/admin/users/:id/store-name', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  const storeName = typeof req.body.storeName === 'string' ? req.body.storeName.trim() : ''
  if (!Number.isSafeInteger(userId) || userId < 1 || !storeName || storeName.length > 100) return res.status(400).json({ error: 'Enter a store name up to 100 characters.' })
  const store = (await getRow<{ store_name: string }>("SELECT p.store_name FROM seller_profiles p JOIN users u ON u.id = p.user_id WHERE u.id = ? AND u.role = 'seller'", userId))
  if (!store) return res.status(404).json({ error: 'Seller store not found.' })
  await database.transaction(async () => {
    await database.prepare('UPDATE seller_profiles SET store_name = ? WHERE user_id = ?').run(storeName, userId)
    await database.prepare('INSERT INTO account_admin_history (user_id, admin_id, action, details) VALUES (?, ?, ?, ?)').run(userId, req.user!.id, 'Store renamed', `${store.store_name} → ${storeName}`)
  })()
  return res.json({ storeName })
})

app.patch('/api/admin/users/:id/role', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.id)
  const role = req.body.role
  if (!Number.isSafeInteger(userId) || !['customer', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'Choose a valid user ID and a customer or seller role.' })
  }
  const candidate = await getRow<{role: string, seller_status: string}>('SELECT role,seller_status FROM users WHERE id=?', userId)
  if (role === 'seller' && candidate && candidate.role !== 'seller' && candidate.seller_status !== 'approved') return res.status(409).json({error:'Approve this user’s seller verification application before granting seller access.'})
  const result = (await database.prepare('UPDATE users SET role = ? WHERE id = ? AND role != ?').run(role, userId, 'admin'))
  if (!result.changes) return res.status(404).json({ error: 'User not found or the admin role cannot be changed here.' })
  if (role === 'customer') await database.prepare('INSERT OR IGNORE INTO buyer_wallets (user_id, balance_cents) VALUES (?, 0)').run(userId)
  return res.json({ ok: true })
})

app.get('/api/admin/products', requireAuth, requireRole('admin'), async (_req, res) => {
  const products = (await getRows<ProductRow>('SELECT * FROM products ORDER BY created_at DESC, id DESC'))
  return res.json({ products: products.map(publicProduct) })
})

app.get('/api/admin/sellers', requireAuth, requireRole('admin'), async (_req, res) => {
  const sellers = (await getRows<AdminSellerRow>(`
    SELECT users.id, users.public_id AS publicId, users.full_name, users.email, users.phone, users.created_at,
      seller_profiles.store_name, seller_profiles.store_description, seller_profiles.logo_url AS store_logo_url, seller_profiles.country,
      seller_profiles.address, seller_profiles.city, seller_profiles.region,
      seller_profiles.postal_code, seller_profiles.verification_status,
      seller_profiles.follower_count, seller_profiles.visitor_count,
      (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS actual_follow_count
    FROM users
    LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
    WHERE users.role = 'seller' OR EXISTS (SELECT 1 FROM seller_applications a WHERE a.user_id=users.id)
    ORDER BY users.id DESC
  `)).map((seller) => ({
    id: seller.id,
    publicId: seller.publicId,
    fullName: seller.full_name,
    email: seller.email,
    phone: seller.phone,
    createdAt: seller.created_at,
    storeName: seller.store_name,
    storeDescription: seller.store_description,
    storeLogoUrl: seller.store_logo_url,
    country: seller.country,
    address: seller.address,
    city: seller.city,
    region: seller.region,
    postalCode: seller.postal_code,
    verificationStatus: seller.verification_status,
    adminFollowerCount: seller.follower_count,
    followerCount: seller.follower_count + seller.actual_follow_count,
    visitorCount: seller.visitor_count,
  }))
  return res.json({ sellers })
})

app.get('/api/admin/sellers/:id/dashboard-metrics', requireAuth, requireRole('admin'), async (req, res) => {
  const sellerId = Number(req.params.id)
  const seller = (await getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role = 'seller'", sellerId))
  if (!seller) return res.status(404).json({ error: 'Seller not found.' })
  const record = (await getRow<{ metrics_json: string }>(
    'SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?',
    sellerId,
  ))
  let metrics: Record<string, unknown> = {}
  if (record) {
    try {
      metrics = JSON.parse(record.metrics_json) as Record<string, unknown>
    } catch {
      metrics = {}
    }
  }
  const store = (await getRow<{ follower_count: number }>('SELECT follower_count FROM seller_profiles WHERE user_id = ?', sellerId))
  return res.json({ metrics, adminFollowerCount: store?.follower_count ?? 0 })
})

app.put('/api/admin/sellers/:id/dashboard-metrics', requireAuth, requireRole('admin'), async (req, res) => {
  const sellerId = Number(req.params.id)
  const seller = (await getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role = 'seller'", sellerId))
  if (!Number.isSafeInteger(sellerId) || !seller) return res.status(404).json({ error: 'Seller not found.' })

  const input = req.body.metrics && typeof req.body.metrics === 'object' && !Array.isArray(req.body.metrics)
    ? req.body.metrics as Record<string, unknown>
    : {}
  const numericFields = [
    'totalProducts', 'totalSalesAmount', 'totalOrders', 'totalProfit', 'overallRating',
    'sellerCreditScore', 'todayVisitors', 'visitorsLast7Days', 'visitorsLast30Days',
    'todayOrders', 'todaySales', 'estimatedProfit',
  ]
  const integerFields = new Set([
    'totalProducts', 'totalOrders', 'todayVisitors', 'visitorsLast7Days',
    'visitorsLast30Days', 'todayOrders',
  ])
  const metrics: Record<string, unknown> = {}

  for (const field of numericFields) {
    const rawValue = input[field]
    if (rawValue === '' || rawValue === null || rawValue === undefined) continue
    const value = Number(rawValue)
    if (!Number.isFinite(value) || value < 0 || value > 1000000000000 || (integerFields.has(field) && !Number.isSafeInteger(value))) {
      return res.status(400).json({ error: `${field} must be a non-negative ${integerFields.has(field) ? 'whole number' : 'number'} within the supported range.` })
    }
    if (field === 'overallRating' && value > 5) return res.status(400).json({ error: 'Overall rating must be between 0 and 5.' })
    metrics[field] = value
  }

  for (const field of ['salesTrack', 'visitsTrack']) {
    const rawValues = input[field]
    if (rawValues === undefined) continue
    if (!Array.isArray(rawValues) || rawValues.length > 31) return res.status(400).json({ error: `${field} must contain no more than 31 daily values.` })
    const values = rawValues.map(Number)
    if (values.some((value) => !Number.isFinite(value) || value < 0 || value > 1000000000000)) {
      return res.status(400).json({ error: `${field} values must be non-negative numbers.` })
    }
    metrics[field] = values
  }

  if (input.topProducts !== undefined) {
    if (!Array.isArray(input.topProducts) || input.topProducts.length > 10) return res.status(400).json({ error: 'Top products can contain up to 10 records.' })
    const topProducts: Array<{ productId: number; salesVolume: number }> = []
    for (const item of input.topProducts) {
      if (!item || typeof item !== 'object') return res.status(400).json({ error: 'Each top-product record must include a product and sales volume.' })
      const productId = Number((item as Record<string, unknown>).productId)
      const salesVolume = Number((item as Record<string, unknown>).salesVolume)
      const product = (await getRow<{ id: number }>('SELECT id FROM products WHERE id = ? AND seller_id = ?', productId, sellerId))
      if (!Number.isSafeInteger(productId) || !product || !Number.isSafeInteger(salesVolume) || salesVolume < 0 || salesVolume > 1000000000) {
        return res.status(400).json({ error: 'Top products must belong to this seller and have a non-negative whole-number sales volume.' })
      }
      topProducts.push({ productId, salesVolume })
    }
    metrics.topProducts = topProducts
  }

  const savedMetrics = JSON.stringify(metrics)
  await database.prepare(`
    INSERT INTO seller_dashboard_metrics (user_id, metrics_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET metrics_json = excluded.metrics_json, updated_at = CURRENT_TIMESTAMP
  `).run(sellerId, savedMetrics)
  return res.json({ metrics })
})

app.delete('/api/admin/sellers/:id/store', requireAuth, requireRole('admin'), async (req, res) => {
  const sellerId = Number(req.params.id)
  if (!Number.isSafeInteger(sellerId)) return res.status(400).json({ error: 'Choose a valid seller ID.' })
  const result = (await database.prepare('DELETE FROM seller_profiles WHERE user_id = ?').run(sellerId))
  if (!result.changes) return res.status(404).json({ error: 'Store not found.' })
  await database.prepare('UPDATE products SET is_store_published = 0 WHERE seller_id = ?').run(sellerId)
  return res.json({ ok: true })
})

app.patch('/api/admin/sellers/:id/stats', requireAuth, requireRole('admin'), async (req, res) => {
  const sellerId = Number(req.params.id)
  const followerCount = Number(req.body.followerCount)
  if (!Number.isSafeInteger(sellerId) || !Number.isSafeInteger(followerCount) || followerCount < 0 || followerCount > 1000000000) {
    return res.status(400).json({ error: 'Enter a whole-number follower amount between 0 and 1,000,000,000.' })
  }
  const result = (await database.prepare('UPDATE seller_profiles SET follower_count = ? WHERE user_id = ?')
    .run(followerCount, sellerId))
  if (!result.changes) return res.status(404).json({ error: 'Store not found.' })
  const actualFollowers = (await getRow<{ count: number }>('SELECT COUNT(*) AS count FROM store_follows WHERE seller_id = ?', sellerId))?.count ?? 0
  return res.json({ followerCount: followerCount + actualFollowers, adminFollowerCount: followerCount })
})

app.get('/api/admin/events', requireAuth, requireRole('admin'), async (_req, res) => {
  const events = (await getRows<AdminEventRow>(`
    SELECT auth_events.id, auth_events.event_type, auth_events.created_at,
      users.id AS user_id, users.public_id AS publicId, users.full_name, users.email
    FROM auth_events
    JOIN users ON users.id = auth_events.user_id
    ORDER BY auth_events.id DESC
    LIMIT 100
  `)).map((event) => ({
    id: event.id,
    type: event.event_type,
    createdAt: event.created_at,
    userId: event.user_id,
    publicId: event.publicId,
    fullName: event.full_name,
    email: event.email,
  }))
  return res.json({ events })
})

registerSellerDisplayStats(app,database,requireAuth,requireRole)
registerTransactionPin(app, database, requireAuth, requireRole)
registerSellerFinance(app, database, requireAuth, requireRole)
await registerManualOrders(app, database, requireAuth, requireRole)
await registerMarketing(app, database, requireAuth, requireRole)
const stopVerificationWorker = await registerSellerVerification(app, database, requireAuth, requireRole)
app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))

app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  if (/^\/api\/(auth\/register-seller|seller\/application|admin\/seller-applications|seller-verification)/.test(req.path)) console.error('Private seller verification request failed.')
  else console.error(error)
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'The upload is too large. Images must be at most 2 MB each.' })
  return res.status(500).json({ error: 'Something went wrong on the server.' })
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(resolve('dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')))
}

await seedAdmin()
export const httpServer = app.listen(port, '0.0.0.0', () => console.log(`GGU API listening on port ${port}`))
httpServer.on('close', stopVerificationWorker)

// Import in the background so the free web service can answer requests while catalog pages arrive.
void seedImportedWarehouse(database).catch(() => console.error('Warehouse source import paused. Completed pages are saved; restarting resumes the import.'))
