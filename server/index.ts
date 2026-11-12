import 'dotenv/config'
import express, { type NextFunction, type Request, type Response, type RequestHandler } from 'express'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { createHash, randomBytes, randomInt } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { isEmailConfigured, sendAuthNotifications, sendPasswordResetEmail, sendSellerVerificationCode } from './email.ts'

type UserRole = 'customer' | 'seller' | 'admin'

interface UserRow {
  id: number
  full_name: string
  email: string
  phone: string | null
  password_hash: string
  role: UserRole
  created_at: string
  token_hash?: string
}

interface ProductRow {
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

interface AdminUserRow extends Pick<UserRow, 'id' | 'full_name' | 'email' | 'phone' | 'role' | 'created_at'> {}

interface AdminSellerRow extends Pick<UserRow, 'id' | 'full_name' | 'email' | 'phone' | 'created_at'> {
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
  return typeof error.code === 'string' ? error.code : undefined
}

const getRow = <Row>(sql: string, ...parameters: unknown[]): Row | undefined =>
  database.prepare(sql).get(...parameters) as Row | undefined

const getRows = <Row>(sql: string, ...parameters: unknown[]): Row[] =>
  database.prepare(sql).all(...parameters) as Row[]

const app = express()
const port = Number(process.env.PORT) || 3001
const cookieName = 'ggu_session'
const sessionDurationMs = 7 * 24 * 60 * 60 * 1000
const databasePath = resolve(process.env.DATABASE_PATH || 'data/shop.db')

mkdirSync(dirname(databasePath), { recursive: true })

const database = new Database(databasePath)
database.pragma('journal_mode = WAL')
database.pragma('foreign_keys = ON')
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'seller', 'admin')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS auth_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('registered', 'login')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seller_email_verifications (
    email TEXT PRIMARY KEY,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    verified_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    compare_at_price REAL,
    description TEXT NOT NULL DEFAULT '',
    image_url TEXT NOT NULL,
    image_urls_json TEXT NOT NULL DEFAULT '[]',
    colors_json TEXT NOT NULL DEFAULT '[]',
    sizes_json TEXT NOT NULL DEFAULT '[]',
    rating REAL NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
    seller_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seller_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    store_name TEXT NOT NULL,
    store_description TEXT NOT NULL DEFAULT '',
    logo_url TEXT NOT NULL DEFAULT '',
    follower_count INTEGER NOT NULL DEFAULT 0 CHECK (follower_count >= 0),
    visitor_count INTEGER NOT NULL DEFAULT 0 CHECK (visitor_count >= 0),
    country TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    region TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'demo_documents_not_stored',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    link TEXT NOT NULL DEFAULT '/messages',
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    read_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS store_follows (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, seller_id)
  );

  CREATE TABLE IF NOT EXISTS buyer_wallets (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0)
  );

  CREATE TABLE IF NOT EXISTS buyer_addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL,
    city TEXT NOT NULL, region TEXT NOT NULL, postal_code TEXT NOT NULL, country TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS buyer_store_visits (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    seller_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    last_visited_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    visit_count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, seller_id)
  );

  CREATE TABLE IF NOT EXISTS buyer_wallet_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
    coin TEXT NOT NULL, amount_cents INTEGER CHECK (amount_cents > 0 OR (amount_cents IS NULL AND kind = 'deposit')),
    destination TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
    instructions TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS buyer_balance_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    admin_id INTEGER NOT NULL REFERENCES users(id),
    old_cents INTEGER NOT NULL, new_cents INTEGER NOT NULL,
    reason TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY
  );
  CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS buyer_balance_reset_audit (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_cents INTEGER NOT NULL,
    reset_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS buyer_request_receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id INTEGER NOT NULL REFERENCES buyer_wallet_requests(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    image BLOB NOT NULL,
    wallet_address TEXT NOT NULL,
    network TEXT NOT NULL,
    coin TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS buyer_security (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    transaction_password_hash TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS buyer_favorites (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, product_id)
  );
  CREATE TABLE IF NOT EXISTS cancellation_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cancellation_pending_idx ON cancellation_requests(user_id) WHERE status = 'pending';
  CREATE TABLE IF NOT EXISTS demo_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'on_the_way', 'delivered', 'returned')),
    total_cents INTEGER NOT NULL, billing_json TEXT NOT NULL, payment_method TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS demo_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES demo_orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL, name TEXT NOT NULL,
    price_cents INTEGER NOT NULL, quantity INTEGER NOT NULL, color TEXT NOT NULL DEFAULT '', size TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS demo_order_status_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES demo_orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS seller_dashboard_metrics (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS products_category_idx ON products(category);
  CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON notifications(user_id, id DESC);
  CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_seller_id, id);
  CREATE INDEX IF NOT EXISTS messages_recipient_unread_idx ON messages(recipient_id, read_at);
`)

database.prepare("INSERT OR IGNORE INTO buyer_wallets (user_id, balance_cents) SELECT id, 0 FROM users WHERE role = 'customer'").run()
database.transaction(() => {
  if (!getRow<{ name: string }>("SELECT name FROM schema_migrations WHERE name = 'reset_buyer_demo_balances_v1'")) {
    database.prepare('INSERT INTO buyer_balance_reset_audit (user_id, previous_cents) SELECT user_id, balance_cents FROM buyer_wallets').run()
    database.prepare('UPDATE buyer_wallets SET balance_cents = 0').run()
    database.prepare("INSERT INTO schema_migrations (name) VALUES ('reset_buyer_demo_balances_v1')").run()
  }
})()

const walletRequestColumns = database.prepare('PRAGMA table_info(buyer_wallet_requests)').all() as Array<{ name: string }>
if (!walletRequestColumns.some((column) => column.name === 'payment_coin')) database.exec("ALTER TABLE buyer_wallet_requests ADD COLUMN payment_coin TEXT NOT NULL DEFAULT ''")
if (!walletRequestColumns.some((column) => column.name === 'wallet_address')) database.exec("ALTER TABLE buyer_wallet_requests ADD COLUMN wallet_address TEXT NOT NULL DEFAULT ''")
if (!walletRequestColumns.some((column) => column.name === 'network')) database.exec("ALTER TABLE buyer_wallet_requests ADD COLUMN network TEXT NOT NULL DEFAULT ''")

if (!getRow<{ name: string }>("SELECT name FROM schema_migrations WHERE name = 'deposit_amount_optional_v1'")) {
  database.pragma('foreign_keys = OFF')
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE buyer_wallet_requests_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          kind TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
          coin TEXT NOT NULL,
          amount_cents INTEGER CHECK (amount_cents > 0 OR (amount_cents IS NULL AND kind = 'deposit')),
          destination TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
          instructions TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          payment_coin TEXT NOT NULL DEFAULT '',
          wallet_address TEXT NOT NULL DEFAULT '',
          network TEXT NOT NULL DEFAULT ''
        );
        INSERT INTO buyer_wallet_requests_new (id, user_id, kind, coin, amount_cents, destination, status, instructions, created_at, payment_coin, wallet_address, network)
          SELECT id, user_id, kind, coin, amount_cents, destination, status, instructions, created_at, payment_coin, wallet_address, network FROM buyer_wallet_requests;
        DROP TABLE buyer_wallet_requests;
        ALTER TABLE buyer_wallet_requests_new RENAME TO buyer_wallet_requests;
      `)
      const violations = database.pragma('foreign_key_check') as unknown[]
      if (violations.length) throw new Error('Deposit request migration failed foreign key validation.')
      database.prepare("INSERT INTO schema_migrations (name) VALUES ('deposit_amount_optional_v1')").run()
    })()
  } finally {
    database.pragma('foreign_keys = ON')
  }
}

const productColumns = database.prepare('PRAGMA table_info(products)').all() as Array<{ name: string }>
if (!productColumns.some((column) => column.name === 'compare_at_price')) {
  database.exec('ALTER TABLE products ADD COLUMN compare_at_price REAL')
}
if (!productColumns.some((column) => column.name === 'is_store_published')) {
  database.exec('ALTER TABLE products ADD COLUMN is_store_published INTEGER NOT NULL DEFAULT 1')
}
if (!productColumns.some((column) => column.name === 'image_urls_json')) {
  database.exec("ALTER TABLE products ADD COLUMN image_urls_json TEXT NOT NULL DEFAULT '[]'")
}
if (!productColumns.some((column) => column.name === 'colors_json')) {
  database.exec("ALTER TABLE products ADD COLUMN colors_json TEXT NOT NULL DEFAULT '[]'")
}
if (!productColumns.some((column) => column.name === 'sizes_json')) {
  database.exec("ALTER TABLE products ADD COLUMN sizes_json TEXT NOT NULL DEFAULT '[]'")
}
if (!productColumns.some((column) => column.name === 'rating')) {
  database.exec('ALTER TABLE products ADD COLUMN rating REAL NOT NULL DEFAULT 0')
}

const orderItemColumns = database.prepare('PRAGMA table_info(demo_order_items)').all() as Array<{ name: string }>
if (!orderItemColumns.some((column) => column.name === 'image_url')) {
  database.transaction(() => {
    database.exec("ALTER TABLE demo_order_items ADD COLUMN image_url TEXT NOT NULL DEFAULT ''")
    database.exec("UPDATE demo_order_items SET image_url = COALESCE((SELECT image_url FROM products WHERE products.id = demo_order_items.product_id), '')")
  })()
}

const verificationColumns = database.prepare('PRAGMA table_info(seller_email_verifications)').all() as Array<{ name: string }>
if (!verificationColumns.some((column) => column.name === 'verified_at')) {
  database.exec('ALTER TABLE seller_email_verifications ADD COLUMN verified_at TEXT')
}

const sellerProfileColumns = database.prepare('PRAGMA table_info(seller_profiles)').all() as Array<{ name: string }>
if (!sellerProfileColumns.some((column) => column.name === 'logo_url')) {
  database.exec("ALTER TABLE seller_profiles ADD COLUMN logo_url TEXT NOT NULL DEFAULT ''")
}
if (!sellerProfileColumns.some((column) => column.name === 'follower_count')) {
  database.exec('ALTER TABLE seller_profiles ADD COLUMN follower_count INTEGER NOT NULL DEFAULT 0')
}
if (!sellerProfileColumns.some((column) => column.name === 'visitor_count')) {
  database.exec('ALTER TABLE seller_profiles ADD COLUMN visitor_count INTEGER NOT NULL DEFAULT 0')
}

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

const seedProducts = database.transaction((items: typeof starterProducts) => {
  for (const product of items) insertStarterProduct.run(...product, product[0])
})
seedProducts(starterProducts)

const insertCategory = database.prepare('INSERT OR IGNORE INTO categories (name) VALUES (?)')
const defaultCategoryNames = [
  'Food & Beverage', "Men's Clothing", "Women's Clothing", 'Snack Dessert',
  'Recreational Fishing Gear', 'Phones & Accessories', 'Epidemic Prevention Supplies',
  'Office Stationery', 'Computer Peripherals', 'Digital Products', 'Sports & Outdoors',
  'Home Appliances', 'Health Beauty & Hair', 'Kids & Babies', 'Jewelry & Watches',
  'Kids Toys', 'Luxury', 'Holiday decoration', "Children's clothing", "Men's Bag", "Ladies Bag",
]
const seedCategories = database.transaction(() => {
  for (const categoryName of defaultCategoryNames) insertCategory.run(categoryName)
  for (const product of starterProducts) insertCategory.run(product[1])
  database.prepare('INSERT OR IGNORE INTO categories (name) SELECT DISTINCT category FROM products').run()
})
seedCategories()

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
    const existingDemoSeller = getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', demoStore.email)
    let sellerId = existingDemoSeller?.id
    if (!sellerId) {
      const seedDemoStore = database.transaction(() => {
        const result = database.prepare(`
          INSERT INTO users (full_name, email, password_hash, role)
          VALUES (?, ?, ?, 'seller')
        `).run(demoStore.ownerName, demoStore.email, bcrypt.hashSync(randomBytes(32).toString('hex'), 12))
        const newSellerId = Number(result.lastInsertRowid)
        database.prepare(`
          INSERT INTO seller_profiles (user_id, store_name, store_description, country, address, city, region, postal_code)
          VALUES (?, ?, ?, '', '', '', '', '')
        `).run(newSellerId, demoStore.storeName, demoStore.description)
        const insertDemoProduct = database.prepare(`
          INSERT INTO products (name, category, price, description, image_url, image_urls_json, colors_json, sizes_json, rating, seller_id, is_published, is_store_published)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)
        `)
        for (const [name, category, price, description, imageUrl] of demoStore.products) {
          const details = demoProductDetails[name]
          insertDemoProduct.run(name, category, price, description, imageUrl, JSON.stringify(details.imageUrls), JSON.stringify(details.colors), JSON.stringify(details.sizes), details.rating, newSellerId)
        }
        return newSellerId
      })
      sellerId = seedDemoStore()
    }
    const updateDemoDetails = database.prepare(`
      UPDATE products SET image_urls_json = ?, colors_json = ?, sizes_json = ?, rating = ?
      WHERE seller_id = ? AND name = ? AND image_urls_json = '[]' AND colors_json = '[]' AND sizes_json = '[]'
    `)
    for (const [name] of demoStore.products) {
      const details = demoProductDetails[name]
      updateDemoDetails.run(JSON.stringify(details.imageUrls), JSON.stringify(details.colors), JSON.stringify(details.sizes), details.rating, sellerId, name)
    }
  }
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex')

const publicUser = (user: UserRow) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
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

  const existingAdmin = getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', email)
  if (existingAdmin) {
    database.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existingAdmin.id)
    return
  }

  const passwordHash = await bcrypt.hash(password, 12)
  database.prepare(`
    INSERT INTO users (full_name, email, phone, password_hash, role)
    VALUES (?, ?, ?, ?, 'admin')
  `).run(process.env.ADMIN_NAME?.trim() || 'Store Owner', email, process.env.ADMIN_PHONE?.trim() || null, passwordHash)
  console.log(`Created admin account ${email}`)
}

app.disable('x-powered-by')
app.use(helmet())
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
})

const setSessionCookie = (res: Response, token: string): void => {
  res.cookie(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    maxAge: sessionDurationMs,
  })
}

const clearSessionCookie = (res: Response): void => {
  res.clearCookie(cookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  })
}

const createSession = (userId: number | bigint, res: Response): void => {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + sessionDurationMs).toISOString()
  database.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, expiresAt)
  setSessionCookie(res, token)
}

const requireAuth: RequestHandler = (req, res, next) => {
  const token = req.cookies[cookieName]
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' })

  const session = getRow<UserRow>(`
    SELECT users.*, sessions.token_hash
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, hashToken(token), new Date().toISOString())

  if (!session) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' })
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

const getSiteName = (): string =>
  getRow<{ value: string }>("SELECT value FROM site_settings WHERE key = 'site_name'")?.value ?? 'GGU'

app.get('/api/site-settings', (_req, res) => {
  res.set('Cache-Control', 'no-store').json({ siteName: getSiteName() })
})

app.put('/api/admin/site-settings', requireAuth, requireRole('admin'), (req, res) => {
  const siteName = typeof req.body?.siteName === 'string' ? req.body.siteName.trim() : ''
  if (!siteName || siteName.length > 80 || [...siteName].some((char) => {
    const code = char.codePointAt(0)!
    return code < 32 || (code >= 127 && code <= 159)
  })) {
    return res.status(400).json({ error: 'Enter a website name between 1 and 80 characters without control characters.' })
  }
  database.prepare("INSERT INTO site_settings (key, value) VALUES ('site_name', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(siteName)
  return res.json({ siteName })
})

const validateProduct = (body: Record<string, unknown>): { product: ProductInput } | { error: string } => {
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

  let parsedImageUrl
  try {
    parsedImageUrl = new URL(imageUrl)
  } catch {
    return { error: 'Enter a valid product image URL.' }
  }

  if (!name || name.length > 120) return { error: 'Product name is required and must be under 120 characters.' }
  if (!category || category.length > 60) return { error: 'Enter a product category under 60 characters.' }
  if (!Number.isFinite(price) || price < 0 || price > 1000000) return { error: 'Enter a valid product price.' }
  if (compareAtPrice !== null && (!Number.isFinite(compareAtPrice) || compareAtPrice <= price || compareAtPrice > 1000000)) {
    return { error: 'Compare-at price must be greater than the sale price.' }
  }
  if (!['http:', 'https:'].includes(parsedImageUrl.protocol)) return { error: 'Product images must use HTTP or HTTPS.' }
  if (imageUrls.length > 8 || colors.length > 12 || sizes.length > 12) return { error: 'Use up to 8 product images, 12 colors, and 12 sizes.' }
  if (colors.some((color) => color.length > 40) || sizes.some((size) => size.length > 40)) return { error: 'Color and size options must be under 40 characters each.' }
  if (!Number.isFinite(rating) || rating < 0 || rating > 5) return { error: 'Product rating must be between 0 and 5.' }
  for (const galleryImage of imageUrls) {
    try {
      const parsedGalleryUrl = new URL(galleryImage)
      if (!['http:', 'https:'].includes(parsedGalleryUrl.protocol)) return { error: 'Product images must use HTTP or HTTPS.' }
    } catch {
      return { error: 'Enter valid URLs for all product images.' }
    }
  }
  if (description.length > 2000) return { error: 'Description must be under 2000 characters.' }

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

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

app.post('/api/auth/seller-verification-code', authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : 'seller'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Enter a valid email address first.' })
    }

    const existing = getRow<Pick<VerificationRow, 'created_at'>>('SELECT created_at FROM seller_email_verifications WHERE email = ?', email)
    if (existing && Date.now() - new Date(`${existing.created_at.replace(' ', 'T')}Z`).getTime() < 60_000) {
      return res.status(429).json({ error: 'Wait one minute before requesting another code.' })
    }

    const code = String(randomInt(100000, 1000000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
    database.prepare(`
      INSERT INTO seller_email_verifications (email, code_hash, expires_at, attempts)
      VALUES (?, ?, ?, 0)
      ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = CURRENT_TIMESTAMP
    `).run(email, hashToken(code), expiresAt)

    const sent = await sendSellerVerificationCode({ to: email, name: fullName, code, siteName: getSiteName() })
    if (!sent) {
      if (process.env.NODE_ENV !== 'production') {
        return res.json({ sent: false, developmentCode: code, expiresInSeconds: 600 })
      }
      database.prepare('DELETE FROM seller_email_verifications WHERE email = ?').run(email)
      return res.status(503).json({ error: 'Email verification is not available yet. Configure SMTP in .env and try again.' })
    }
    return res.json({ sent: true, expiresInSeconds: 600 })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/verify-seller-email-code', authLimiter, (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : ''
  const verification = getRow<VerificationRow>('SELECT * FROM seller_email_verifications WHERE email = ?', email)
  const codeMatches = verification && verification.expires_at > new Date().toISOString()
    && verification.attempts < 5 && /^\d{6}$/.test(code)
    && hashToken(code) === verification.code_hash

  if (!codeMatches) {
    if (verification && verification.attempts < 5) {
      database.prepare('UPDATE seller_email_verifications SET attempts = attempts + 1 WHERE email = ?').run(email)
    }
    return res.status(400).json({ error: 'The email verification code is invalid or expired.' })
  }

  database.prepare('UPDATE seller_email_verifications SET verified_at = ? WHERE email = ?')
    .run(new Date().toISOString(), email)
  return res.json({ verified: true })
})

const registerAccount = (role: UserRole): RequestHandler => async (req, res, next) => {
  try {
    const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : ''
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    let sellerProfile = null

    if (!fullName || fullName.length > 100) return res.status(400).json({ error: 'Enter your name (up to 100 characters).' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'Enter a valid email address.' })
    if (phone.length > 30) return res.status(400).json({ error: 'Phone number must be under 30 characters.' })
    if (Buffer.byteLength(password, 'utf8') < 8 || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: 'Password must be between 8 and 72 bytes.' })

    if (role === 'seller') {
      const verification = getRow<VerificationRow>('SELECT * FROM seller_email_verifications WHERE email = ?', email)
      if (!verification?.verified_at || verification.expires_at <= new Date().toISOString()) {
        return res.status(400).json({ error: 'The email verification code is invalid or expired.' })
      }

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
      const requiredProfileFields = [profile.storeName, profile.country, profile.address, profile.city, profile.region, profile.postalCode]
      if (requiredProfileFields.some((value) => !value)) return res.status(400).json({ error: 'Complete all required seller profile fields.' })
      if (profile.storeName.length > 100 || profile.storeDescription.length > 500 || profile.storeLogoUrl.length > 2000 || profile.address.length > 200 || profile.city.length > 100 || profile.region.length > 100 || profile.postalCode.length > 20 || profile.country.length > 80) {
        return res.status(400).json({ error: 'One or more seller profile fields are too long.' })
      }
      if (profile.storeLogoUrl) {
        try {
          const parsedLogoUrl = new URL(profile.storeLogoUrl)
          if (!['http:', 'https:'].includes(parsedLogoUrl.protocol)) return res.status(400).json({ error: 'Store logos must use HTTP or HTTPS.' })
        } catch {
          return res.status(400).json({ error: 'Enter a valid store logo URL.' })
        }
      }
      sellerProfile = profile
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const result = database.prepare(`
      INSERT INTO users (full_name, email, phone, password_hash, role)
      VALUES (?, ?, ?, ?, ?)
    `).run(fullName, email, phone || null, passwordHash, role)
    const user = getRow<UserRow>('SELECT * FROM users WHERE id = ?', result.lastInsertRowid)!
    if (role === 'customer') {
      database.prepare('INSERT INTO buyer_wallets (user_id, balance_cents) VALUES (?, 0)').run(user.id)
      database.prepare(`
        INSERT INTO notifications (user_id, type, title, body, link)
        SELECT id, 'buyer_signup', ?, ?, ? FROM users WHERE role = 'admin'
      `).run(`New buyer #${user.id}`, `${fullName} (${email}) created a buyer profile.`, `/admin/users/${user.id}`)
    }
    if (sellerProfile) {
      database.prepare(`
        INSERT INTO seller_profiles (user_id, store_name, store_description, logo_url, country, address, city, region, postal_code)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, sellerProfile.storeName, sellerProfile.storeDescription, sellerProfile.storeLogoUrl, sellerProfile.country, sellerProfile.address, sellerProfile.city, sellerProfile.region, sellerProfile.postalCode)
      database.prepare('DELETE FROM seller_email_verifications WHERE email = ?').run(email)
      database.prepare("INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'seller_signup', ?, ?, ? FROM users WHERE role = 'admin'").run(`New seller #${user.id}`, `${fullName} (${email}) created ${sellerProfile.storeName}.`, `/admin/users/${user.id}`)
    }
    createSession(user.id, res)
    database.prepare('INSERT INTO auth_events (user_id, event_type) VALUES (?, ?)').run(user.id, 'registered')
    if (role === 'seller' && sellerProfile) {
      const notifyAdmins = database.prepare(`
        INSERT INTO notifications (user_id, type, title, body, link)
        VALUES (?, 'seller_signup', ?, ?, '/messages?view=notifications')
      `)
      const adminIds = getRows<{ id: number }>("SELECT id FROM users WHERE role = 'admin'")
      for (const admin of adminIds) {
        notifyAdmins.run(
          admin.id,
          `New partner: ${sellerProfile.storeName}`,
          `${fullName} (${email}) applied to join from ${sellerProfile.city}, ${sellerProfile.country}.`,
        )
      }
    }
    const emailNotifications = await sendAuthNotifications(user, 'registered', getSiteName())
    return res.status(201).json({ user: publicUser(user), emailNotifications })
  } catch (error: unknown) {
    if (getErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with that email already exists.' })
    return next(error)
  }
}

app.post('/api/auth/register', authLimiter, registerAccount('customer'))
app.post('/api/auth/register-seller', authLimiter, registerAccount('seller'))

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body.password === 'string' ? req.body.password : ''
    const user = getRow<UserRow>('SELECT * FROM users WHERE email = ?', email)
    if (!user || !await bcrypt.compare(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email or password is incorrect.' })
    }

    createSession(user.id, res)
    database.prepare('INSERT INTO auth_events (user_id, event_type) VALUES (?, ?)').run(user.id, 'login')
    const emailNotifications = await sendAuthNotifications(user, 'login', getSiteName())
    return res.json({ user: publicUser(user), emailNotifications })
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
    const user = getRow<{ id: number }>('SELECT id FROM users WHERE email = ?', email)
    const token = randomBytes(32).toString('hex')
    const tokenHash = hashToken(token)
    if (user) {
      database.prepare(`
        INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET token_hash = excluded.token_hash, expires_at = excluded.expires_at
      `).run(user.id, tokenHash, new Date(Date.now() + 30 * 60 * 1000).toISOString())
    }
    const resetUrl = user ? `${appUrl.origin}/reset-password#${token}` : null
    const sent = await sendPasswordResetEmail(email, resetUrl, getSiteName())
    if (!sent) {
      if (user) database.prepare('DELETE FROM password_resets WHERE user_id = ? AND token_hash = ?').run(user.id, tokenHash)
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
    const reset = getRow<{ user_id: number, role: UserRole }>(`
      SELECT r.user_id, u.role FROM password_resets r JOIN users u ON u.id = r.user_id
      WHERE r.token_hash = ? AND r.expires_at > ?
    `, tokenHash, new Date().toISOString())
    if (!reset) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' })
    const minBytes = reset.role === 'admin' ? 12 : 8
    if (Buffer.byteLength(password, 'utf8') < minBytes || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ error: `Password must be between ${minBytes} and 72 bytes.` })
    const passwordHash = await bcrypt.hash(password, 12)
    const updated = database.transaction(() => {
      const consumed = database.prepare('DELETE FROM password_resets WHERE user_id = ? AND token_hash = ? AND expires_at > ?').run(reset.user_id, tokenHash, new Date().toISOString())
      if (!consumed.changes) return false
      database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, reset.user_id)
      database.prepare('DELETE FROM sessions WHERE user_id = ?').run(reset.user_id)
      return true
    })()
    if (!updated) return res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' })
    clearSessionCookie(res)
    return res.json({ ok: true })
  } catch (error: unknown) {
    return next(error)
  }
})

app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user!) }))

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies[cookieName]
  if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token))
  clearSessionCookie(res)
  return res.json({ ok: true })
})

app.get('/api/categories', (_req, res) => {
  const categories = getRows<{ name: string }>('SELECT name FROM categories ORDER BY name')
    .map((row) => row.name)
  return res.json({ categories })
})

app.get('/api/stores', (_req, res) => {
  const stores = getRows<{
    user_id: number
    full_name: string
    store_name: string
    store_description: string
    logo_url: string
    product_count: number
    image_url: string | null
    follower_count: number
    visitor_count: number
  }>(`
    SELECT users.id AS user_id, users.full_name, seller_profiles.store_name,
      seller_profiles.store_description, seller_profiles.logo_url,
      (SELECT COUNT(*) FROM products WHERE seller_id = users.id AND is_store_published = 1) AS product_count,
      (SELECT image_url FROM products WHERE seller_id = users.id AND is_store_published = 1
        ORDER BY created_at DESC, id DESC LIMIT 1) AS image_url,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles
    JOIN users ON users.id = seller_profiles.user_id
    WHERE users.role = 'seller'
    ORDER BY seller_profiles.created_at DESC, users.id DESC
  `).map((store) => ({
    id: store.user_id,
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

app.get('/api/stores/:sellerId', (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Store not found.' })
  database.prepare('UPDATE seller_profiles SET visitor_count = visitor_count + 1 WHERE user_id = ?').run(sellerId)
  const store = getRow<{
    user_id: number
    full_name: string
    store_name: string
    store_description: string
    logo_url: string
    follower_count: number
    visitor_count: number
  }>(`
    SELECT users.id AS user_id, users.full_name, seller_profiles.store_name,
      seller_profiles.store_description, seller_profiles.logo_url,
      seller_profiles.follower_count + (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS follower_count,
      seller_profiles.visitor_count
    FROM seller_profiles
    JOIN users ON users.id = seller_profiles.user_id
    WHERE users.id = ? AND users.role = 'seller'
  `, sellerId)
  if (!store) return res.status(404).json({ error: 'Store not found.' })
  const token = req.cookies[cookieName]
  if (token) {
    const visitor = getRow<{ id: number }>(`
      SELECT users.id FROM users JOIN sessions ON sessions.user_id = users.id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.role = 'customer'
    `, hashToken(token), new Date().toISOString())
    if (visitor) {
      database.prepare(`
        INSERT INTO buyer_store_visits (user_id, seller_id) VALUES (?, ?)
        ON CONFLICT(user_id, seller_id) DO UPDATE SET last_visited_at = CURRENT_TIMESTAMP, visit_count = visit_count + 1
      `).run(visitor.id, sellerId)
    }
  }
  const products = getRows<ProductRow>(`
    SELECT * FROM products
    WHERE seller_id = ? AND is_store_published = 1
    ORDER BY created_at DESC, id DESC
  `, sellerId).map(publicProduct)
  return res.json({
    store: {
      id: store.user_id,
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

app.get('/api/stores/:sellerId/follow', (req, res) => {
  const sellerId = Number(req.params.sellerId)
  const token = req.cookies[cookieName]
  if (!token) return res.json({ isFollowing: false })
  const session = getRow<{ id: number }>(`
    SELECT users.id
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `, hashToken(token), new Date().toISOString())
  if (!session) return res.json({ isFollowing: false })
  const isFollowing = Boolean(getRow<{ user_id: number }>(
    'SELECT user_id FROM store_follows WHERE user_id = ? AND seller_id = ?',
    session.id,
    sellerId,
  ))
  return res.json({ isFollowing })
})

app.post('/api/stores/:sellerId/follow', requireAuth, (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Store not found.' })
  if (sellerId === req.user!.id) return res.status(400).json({ error: 'You cannot follow your own store.' })
  const store = getRow<{ user_id: number }>('SELECT user_id FROM seller_profiles WHERE user_id = ?', sellerId)
  if (!store) return res.status(404).json({ error: 'Store not found.' })

  const existingFollow = getRow<{ user_id: number }>(
    'SELECT user_id FROM store_follows WHERE user_id = ? AND seller_id = ?',
    req.user!.id,
    sellerId,
  )
  const isFollowing = !existingFollow
  if (isFollowing) {
    database.prepare('INSERT INTO store_follows (user_id, seller_id) VALUES (?, ?)').run(req.user!.id, sellerId)
  } else {
    database.prepare('DELETE FROM store_follows WHERE user_id = ? AND seller_id = ?').run(req.user!.id, sellerId)
  }
  const followerCount = getRow<{ count: number }>(`
    SELECT seller_profiles.follower_count + COUNT(store_follows.user_id) AS count
    FROM seller_profiles
    LEFT JOIN store_follows ON store_follows.seller_id = seller_profiles.user_id
    WHERE seller_profiles.user_id = ?
  `, sellerId)?.count ?? 0
  return res.json({ isFollowing, followerCount })
})

app.get('/api/seller/store', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const store = getRow<{
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
  )
  return res.json({ store: store ? {
    storeName: store.store_name,
    storeDescription: store.store_description,
    storeLogoUrl: store.logo_url,
    productCount: store.product_count,
    followerCount: store.follower_count,
    visitorCount: store.visitor_count,
  } : null })
})

app.get('/api/seller/dashboard-metrics', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const record = getRow<{ metrics_json: string }>(
    'SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?',
    req.user!.id,
  )
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

app.put('/api/seller/store', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const storeName = typeof req.body.storeName === 'string' ? req.body.storeName.trim() : ''
  const storeDescription = typeof req.body.storeDescription === 'string' ? req.body.storeDescription.trim() : ''
  const storeLogoUrl = typeof req.body.storeLogoUrl === 'string' ? req.body.storeLogoUrl.trim() : ''
  if (!storeName || storeName.length > 100) return res.status(400).json({ error: 'Store name is required and must be under 100 characters.' })
  if (storeDescription.length > 500) return res.status(400).json({ error: 'Store description must be under 500 characters.' })
  if (storeLogoUrl.length > 2000) return res.status(400).json({ error: 'Store logo URL must be under 2000 characters.' })
  if (storeLogoUrl) {
    try {
      const parsedLogoUrl = new URL(storeLogoUrl)
      if (!['http:', 'https:'].includes(parsedLogoUrl.protocol)) return res.status(400).json({ error: 'Store logos must use HTTP or HTTPS.' })
    } catch {
      return res.status(400).json({ error: 'Enter a valid store logo URL.' })
    }
  }

  const existingStore = getRow<{ user_id: number }>('SELECT user_id FROM seller_profiles WHERE user_id = ?', req.user!.id)
  if (existingStore) {
    database.prepare('UPDATE seller_profiles SET store_name = ?, store_description = ?, logo_url = ? WHERE user_id = ?')
      .run(storeName, storeDescription, storeLogoUrl, req.user!.id)
  } else {
    database.prepare(`
      INSERT INTO seller_profiles (user_id, store_name, store_description, logo_url, country, address, city, region, postal_code)
      VALUES (?, ?, ?, ?, '', '', '', '', '')
    `).run(req.user!.id, storeName, storeDescription, storeLogoUrl)
  }
  return res.json({ store: { storeName, storeDescription, storeLogoUrl } })
})

app.get('/api/seller/categories', requireAuth, requireRole('seller', 'admin'), (_req, res) => {
  const categories = getRows<CategoryRow>('SELECT id, name FROM categories ORDER BY name')
  return res.json({ categories })
})

app.post('/api/seller/categories', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : ''
  if (!name || name.length > 60) return res.status(400).json({ error: 'Category name is required and must be under 60 characters.' })

  try {
    const result = database.prepare('INSERT INTO categories (name, created_by) VALUES (?, ?)').run(name, req.user!.id)
    const category = getRow<CategoryRow>('SELECT id, name FROM categories WHERE id = ?', result.lastInsertRowid)
    return res.status(201).json({ category })
  } catch (error: unknown) {
    if (getErrorCode(error) === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'That category already exists.' })
    throw error
  }
})

app.delete('/api/seller/categories/:id', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const categoryId = Number(req.params.id)
  const category = getRow<CategoryRow>('SELECT id, name FROM categories WHERE id = ?', categoryId)
  if (!category) return res.status(404).json({ error: 'Category not found.' })
  const productCount = getRow<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE category = ?', category.name)?.count ?? 0
  if (productCount) return res.status(409).json({ error: 'Move or delete products in this category before removing it.' })
  database.prepare('DELETE FROM categories WHERE id = ?').run(categoryId)
  return res.json({ ok: true })
})

app.get('/api/products', (req, res) => {
  const search = typeof req.query.q === 'string' ? `%${req.query.q.trim()}%` : '%'
  const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
  const products = getRows<ProductRow>(`
    SELECT * FROM products
    WHERE is_published = 1 AND seller_id IS NOT NULL AND name LIKE ? AND (? = '' OR category = ?)
    ORDER BY created_at DESC, id DESC
  `, search, category, category).map(publicProduct)
  return res.json({ products })
})

app.get('/api/discounts', (_req, res) => {
  const products = getRows<ProductRow>(`
    SELECT * FROM products
    WHERE is_published = 1 AND seller_id IS NOT NULL AND compare_at_price IS NOT NULL AND compare_at_price > price
    ORDER BY created_at DESC, id DESC
  `).map(publicProduct)
  return res.json({ products })
})

app.get('/api/products/:id', (req, res) => {
  const product = getRow<ProductRow>(`SELECT * FROM products
    WHERE id = ? AND seller_id IS NOT NULL AND (is_published = 1 OR is_store_published = 1)
  `, Number(req.params.id))
  if (!product) return res.status(404).json({ error: 'Product not found.' })
  const seller = product.seller_id ? getRow<{
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
  `, product.seller_id) : undefined
  return res.json({
    product: publicProduct(product),
    store: seller ? {
      id: product.seller_id,
      storeName: seller.store_name,
      logoUrl: seller.logo_url,
      ownerName: seller.full_name,
      followerCount: seller.follower_count,
      visitorCount: seller.visitor_count,
      productCount: getRow<{ count: number }>('SELECT COUNT(*) AS count FROM products WHERE seller_id = ? AND is_store_published = 1', product.seller_id)?.count ?? 0,
    } : null,
  })
})

app.get('/api/seller/products', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const products = req.user!.role === 'admin'
    ? getRows<ProductRow>('SELECT * FROM products ORDER BY created_at DESC, id DESC')
    : getRows<ProductRow>('SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC, id DESC', req.user!.id)
  return res.json({ products: products.map(publicProduct) })
})

app.post('/api/seller/products', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const validation = validateProduct(req.body)
  if ('error' in validation) return res.status(400).json({ error: validation.error })
  const { name, category, price, compareAtPrice, description, imageUrl, imageUrls, colors, sizes, rating, isPublished, isStorePublished } = validation.product
  const result = database.prepare(`
    INSERT INTO products (name, category, price, compare_at_price, description, image_url, image_urls_json, colors_json, sizes_json, rating, seller_id, is_published, is_store_published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, category, price, compareAtPrice, description, imageUrl, JSON.stringify(imageUrls), JSON.stringify(colors), JSON.stringify(sizes), rating, req.user!.id, Number(isPublished), Number(isStorePublished))
  insertCategory.run(category)
  const product = getRow<ProductRow>('SELECT * FROM products WHERE id = ?', result.lastInsertRowid)!
  return res.status(201).json({ product: publicProduct(product) })
})

app.patch('/api/seller/products/:id', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const productId = Number(req.params.id)
  const existing = getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId)
  if (!existing) return res.status(404).json({ error: 'Product not found.' })
  if (req.user!.role !== 'admin' && existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'You can only edit your own products.' })

  const validation = validateProduct({
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
  })
  if ('error' in validation) return res.status(400).json({ error: validation.error })
  const { name, category, price, compareAtPrice, description, imageUrl, imageUrls, colors, sizes, rating, isPublished, isStorePublished } = validation.product
  database.prepare(`
    UPDATE products SET name = ?, category = ?, price = ?, compare_at_price = ?, description = ?, image_url = ?, image_urls_json = ?, colors_json = ?, sizes_json = ?, rating = ?, is_published = ?, is_store_published = ?
    WHERE id = ?
  `).run(name, category, price, compareAtPrice, description, imageUrl, JSON.stringify(imageUrls), JSON.stringify(colors), JSON.stringify(sizes), rating, Number(isPublished), Number(isStorePublished), productId)
  insertCategory.run(category)
  return res.json({ product: publicProduct(getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId)!) })
})

app.delete('/api/seller/products/:id', requireAuth, requireRole('seller', 'admin'), (req, res) => {
  const productId = Number(req.params.id)
  const existing = getRow<ProductRow>('SELECT * FROM products WHERE id = ?', productId)
  if (!existing) return res.status(404).json({ error: 'Product not found.' })
  if (req.user!.role !== 'admin' && existing.seller_id !== req.user!.id) return res.status(403).json({ error: 'You can only delete your own products.' })
  database.prepare('DELETE FROM products WHERE id = ?').run(productId)
  return res.json({ ok: true })
})

const getConversationMessages = (sellerId: number, currentUserId: number) => {
  database.prepare(`
    UPDATE messages SET read_at = CURRENT_TIMESTAMP
    WHERE conversation_seller_id = ? AND recipient_id = ? AND read_at IS NULL
  `).run(sellerId, currentUserId)
  return getRows<{
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
  `, sellerId).map((message) => ({
    id: message.id,
    body: message.body,
    senderName: message.sender_name,
    senderRole: message.sender_role,
    isMine: message.sender_id === currentUserId,
    isRead: Boolean(message.read_at),
    createdAt: message.created_at,
  }))
}

app.get('/api/notifications', requireAuth, (req, res) => {
  const notifications = getRows<{
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
  `, req.user!.id).map((notification) => ({
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    link: notification.link,
    isRead: Boolean(notification.read_at),
    createdAt: notification.created_at,
  }))
  return res.json({ notifications })
})

app.patch('/api/notifications/read-all', requireAuth, (req, res) => {
  database.prepare('UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL')
    .run(req.user!.id)
  return res.json({ ok: true })
})

app.patch('/api/notifications/:id/read', requireAuth, (req, res) => {
  const notificationId = Number(req.params.id)
  if (!Number.isSafeInteger(notificationId)) return res.status(404).json({ error: 'Notification not found.' })
  const notification = getRow<{ id: number }>('SELECT id FROM notifications WHERE id = ? AND user_id = ?', notificationId, req.user!.id)
  if (!notification) return res.status(404).json({ error: 'Notification not found.' })
  database.prepare('UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ?')
    .run(notificationId)
  return res.json({ ok: true })
})

app.get('/api/messages', requireAuth, (req, res) => {
  if (req.user!.role === 'admin') {
    const conversations = getRows<{
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
    `, req.user!.id).map((conversation) => ({
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

  const messages = getConversationMessages(req.user!.id, req.user!.id)
  return res.json({ messages })
})

app.get('/api/messages/:sellerId', requireAuth, (req, res) => {
  const sellerId = Number(req.params.sellerId)
  if (!Number.isSafeInteger(sellerId)) return res.status(404).json({ error: 'Conversation not found.' })
  if (req.user!.role !== 'admin' && sellerId !== req.user!.id) return res.status(403).json({ error: 'You can only view your own conversation.' })
  const seller = getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role IN ('seller', 'customer')", sellerId)
  if (!seller) return res.status(404).json({ error: 'Seller not found.' })
  return res.json({ messages: getConversationMessages(sellerId, req.user!.id) })
})

app.post('/api/messages', requireAuth, (req, res) => {
  const body = typeof req.body.body === 'string' ? req.body.body.trim() : ''
  if (!body || body.length > 4000) return res.status(400).json({ error: 'Message must be between 1 and 4000 characters.' })

  let sellerId: number
  let recipientId: number
  let recipient: UserRow | undefined
  if (req.user!.role === 'admin') {
    sellerId = Number(req.body.sellerId)
    recipient = getRow<UserRow>("SELECT * FROM users WHERE id = ? AND role IN ('seller', 'customer')", sellerId)
    if (!recipient) return res.status(404).json({ error: 'Seller not found.' })
    recipientId = recipient.id
  } else {
    sellerId = req.user!.id
    recipient = getRow<UserRow>("SELECT * FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
    if (!recipient) return res.status(503).json({ error: 'The admin inbox is not available yet.' })
    recipientId = recipient.id
  }

  const result = database.prepare(`
    INSERT INTO messages (conversation_seller_id, sender_id, recipient_id, body)
    VALUES (?, ?, ?, ?)
  `).run(sellerId, req.user!.id, recipientId, body)
  database.prepare(`
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
const buyerAddresses = (userId: number) => getRows<{
  id: number, fullName: string, phone: string, address: string, city: string,
  region: string, postalCode: string, country: string, isDefault: number
}>(`
  SELECT id, full_name AS fullName, phone, address, city, region, postal_code AS postalCode,
    country, is_default AS isDefault FROM buyer_addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC
`, userId)

const buyerVisits = (userId: number) => getRows<{ sellerId: number, storeName: string, visitCount: number, lastVisitedAt: string }>(`
  SELECT v.seller_id AS sellerId, COALESCE(p.store_name, u.full_name || ' (store unavailable)') AS storeName, v.visit_count AS visitCount,
    v.last_visited_at AS lastVisitedAt FROM buyer_store_visits v
  JOIN users u ON u.id = v.seller_id LEFT JOIN seller_profiles p ON p.user_id = v.seller_id
  WHERE v.user_id = ? ORDER BY v.last_visited_at DESC
`, userId)

const requestReceipts = (requestId: number) => getRows<{ id: number, coin: string, network: string, walletAddress: string, createdAt: string }>(`
  SELECT id, coin, network, wallet_address AS walletAddress, created_at AS createdAt
  FROM buyer_request_receipts WHERE request_id = ? ORDER BY id DESC
`, requestId)

const walletRequests = (userId?: number) => getRows<{
  id: number, userId: number, fullName: string, email: string, kind: string, coin: string,
  amountCents: number | null, destination: string, status: string, instructions: string,
  paymentCoin: string, walletAddress: string, network: string, createdAt: string
}>(`
  SELECT r.id, r.user_id AS userId, u.full_name AS fullName, u.email, r.kind, r.coin,
    r.amount_cents AS amountCents, r.destination, r.status, r.instructions,
    r.payment_coin AS paymentCoin, r.wallet_address AS walletAddress, r.network, r.created_at AS createdAt
  FROM buyer_wallet_requests r JOIN users u ON u.id = r.user_id
  WHERE (? IS NULL OR r.user_id = ?) ORDER BY r.id DESC
`, userId ?? null, userId ?? null).map((request) => ({ ...request, receipts: requestReceipts(request.id) }))

app.get('/api/buyer/profile', requireAuth, requireRole('customer'), (req, res) => {
  const userId = req.user!.id
  const wallet = getRow<{ balanceCents: number }>('SELECT balance_cents AS balanceCents FROM buyer_wallets WHERE user_id = ?', userId)
  if (!wallet) return res.status(500).json({ error: 'Buyer wallet is unavailable.' })
  const requests = walletRequests(userId)
  const follows = getRows<{ sellerId: number, storeName: string }>(`
    SELECT p.user_id AS sellerId, p.store_name AS storeName FROM store_follows f
    JOIN seller_profiles p ON p.user_id = f.seller_id WHERE f.user_id = ? ORDER BY f.created_at DESC
  `, userId)
  const hasTransactionPassword = Boolean(getRow('SELECT user_id FROM buyer_security WHERE user_id = ?', userId))
  const favorites = getRows<ProductRow>('SELECT p.* FROM products p JOIN buyer_favorites f ON f.product_id = p.id WHERE f.user_id = ? ORDER BY f.created_at DESC', userId).map(publicProduct)
  return res.json({ user: publicUser(req.user!), wallet, addresses: buyerAddresses(userId), visits: buyerVisits(userId), requests, follows, coins: buyerCoins, favorites, hasTransactionPassword })
})

app.get('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Invalid product ID.' })
  return res.json({ isFavorite: Boolean(getRow('SELECT product_id FROM buyer_favorites WHERE user_id = ? AND product_id = ?', req.user!.id, id)) })
})
app.put('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || !getRow('SELECT id FROM products WHERE id = ? AND seller_id IS NOT NULL AND (is_published = 1 OR is_store_published = 1)', id)) return res.status(404).json({ error: 'Product not found.' })
  database.prepare('INSERT OR IGNORE INTO buyer_favorites (user_id, product_id) VALUES (?, ?)').run(req.user!.id, id)
  return res.json({ ok: true })
})
app.delete('/api/buyer/favorites/:id', requireAuth, requireRole('customer'), (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id)) return res.status(400).json({ error: 'Invalid product ID.' })
  database.prepare('DELETE FROM buyer_favorites WHERE user_id = ? AND product_id = ?').run(req.user!.id, id)
  return res.json({ ok: true })
})

app.patch('/api/buyer/account', requireAuth, requireRole('customer'), (req, res) => {
  const fullName = typeof req.body.fullName === 'string' ? req.body.fullName.trim() : ''
  const phone = typeof req.body.phone === 'string' ? req.body.phone.trim() : ''
  if (!fullName || fullName.length > 100 || phone.length > 30) return res.status(400).json({ error: 'Enter a name up to 100 characters and a phone number up to 30 characters.' })
  database.prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?').run(fullName, phone || null, req.user!.id)
  return res.json({ user: publicUser(getRow<UserRow>('SELECT * FROM users WHERE id = ?', req.user!.id)!) })
})

app.put('/api/buyer/password', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : ''
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : ''
  if (Buffer.byteLength(next) < 8 || Buffer.byteLength(next) > 72) return res.status(400).json({ error: 'New password must be between 8 and 72 bytes.' })
  if (!await bcrypt.compare(current, req.user!.password_hash)) return res.status(400).json({ error: 'Current login password is incorrect.' })
  const hash = await bcrypt.hash(next, 12)
  database.transaction(() => {
    database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user!.id)
    database.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(req.user!.id, req.sessionTokenHash)
    database.prepare('DELETE FROM password_resets WHERE user_id = ?').run(req.user!.id)
  })()
  return res.json({ ok: true })
})

app.put('/api/buyer/transaction-password', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const login = typeof req.body.loginPassword === 'string' ? req.body.loginPassword : ''
  const transactionPassword = typeof req.body.transactionPassword === 'string' ? req.body.transactionPassword : ''
  if (Buffer.byteLength(transactionPassword) < 8 || Buffer.byteLength(transactionPassword) > 72) return res.status(400).json({ error: 'Transaction password must be between 8 and 72 bytes.' })
  if (!await bcrypt.compare(login, req.user!.password_hash)) return res.status(400).json({ error: 'Login password is incorrect.' })
  const hash = await bcrypt.hash(transactionPassword, 12)
  database.prepare('INSERT INTO buyer_security (user_id, transaction_password_hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET transaction_password_hash = excluded.transaction_password_hash').run(req.user!.id, hash)
  return res.json({ ok: true })
})

app.post('/api/buyer/cancellation-request', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const password = typeof req.body.password === 'string' ? req.body.password : ''
  if (!await bcrypt.compare(password, req.user!.password_hash)) return res.status(400).json({ error: 'Login password is incorrect.' })
  if (getRow("SELECT id FROM cancellation_requests WHERE user_id = ? AND status = 'pending'", req.user!.id)) return res.status(409).json({ error: 'You already have a pending cancellation request.' })
  database.transaction(() => {
    database.prepare('INSERT INTO cancellation_requests (user_id) VALUES (?)').run(req.user!.id)
    database.prepare("INSERT INTO notifications (user_id, type, title, body, link) SELECT id, 'cancellation', ?, ?, ? FROM users WHERE role = 'admin'").run('Account cancellation requested', `${req.user!.full_name} (#${req.user!.id}) requested account cancellation.`, `/admin/users/${req.user!.id}`)
  })()
  return res.status(201).json({ ok: true })
})

const demoOrders = (userId: number) => getRows<{ id: number, status: string, totalCents: number, createdAt: string, billingJson: string, paymentMethod: string }>(
  'SELECT id, status, total_cents AS totalCents, created_at AS createdAt, billing_json AS billingJson, payment_method AS paymentMethod FROM demo_orders WHERE user_id = ? ORDER BY id DESC', userId
).map((order) => ({
  id: order.id, status: order.status, totalCents: order.totalCents, createdAt: order.createdAt, paymentMethod: order.paymentMethod, billing: JSON.parse(order.billingJson),
  items: getRows('SELECT product_id AS productId, name, price_cents AS priceCents, quantity, color, size, image_url AS imageUrl FROM demo_order_items WHERE order_id = ?', order.id),
  history: getRows('SELECT status, created_at AS createdAt FROM demo_order_status_history WHERE order_id = ? ORDER BY id', order.id),
}))

app.get('/api/buyer/orders', requireAuth, requireRole('customer'), (req, res) => res.json({ orders: demoOrders(req.user!.id) }))

app.post('/api/buyer/orders', requireAuth, requireRole('customer'), (req, res) => {
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
    const product = getRow<ProductRow>('SELECT * FROM products WHERE id = ? AND seller_id IS NOT NULL AND (is_published = 1 OR is_store_published = 1)', item.id)
    if (!product) return res.status(400).json({ error: 'A product is no longer available. Update your cart.' })
    snapshots.push({ product, quantity: item.quantity, color: item.selectedColor, size: item.selectedSize })
  }
  const subtotal = snapshots.reduce((sum, item) => sum + Math.round(item.product.price * 100) * item.quantity, 0)
  const shipping = subtotal === 0 || subtotal >= 7500 ? 0 : 795
  const total = subtotal + shipping + Math.round((subtotal + shipping) * 0.08)
  if (!Number.isSafeInteger(total)) return res.status(400).json({ error: 'Test order total is too large.' })
  const id = database.transaction(() => {
    const result = database.prepare('INSERT INTO demo_orders (user_id, total_cents, billing_json, payment_method) VALUES (?, ?, ?, ?)').run(req.user!.id, total, JSON.stringify(Object.fromEntries(billingFields.map((field) => [field, billing[field].trim()]))), paymentMethod)
    const orderId = Number(result.lastInsertRowid)
    const insert = database.prepare('INSERT INTO demo_order_items (order_id, product_id, name, price_cents, quantity, color, size, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    for (const item of snapshots) insert.run(orderId, item.product.id, item.product.name, Math.round(item.product.price * 100), item.quantity, item.color, item.size, item.product.image_url)
    database.prepare("INSERT INTO demo_order_status_history (order_id, status) VALUES (?, 'pending')").run(orderId)
    return orderId
  })()
  return res.status(201).json({ id, totalCents: total })
})

app.patch('/api/admin/demo-orders/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const status = req.body.status
  if (!Number.isSafeInteger(id) || !['pending', 'on_the_way', 'delivered', 'returned'].includes(status)) return res.status(400).json({ error: 'Invalid test order status.' })
  const order = getRow<{ user_id: number, status: string }>('SELECT user_id, status FROM demo_orders WHERE id = ?', id)
  if (!order) return res.status(404).json({ error: 'Test order not found.' })
  if (order.status !== status) database.transaction(() => {
    database.prepare('UPDATE demo_orders SET status = ? WHERE id = ?').run(status, id)
    database.prepare('INSERT INTO demo_order_status_history (order_id, status) VALUES (?, ?)').run(id, status)
    database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'demo_order', ?, ?, '/profile/orders')").run(order.user_id, `Test order #${id} updated`, `Test status: ${status.replaceAll('_', ' ')}. No real fulfillment is tracked.`)
  })()
  return res.json({ ok: true })
})

app.patch('/api/admin/cancellation-requests/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const status = req.body.status
  if (!Number.isSafeInteger(id) || !['reviewed', 'declined'].includes(status)) return res.status(400).json({ error: 'Invalid review status.' })
  const request = getRow<{ user_id: number }>("SELECT user_id FROM cancellation_requests WHERE id = ? AND status = 'pending'", id)
  if (!request) return res.status(404).json({ error: 'Pending request not found.' })
  database.transaction(() => {
    database.prepare('UPDATE cancellation_requests SET status = ? WHERE id = ?').run(status, id)
    database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'cancellation', 'Cancellation request reviewed', ?, '/profile/setup')").run(request.user_id, `Your request was marked ${status}. Your account has not been deleted.`)
  })()
  return res.json({ ok: true })
})

app.post('/api/buyer/addresses', requireAuth, requireRole('customer'), (req, res) => {
  const fields = ['fullName', 'phone', 'address', 'city', 'region', 'postalCode', 'country'] as const
  const values = fields.map((field) => typeof req.body[field] === 'string' ? req.body[field].trim() : '')
  if (values.some((value) => !value || value.length > 200)) return res.status(400).json({ error: 'Complete every address field using at most 200 characters each.' })
  const insert = database.transaction(() => {
    const count = getRow<{ count: number }>('SELECT COUNT(*) AS count FROM buyer_addresses WHERE user_id = ?', req.user!.id)!.count
    if (count >= 20) return false
    const makeDefault = count === 0 || req.body.isDefault === true
    if (makeDefault) database.prepare('UPDATE buyer_addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id)
    database.prepare(`
      INSERT INTO buyer_addresses (user_id, full_name, phone, address, city, region, postal_code, country, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(req.user!.id, ...values, makeDefault ? 1 : 0)
    return true
  })
  if (!insert()) return res.status(400).json({ error: 'You can save up to 20 addresses.' })
  return res.status(201).json({ addresses: buyerAddresses(req.user!.id) })
})

app.patch('/api/buyer/addresses/:id/default', requireAuth, requireRole('customer'), (req, res) => {
  const id = Number(req.params.id)
  const address = getRow<{ id: number }>('SELECT id FROM buyer_addresses WHERE id = ? AND user_id = ?', id, req.user!.id)
  if (!address) return res.status(404).json({ error: 'Address not found.' })
  database.transaction(() => {
    database.prepare('UPDATE buyer_addresses SET is_default = 0 WHERE user_id = ?').run(req.user!.id)
    database.prepare('UPDATE buyer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?').run(id, req.user!.id)
  })()
  return res.json({ addresses: buyerAddresses(req.user!.id) })
})

app.post('/api/buyer/requests', authLimiter, requireAuth, requireRole('customer'), async (req, res) => {
  const { kind, coin } = req.body
  const amountCents = req.body.amountCents ?? null
  const destination = typeof req.body.destination === 'string' ? req.body.destination.trim() : ''
  if (!['deposit', 'withdrawal'].includes(kind) || !buyerCoins.includes(coin) || (amountCents === null ? kind !== 'deposit' : !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100000000) || destination.length > 500 || (kind === 'withdrawal' && !destination)) {
    return res.status(400).json({ error: 'Choose a supported coin, a valid amount and a withdrawal destination when required.' })
  }
  const security = getRow<{ transaction_password_hash: string }>('SELECT transaction_password_hash FROM buyer_security WHERE user_id = ?', req.user!.id)
  if (!security) return res.status(403).json({ error: 'Set a transaction password in Setup before making a request.' })
  const password = typeof req.body.transactionPassword === 'string' ? req.body.transactionPassword : ''
  if (!await bcrypt.compare(password, security.transaction_password_hash)) return res.status(403).json({ error: 'Transaction password is incorrect.' })
  const id = database.transaction(() => {
    const result = database.prepare('INSERT INTO buyer_wallet_requests (user_id, kind, coin, amount_cents, destination) VALUES (?, ?, ?, ?, ?)').run(req.user!.id, kind, coin, amountCents, destination)
    database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_request', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Buyer ${kind} request`, `${req.user!.full_name} (#${req.user!.id}) requested ${coin}.`, `/admin/users/${req.user!.id}#buyer-controls`)
    return result.lastInsertRowid
  })()
  return res.status(201).json({ id })
})

app.patch('/api/buyer/requests/:id/amount', requireAuth, requireRole('customer'), (req, res) => {
  const id = Number(req.params.id)
  const { amountCents } = req.body
  if (!Number.isSafeInteger(id) || !Number.isSafeInteger(amountCents) || amountCents < 1 || amountCents > 100000000) return res.status(400).json({ error: 'Enter an amount between $0.01 and $1,000,000.' })
  const request = getRow<{ id: number, status: string, wallet_address: string, kind: string, amount_cents: number | null }>(
    'SELECT id, status, wallet_address, kind, amount_cents FROM buyer_wallet_requests WHERE id = ? AND user_id = ?', id, req.user!.id,
  )
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.kind !== 'deposit' || request.status !== 'pending' || !request.wallet_address || request.amount_cents !== null) return res.status(409).json({ error: 'The amount can only be set once after wallet details are provided for a pending deposit.' })
  database.transaction(() => {
    database.prepare('UPDATE buyer_wallet_requests SET amount_cents = ? WHERE id = ?').run(amountCents, id)
    database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_request', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Deposit amount for request #${id}`, `${req.user!.full_name} (#${req.user!.id}) entered a deposit amount.`, `/admin/users/${req.user!.id}#buyer-controls`)
  })()
  return res.json({ ok: true })
})

app.post('/api/buyer/requests/:id/receipt', requireAuth, requireRole('customer'), express.raw({ type: ['image/png', 'image/jpeg'], limit: '2mb' }), (req, res) => {
  const requestId = Number(req.params.id)
  const request = getRow<{ id: number, user_id: number, kind: string, status: string, payment_coin: string, wallet_address: string, network: string, amount_cents: number | null }>(
    'SELECT id, user_id, kind, status, payment_coin, wallet_address, network, amount_cents FROM buyer_wallet_requests WHERE id = ? AND user_id = ?', requestId, req.user!.id,
  )
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.kind !== 'deposit' || request.status !== 'pending' || !request.wallet_address) return res.status(400).json({ error: 'A pending deposit with payment instructions is required.' })
  if (request.amount_cents === null) return res.status(400).json({ error: 'Enter the deposit amount before uploading a screenshot.' })
  const image = req.body
  const png = Buffer.isBuffer(image) && image.length >= 8 && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  const jpeg = Buffer.isBuffer(image) && image.length >= 3 && image[0] === 255 && image[1] === 216 && image[2] === 255
  if ((!png && !jpeg) || (png && !req.is('image/png')) || (jpeg && !req.is('image/jpeg'))) return res.status(400).json({ error: 'Upload a PNG or JPEG screenshot up to 2 MB.' })
  const count = getRow<{ count: number }>('SELECT COUNT(*) AS count FROM buyer_request_receipts WHERE request_id = ?', request.id)!.count
  if (count >= 10) return res.status(400).json({ error: 'This request already has 10 screenshots. Contact the administrator.' })
  database.transaction(() => {
    database.prepare('INSERT INTO buyer_request_receipts (request_id, content_type, image, wallet_address, network, coin) VALUES (?, ?, ?, ?, ?, ?)')
      .run(request.id, png ? 'image/png' : 'image/jpeg', image, request.wallet_address, request.network, request.payment_coin)
    database.prepare(`
      INSERT INTO notifications (user_id, type, title, body, link)
      SELECT id, 'buyer_receipt', ?, ?, ? FROM users WHERE role = 'admin'
    `).run(`Screenshot for request #${request.id}`, `${req.user!.full_name} (#${req.user!.id}) submitted a payment screenshot. Verify independently.`, `/admin/users/${req.user!.id}#buyer-controls`)
  })()
  return res.status(201).json({ ok: true })
})

app.get('/api/admin/receipts/:id', requireAuth, requireRole('admin'), (req, res) => {
  const receipt = getRow<{ image: Buffer, content_type: string }>('SELECT image, content_type FROM buyer_request_receipts WHERE id = ?', Number(req.params.id))
  if (!receipt) return res.status(404).json({ error: 'Screenshot not found.' })
  res.set('Cache-Control', 'no-store')
  res.set('Content-Disposition', `attachment; filename="receipt-${Number(req.params.id)}.${receipt.content_type === 'image/png' ? 'png' : 'jpg'}"`)
  return res.type(receipt.content_type).send(receipt.image)
})

app.get('/api/admin/buyers', requireAuth, requireRole('admin'), (_req, res) => {
  const buyers = getRows<{ id: number, fullName: string, email: string, phone: string | null, createdAt: string, balanceCents: number }>(`
    SELECT u.id, u.full_name AS fullName, u.email, u.phone, u.created_at AS createdAt, w.balance_cents AS balanceCents
    FROM users u JOIN buyer_wallets w ON w.user_id = u.id WHERE u.role = 'customer' ORDER BY u.id DESC
  `).map((buyer) => ({ ...buyer, visits: buyerVisits(buyer.id), addresses: buyerAddresses(buyer.id) }))
  const requests = walletRequests()
  return res.json({ buyers, requests })
})

app.patch('/api/admin/buyers/:id/balance', requireAuth, requireRole('admin'), (req, res) => {
  const userId = Number(req.params.id)
  const { balanceCents } = req.body
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : ''
  if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(balanceCents) || balanceCents < 0 || balanceCents > 100000000 || !reason || reason.length > 500) {
    return res.status(400).json({ error: 'Enter a valid demo balance and a reason (up to 500 characters).' })
  }
  const wallet = getRow<{ balance_cents: number }>(`
    SELECT w.balance_cents FROM buyer_wallets w JOIN users u ON u.id = w.user_id WHERE u.id = ? AND u.role = 'customer'
  `, userId)
  if (!wallet) return res.status(404).json({ error: 'Buyer not found.' })
  database.transaction(() => {
    database.prepare('UPDATE buyer_wallets SET balance_cents = ? WHERE user_id = ?').run(balanceCents, userId)
    database.prepare('INSERT INTO buyer_balance_history (user_id, admin_id, old_cents, new_cents, reason) VALUES (?, ?, ?, ?, ?)').run(userId, req.user!.id, wallet.balance_cents, balanceCents, reason)
    database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'balance', 'Demo balance updated', ?, '/profile/wallet')").run(userId, reason)
  })()
  return res.json({ balanceCents })
})

app.patch('/api/admin/buyer-requests/:id', requireAuth, requireRole('admin'), (req, res) => {
  const id = Number(req.params.id)
  const { status } = req.body
  const instructions = typeof req.body.instructions === 'string' ? req.body.instructions.trim() : ''
  if (!Number.isSafeInteger(id) || !['pending', 'confirmed', 'rejected'].includes(status) || instructions.length > 2000) return res.status(400).json({ error: 'Enter a valid request status and instructions.' })
  const request = getRow<{ user_id: number, status: string, kind: string, payment_coin: string, network: string, wallet_address: string, amount_cents: number | null }>('SELECT user_id, status, kind, payment_coin, network, wallet_address, amount_cents FROM buyer_wallet_requests WHERE id = ?', id)
  if (!request) return res.status(404).json({ error: 'Request not found.' })
  if (request.status !== 'pending') return res.status(409).json({ error: 'This request has already been resolved.' })
  if (status === 'confirmed' && request.kind === 'deposit' && request.amount_cents === null) return res.status(400).json({ error: 'The buyer must enter the deposit amount before confirmation.' })
  const paymentCoin = typeof req.body.paymentCoin === 'string' ? req.body.paymentCoin.trim() : request.payment_coin
  const network = typeof req.body.network === 'string' ? req.body.network.trim() : request.network
  const walletAddress = typeof req.body.walletAddress === 'string' ? req.body.walletAddress.trim() : request.wallet_address
  if (network.length > 100 || walletAddress.length > 500 || (paymentCoin && !buyerCoins.includes(paymentCoin))) return res.status(400).json({ error: 'Enter a supported coin, network and wallet address.' })
  if (status === 'pending' && request.kind === 'deposit' && (!paymentCoin || !network || !walletAddress)) return res.status(400).json({ error: 'Choose a payment coin and enter its network and wallet address.' })
  if (status === 'pending' && request.kind !== 'deposit' && !instructions) return res.status(400).json({ error: 'Enter instructions before sending.' })
  database.transaction(() => {
    database.prepare('UPDATE buyer_wallet_requests SET status = ?, instructions = ?, payment_coin = ?, network = ?, wallet_address = ? WHERE id = ?').run(status, instructions, paymentCoin, network, walletAddress, id)
    database.prepare("INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'buyer_request', ?, ?, '/profile/wallet')").run(request.user_id, `Request #${id} ${status === 'pending' ? 'updated' : status}`, instructions || 'Your request status has been updated.')
  })()
  return res.json({ ok: true })
})

app.get('/api/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
  const users = getRows<AdminUserRow>(`
    SELECT id, full_name, email, phone, role, created_at
    FROM users ORDER BY id
  `).map((user) => ({
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.created_at,
  }))
  return res.json({ users })
})

app.get('/api/admin/users/:id/details', requireAuth, requireRole('admin'), (req, res) => {
  const userId = Number(req.params.id)
  if (!Number.isSafeInteger(userId) || userId < 1) return res.status(404).json({ error: 'User not found.' })
  const user = getRow<{ id: number, fullName: string, email: string, phone: string | null, role: UserRole, createdAt: string }>(`
    SELECT id, full_name AS fullName, email, phone, role, created_at AS createdAt FROM users WHERE id = ?
  `, userId)
  if (!user) return res.status(404).json({ error: 'User not found.' })
  const wallet = getRow<{ balanceCents: number }>('SELECT balance_cents AS balanceCents FROM buyer_wallets WHERE user_id = ?', userId)
  const seller = getRow(`
    SELECT store_name AS storeName, store_description AS storeDescription, logo_url AS logoUrl,
      country, address, city, region, postal_code AS postalCode, verification_status AS verificationStatus,
      follower_count AS followerCount, visitor_count AS visitorCount
    FROM seller_profiles WHERE user_id = ?
  `, userId)
  const events = getRows('SELECT event_type AS type, created_at AS createdAt FROM auth_events WHERE user_id = ? ORDER BY id DESC LIMIT 200', userId)
  const balanceHistory = getRows(`
    SELECT h.old_cents AS oldCents, h.new_cents AS newCents, h.reason, h.created_at AS createdAt,
      u.full_name AS adminName FROM buyer_balance_history h JOIN users u ON u.id = h.admin_id WHERE h.user_id = ? ORDER BY h.id DESC
  `, userId)
  const balanceResets = getRows('SELECT previous_cents AS previousCents, reset_at AS resetAt FROM buyer_balance_reset_audit WHERE user_id = ? ORDER BY reset_at DESC', userId)
  const products = getRows<ProductRow>('SELECT * FROM products WHERE seller_id = ? ORDER BY id DESC', userId).map(publicProduct)
  const cancellationRequests = getRows('SELECT id, status, created_at AS createdAt FROM cancellation_requests WHERE user_id = ? ORDER BY id DESC', userId)
  const favorites = getRows<ProductRow>('SELECT p.* FROM products p JOIN buyer_favorites f ON f.product_id = p.id WHERE f.user_id = ? ORDER BY f.created_at DESC', userId).map(publicProduct)
  const follows = getRows('SELECT p.user_id AS sellerId, p.store_name AS storeName FROM store_follows f JOIN seller_profiles p ON p.user_id = f.seller_id WHERE f.user_id = ? ORDER BY f.created_at DESC', userId)
  const metricsRow = getRow<{ metrics_json: string }>('SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?', userId)
  const sellerMetrics = metricsRow ? JSON.parse(metricsRow.metrics_json) : null
  return res.json({ user, wallet: wallet || null, seller: seller || null, addresses: buyerAddresses(userId), visits: buyerVisits(userId), requests: walletRequests(userId), events, balanceHistory, balanceResets, products, orders: demoOrders(userId), cancellationRequests, favorites, follows, sellerMetrics })
})

app.patch('/api/admin/users/:id/role', requireAuth, requireRole('admin'), (req, res) => {
  const userId = Number(req.params.id)
  const role = req.body.role
  if (!Number.isSafeInteger(userId) || !['customer', 'seller'].includes(role)) {
    return res.status(400).json({ error: 'Choose a valid user ID and a customer or seller role.' })
  }
  const result = database.prepare('UPDATE users SET role = ? WHERE id = ? AND role != ?').run(role, userId, 'admin')
  if (!result.changes) return res.status(404).json({ error: 'User not found or the admin role cannot be changed here.' })
  if (role === 'customer') database.prepare('INSERT OR IGNORE INTO buyer_wallets (user_id, balance_cents) VALUES (?, 0)').run(userId)
  return res.json({ ok: true })
})

app.get('/api/admin/products', requireAuth, requireRole('admin'), (_req, res) => {
  const products = getRows<ProductRow>('SELECT * FROM products ORDER BY created_at DESC, id DESC')
  return res.json({ products: products.map(publicProduct) })
})

app.get('/api/admin/sellers', requireAuth, requireRole('admin'), (_req, res) => {
  const sellers = getRows<AdminSellerRow>(`
    SELECT users.id, users.full_name, users.email, users.phone, users.created_at,
      seller_profiles.store_name, seller_profiles.store_description, seller_profiles.logo_url AS store_logo_url, seller_profiles.country,
      seller_profiles.address, seller_profiles.city, seller_profiles.region,
      seller_profiles.postal_code, seller_profiles.verification_status,
      seller_profiles.follower_count, seller_profiles.visitor_count,
      (SELECT COUNT(*) FROM store_follows WHERE seller_id = users.id) AS actual_follow_count
    FROM users
    LEFT JOIN seller_profiles ON seller_profiles.user_id = users.id
    WHERE users.role = 'seller'
    ORDER BY users.id DESC
  `).map((seller) => ({
    id: seller.id,
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

app.get('/api/admin/sellers/:id/dashboard-metrics', requireAuth, requireRole('admin'), (req, res) => {
  const sellerId = Number(req.params.id)
  const seller = getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role = 'seller'", sellerId)
  if (!seller) return res.status(404).json({ error: 'Seller not found.' })
  const record = getRow<{ metrics_json: string }>(
    'SELECT metrics_json FROM seller_dashboard_metrics WHERE user_id = ?',
    sellerId,
  )
  let metrics: Record<string, unknown> = {}
  if (record) {
    try {
      metrics = JSON.parse(record.metrics_json) as Record<string, unknown>
    } catch {
      metrics = {}
    }
  }
  const store = getRow<{ follower_count: number }>('SELECT follower_count FROM seller_profiles WHERE user_id = ?', sellerId)
  return res.json({ metrics, adminFollowerCount: store?.follower_count ?? 0 })
})

app.put('/api/admin/sellers/:id/dashboard-metrics', requireAuth, requireRole('admin'), (req, res) => {
  const sellerId = Number(req.params.id)
  const seller = getRow<{ id: number }>("SELECT id FROM users WHERE id = ? AND role = 'seller'", sellerId)
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
      const product = getRow<{ id: number }>('SELECT id FROM products WHERE id = ? AND seller_id = ?', productId, sellerId)
      if (!Number.isSafeInteger(productId) || !product || !Number.isSafeInteger(salesVolume) || salesVolume < 0 || salesVolume > 1000000000) {
        return res.status(400).json({ error: 'Top products must belong to this seller and have a non-negative whole-number sales volume.' })
      }
      topProducts.push({ productId, salesVolume })
    }
    metrics.topProducts = topProducts
  }

  const savedMetrics = JSON.stringify(metrics)
  database.prepare(`
    INSERT INTO seller_dashboard_metrics (user_id, metrics_json, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id) DO UPDATE SET metrics_json = excluded.metrics_json, updated_at = CURRENT_TIMESTAMP
  `).run(sellerId, savedMetrics)
  return res.json({ metrics })
})

app.delete('/api/admin/sellers/:id/store', requireAuth, requireRole('admin'), (req, res) => {
  const sellerId = Number(req.params.id)
  if (!Number.isSafeInteger(sellerId)) return res.status(400).json({ error: 'Choose a valid seller ID.' })
  const result = database.prepare('DELETE FROM seller_profiles WHERE user_id = ?').run(sellerId)
  if (!result.changes) return res.status(404).json({ error: 'Store not found.' })
  database.prepare('UPDATE products SET is_store_published = 0 WHERE seller_id = ?').run(sellerId)
  return res.json({ ok: true })
})

app.patch('/api/admin/sellers/:id/stats', requireAuth, requireRole('admin'), (req, res) => {
  const sellerId = Number(req.params.id)
  const followerCount = Number(req.body.followerCount)
  if (!Number.isSafeInteger(sellerId) || !Number.isSafeInteger(followerCount) || followerCount < 0 || followerCount > 1000000000) {
    return res.status(400).json({ error: 'Enter a whole-number follower amount between 0 and 1,000,000,000.' })
  }
  const result = database.prepare('UPDATE seller_profiles SET follower_count = ? WHERE user_id = ?')
    .run(followerCount, sellerId)
  if (!result.changes) return res.status(404).json({ error: 'Store not found.' })
  const actualFollowers = getRow<{ count: number }>('SELECT COUNT(*) AS count FROM store_follows WHERE seller_id = ?', sellerId)?.count ?? 0
  return res.json({ followerCount: followerCount + actualFollowers, adminFollowerCount: followerCount })
})

app.get('/api/admin/events', requireAuth, requireRole('admin'), (_req, res) => {
  const events = getRows<AdminEventRow>(`
    SELECT auth_events.id, auth_events.event_type, auth_events.created_at,
      users.id AS user_id, users.full_name, users.email
    FROM auth_events
    JOIN users ON users.id = auth_events.user_id
    ORDER BY auth_events.id DESC
    LIMIT 100
  `).map((event) => ({
    id: event.id,
    type: event.event_type,
    createdAt: event.created_at,
    userId: event.user_id,
    fullName: event.full_name,
    email: event.email,
  }))
  return res.json({ events })
})

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }))

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error)
  if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'The upload is too large. Screenshots must be at most 2 MB.' })
  return res.status(500).json({ error: 'Something went wrong on the server.' })
})

await seedAdmin()
app.listen(port, () => console.log(`GGU API listening on http://localhost:${port}`))
