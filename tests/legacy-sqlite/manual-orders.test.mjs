import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'
import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'

test('manual coin order keeps payment and seller access isolated', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'purchase-test-'))
  const reservation = createServer().listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise((resolve) => reservation.close(resolve))
  const start = () => spawn(process.execPath, ['dist-server/index.js'], { env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test', PORT: String(port), DATABASE_PATH: join(dir, 'test.db'), ADMIN_EMAIL: 'admin@example.test', ADMIN_PASSWORD: 'test-admin-password', SMTP_HOST: '', SMTP_PORT: '', SMTP_USER: '', SMTP_PASSWORD: '', EMAIL_FROM: '' }, stdio: 'ignore' })
  let server = start()
  const base = `http://127.0.0.1:${port}`
  const request = async (path, { cookie, method = 'GET', body, raw } = {}) => {
    const response = await fetch(base + path, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(raw ? { 'Content-Type': 'image/png' } : {}) }, ...(body ? { body: JSON.stringify(body) } : raw ? { body: raw } : {}) })
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  try {
    let ready = false
    for (let i = 0; i < 100; i++) { try { await request('/api/health'); ready = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) } }
    assert.ok(ready)
    const admin = await request('/api/auth/login', { method: 'POST', body: { email: 'admin@example.test', password: 'test-admin-password' } })
    const createUser = (name) => request('/api/auth/register', { method: 'POST', body: { fullName: name, email: `${name}@example.test`, password: 'buyer-password' } })
    const buyer = await createUser('buyer')
    const other = await createUser('other')
    const a = await createUser('seller-a')
    const b = await createUser('seller-b')
    const c = await createUser('seller-c')
    for (const seller of [a, b, c]) assert.equal((await request(`/api/admin/users/${seller.data.user.id}/role`, { cookie: admin.cookie, method: 'PATCH', body: { role: 'seller' } })).status, 200)
    const pngImage = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=', 'base64')
    const upload = { type: 'image/png', data: pngImage.toString('base64') }
    const uploadedBody = { name: 'Uploaded photo', category: 'Home', price: 8, imageUploads: { primary: upload, gallery: [upload] } }
    assert.equal((await request('/api/seller/products', { cookie: buyer.cookie, method: 'POST', body: uploadedBody })).status, 403)
    assert.equal((await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { ...uploadedBody, imageUploads: { primary: { ...upload, type: 'image/jpeg' } } } })).status, 400)
    assert.equal((await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { ...uploadedBody, imageUploads: { primary: { ...upload, data: 'invalid!' } } } })).status, 400)
    assert.equal((await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { ...uploadedBody, imageUploads: { primary: upload, gallery: Array(8).fill(upload) } } })).status, 400)
    assert.equal((await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { ...uploadedBody, imageUploads: { primary: { type: 'image/png', data: Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64') } } } })).status, 400)
    assert.equal((await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { ...uploadedBody, name: '' } })).status, 400)
    const inspection = new Database(join(dir, 'test.db'), { readonly: true })
    assert.equal(inspection.prepare('SELECT COUNT(*) AS count FROM product_images').get().count, 0)
    inspection.close()
    const uploaded = await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: uploadedBody })
    assert.equal(uploaded.status, 201)
    assert.match(uploaded.data.product.imageUrl, /^\/api\/product-images\/[a-f0-9]{64}$/)
    assert.equal(uploaded.data.product.imageUrls.length, 2)
    const imageResponse = await fetch(base + uploaded.data.product.imageUrl)
    assert.equal(imageResponse.headers.get('content-type'), 'image/png')
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()), pngImage)
    assert.equal((await request(`/api/seller/products/${uploaded.data.product.id}`, { cookie: b.cookie, method: 'PATCH', body: { imageUploads: { primary: upload } } })).status, 403)
    assert.equal((await request(`/api/seller/products/${uploaded.data.product.id}`, { cookie: a.cookie, method: 'PATCH', body: { name: 'Edited photo product' } })).status, 200)
    const replaced = await request(`/api/seller/products/${uploaded.data.product.id}`, { cookie: a.cookie, method: 'PATCH', body: { imageUploads: { primary: upload }, imageUrls: [] } })
    assert.equal(replaced.status, 200)
    assert.notEqual(replaced.data.product.imageUrl, uploaded.data.product.imageUrl)
    assert.equal(replaced.data.product.imageUrls.length, 1)
    const samples = (await request('/api/warehouse', { cookie: admin.cookie })).data.products
    assert.equal(samples.filter((p) => p.name.startsWith('Sample: ')).length, 21)
    assert.equal(new Set(samples.map((p) => p.category.split(' / ')[0])).size, 21)
    const deletedSample = samples[0]
    assert.equal((await request(`/api/admin/warehouse/${deletedSample.id}`, { cookie: admin.cookie, method: 'DELETE' })).status, 200)
    const warehouseProduct = { name: 'Shared product', category: 'Food & Beverage / Tea', imageUrl: 'https://example.test/tea.png', price: 12, description: 'Tea' }
    assert.equal((await request('/api/admin/warehouse', { cookie: a.cookie, method: 'POST', body: warehouseProduct })).status, 403)
    const warehouse = await request('/api/admin/warehouse', { cookie: admin.cookie, method: 'POST', body: warehouseProduct })
    assert.equal(warehouse.status, 201)
    assert.equal((await request('/api/warehouse', { cookie: buyer.cookie })).status, 403)
    assert.equal((await request('/api/warehouse', { cookie: a.cookie })).data.products[0].category, warehouseProduct.category)
    const imported = await request(`/api/seller/warehouse/${warehouse.data.product.id}/import`, { cookie: a.cookie, method: 'POST' })
    assert.equal(imported.status, 201)
    assert.equal((await request(`/api/seller/warehouse/${warehouse.data.product.id}/import`, { cookie: a.cookie, method: 'POST' })).status, 409)
    assert.equal((await request('/api/seller/store', { cookie: a.cookie, method: 'PUT', body: { storeName: 'Seller A store' } })).status, 200)
    assert.ok((await request('/api/products')).data.products.some((p) => p.id === imported.data.product.id))
    assert.ok((await request(`/api/stores/${a.data.user.id}`)).data.products.some((p) => p.id === imported.data.product.id))
    assert.ok((await request('/api/products')).data.products.some((p) => p.id === uploaded.data.product.id && p.imageUrl === replaced.data.product.imageUrl))
    assert.ok((await request(`/api/stores/${a.data.user.id}`)).data.products.some((p) => p.id === uploaded.data.product.id && p.imageUrl === replaced.data.product.imageUrl))
    assert.equal(imported.data.product.isStorePublished, true)
    assert.equal((await request(`/api/seller/products/${imported.data.product.id}/stock`, { cookie: b.cookie, method: 'PUT', body: { quantity: 3 } })).status, 404)
    assert.equal((await request(`/api/seller/products/${imported.data.product.id}/stock`, { cookie: a.cookie, method: 'PUT', body: { quantity: -1 } })).status, 400)
    assert.equal((await request(`/api/seller/products/${imported.data.product.id}/stock`, { cookie: a.cookie, method: 'PUT', body: { quantity: 0 } })).status, 200)
    assert.equal((await request('/api/seller/stock', { cookie: a.cookie })).data.stock[0].quantity, 0)
    assert.equal((await request(`/api/admin/warehouse/${warehouse.data.product.id}`, { cookie: admin.cookie, method: 'PUT', body: { ...warehouseProduct, name: 'Updated tea' } })).status, 200)
    assert.equal((await request(`/api/products/${imported.data.product.id}`)).data.product.name, 'Shared product')
    assert.equal((await request(`/api/admin/warehouse/${warehouse.data.product.id}`, { cookie: admin.cookie, method: 'DELETE' })).status, 200)
    assert.equal((await request(`/api/products/${imported.data.product.id}`)).status, 200)
    const listing = { name: 'Selected options', category: "Men's Clothing / Men's Shirts", imageUrl: 'https://example.test/shirt.png', price: 10, compareAtPrice: 20, colors: ['Black', 'Custom shade'], sizes: ['M', 'Custom size'], stockQuantity: 5 }
    const createdListing = await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: listing })
    assert.equal(createdListing.status, 201)
    const listingId = createdListing.data.product.id
    const exactRelated = await request('/api/seller/products', { cookie: b.cookie, method: 'POST', body: { ...listing, name: 'Same category' } })
    const otherRelated = await request('/api/seller/products', { cookie: b.cookie, method: 'POST', body: { ...listing, name: 'Same parent', category: "Men's Clothing / Tie" } })
    const hiddenRelated = await request('/api/seller/products', { cookie: b.cookie, method: 'POST', body: { ...listing, name: 'Hidden', isPublished: false, isStorePublished: false } })
    const unrelated = await request('/api/seller/products', { cookie: b.cookie, method: 'POST', body: { ...listing, name: 'Different category', category: 'Kids Toys / Plush Toy' } })
    const detail = (await request(`/api/products/${listingId}`)).data
    assert.equal(detail.product.sellerReportedStock, 5)
    assert.deepEqual(detail.product.colors, listing.colors)
    assert.deepEqual(detail.product.sizes, listing.sizes)
    assert.equal(detail.relatedProducts[0].id, exactRelated.data.product.id)
    assert.ok(detail.relatedProducts.some((p) => p.id === otherRelated.data.product.id))
    assert.ok(!detail.relatedProducts.some((p) => [listingId, hiddenRelated.data.product.id, unrelated.data.product.id].includes(p.id)))
    assert.ok((await request('/api/discounts')).data.products.some((p) => p.id === listingId))
    assert.equal((await request(`/api/seller/products/${listingId}`, { cookie: a.cookie, method: 'PATCH', body: { price: 11, stockQuantity: -1 } })).status, 400)
    assert.equal((await request(`/api/products/${listingId}`)).data.product.price, 10)
    assert.equal((await request(`/api/seller/products/${listingId}`, { cookie: b.cookie, method: 'PATCH', body: { stockQuantity: 3 } })).status, 403)
    for (const count of [1, 5, 6, 0, null]) {
      assert.equal((await request(`/api/seller/products/${listingId}`, { cookie: a.cookie, method: 'PATCH', body: { stockQuantity: count } })).status, 200)
      assert.equal((await request(`/api/products/${listingId}`)).data.product.sellerReportedStock, count)
    }
    assert.equal((await request(`/api/seller/products/${listingId}`, { cookie: a.cookie, method: 'PATCH', body: { compareAtPrice: null } })).status, 200)
    assert.ok(!(await request('/api/discounts')).data.products.some((p) => p.id === listingId))
    const product = (seller, name) => request('/api/seller/products', { cookie: seller.cookie, method: 'POST', body: { name, category: 'Home', imageUrl: 'https://example.test/image.png', price: 10 } })
    const first = await product(a, 'A product')
    const second = await product(b, 'B product')
    assert.equal(first.status, 201)
    assert.equal(second.status, 201)
    const billing = { fullName: 'Buyer Name', email: 'private@example.test', phone: 'secret-phone', address: 'secret-address', city: 'City', region: 'Region', postalCode: '123', country: 'Country' }
    const body = { requestKey: randomUUID(), coin: 'BTC', billing, items: [first, second].map((p) => ({ id: p.data.product.id, quantity: 1, selectedColor: '', selectedSize: '' })) }
    assert.equal((await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: { ...body, coin: 'VISA' } })).status, 400)
    assert.equal((await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body })).status, 409)
    assert.deepEqual((await request('/api/payment-coins')).data.coins, [])
    assert.equal((await request('/api/admin/payment-wallets/BTC', { cookie: buyer.cookie, method: 'PUT', body: { address: 'wallet', network: 'testnet', usdRate: '65000' } })).status, 403)
    assert.equal((await request('/api/admin/payment-wallets/BTC', { cookie: admin.cookie, method: 'PUT', body: { address: 'wallet', network: 'testnet', usdRate: '0' } })).status, 400)
    assert.equal((await request('/api/admin/payment-wallets/BTC', { cookie: admin.cookie, method: 'PUT', body: { address: 'wallet-one', network: 'testnet', usdRate: '10000' } })).status, 200)
    assert.deepEqual((await request('/api/payment-coins')).data.coins, ['BTC'])
    const purchase = await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body })
    assert.equal(purchase.status, 201)
    const id = purchase.data.id
    assert.equal((await request(`/api/purchases/${id}/refunds`, { cookie: buyer.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Reason' } })).status, 409)
    assert.equal((await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body })).data.id, id)
    assert.equal((await request(`/api/purchases/${id}`, { cookie: other.cookie })).status, 404)
    const quoted = (await request(`/api/purchases/${id}`, { cookie: buyer.cookie })).data.order
    const number = quoted.orderNumber
    assert.match(String(number), /^[1-9]\d{7}$/)
    assert.equal((await request('/api/admin/purchases', { cookie: admin.cookie })).data.orders.find((order) => order.id === id).orderNumber, number)
    assert.ok((await request('/api/notifications', { cookie: admin.cookie })).data.notifications.some((notification) => notification.title === `Order #${number} created` && notification.link === `/admin?order=${number}#purchase-orders` && !notification.isRead))
    assert.equal(quoted.subtotalCents, 2000)
    assert.equal(quoted.taxCents, 60)
    assert.equal(quoted.shippingCents, 0)
    assert.equal(quoted.coinAmount, '0.00206')
    assert.equal(quoted.usdRate, '10000')
    assert.equal(quoted.status, 'awaiting_receipt')
    assert.equal((await request(`/api/admin/purchases/${id}/quote`, { cookie: admin.cookie, method: 'PUT', body: { shippingCents: 500, taxCents: 100, coinAmount: '0.001' } })).status, 409)
    await request('/api/admin/payment-wallets/BTC', { cookie: admin.cookie, method: 'PUT', body: { address: 'wallet-two', network: 'testnet', usdRate: '20000' } })
    const unchanged = (await request(`/api/purchases/${id}`, { cookie: buyer.cookie })).data.order
    assert.equal(unchanged.walletAddress, 'wallet-one')
    assert.equal(unchanged.coinAmount, '0.00206')
    assert.equal(unchanged.usdRate, '10000')
    assert.equal((await request(`/api/admin/purchases/${id}/payment`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'paid', verified: true } })).status, 409)
    const pending = (await request('/api/seller/purchases', { cookie: a.cookie })).data.orders[0]
    assert.equal(pending.orderNumber, number)
    assert.equal(pending.status, 'awaiting_receipt')
    assert.deepEqual(pending.items.map((item) => item.name), ['A product'])
    assert.ok(!JSON.stringify(pending).includes('secret-'))
    assert.equal((await request('/api/seller/purchases', { cookie: c.cookie })).data.orders.length, 0)
    assert.equal((await request(`/api/purchase-sellers/${id}/${a.data.user.id}`, { cookie: a.cookie, method: 'PATCH', body: { status: 'confirmed' } })).status, 409)
    const initialNotifications = (await request('/api/notifications', { cookie: a.cookie })).data
    const newOrderNotice = initialNotifications.notifications.filter((n) => n.title === `New order #${number}`)
    assert.equal(newOrderNotice.length, 1)
    assert.match(newOrderNotice[0].body, /pending/i)
    assert.equal(newOrderNotice[0].link, `/seller/orders?order=${number}`)
    assert.equal(initialNotifications.unreadCount, initialNotifications.notifications.filter((n) => !n.isRead).length)
    assert.equal((await request(`/api/notifications/${newOrderNotice[0].id}/read`, { cookie: b.cookie, method: 'PATCH' })).status, 404)
    assert.equal((await request(`/api/notifications/${newOrderNotice[0].id}/read`, { cookie: a.cookie, method: 'PATCH' })).status, 200)
    assert.ok(!(await request('/api/notifications', { cookie: c.cookie })).data.notifications.some((n) => n.title === `New order #${number}`))
    const png = Buffer.from([137,80,78,71,13,10,26,10])
    assert.equal((await request(`/api/purchases/${id}/receipt`, { cookie: buyer.cookie, method: 'POST', raw: png })).status, 201)
    assert.ok((await request('/api/notifications', { cookie: buyer.cookie })).data.notifications.some((n) => n.title === `Order #${number} payment pending` && n.link === `/purchase/${id}`))
    assert.ok((await request('/api/notifications', { cookie: admin.cookie })).data.notifications.some((n) => n.title === `Order #${number} receipt submitted` && n.link === `/admin?order=${number}#purchase-orders` && !n.isRead))
    assert.ok((await request('/api/notifications', { cookie: b.cookie })).data.notifications.some((n) => n.title === `Order #${number} payment under review`))
    const receiptId = (await request('/api/admin/purchases', { cookie: admin.cookie })).data.orders[0].receipts[0].id
    const unauthorizedReceipt = await fetch(`${base}/api/admin/purchase-receipts/${receiptId}`, { headers: { Cookie: a.cookie } })
    assert.equal(unauthorizedReceipt.status, 403)
    const receipt = await fetch(`${base}/api/admin/purchase-receipts/${receiptId}`, { headers: { Cookie: admin.cookie } })
    assert.match(receipt.headers.get('content-disposition'), /^inline/)
    assert.equal(receipt.headers.get('x-content-type-options'), 'nosniff')
    assert.deepEqual(Buffer.from(await receipt.arrayBuffer()), png)
    assert.equal((await request(`/api/purchases/${id}/receipt`, { cookie: buyer.cookie, method: 'POST', raw: png })).status, 409)
    assert.equal((await request(`/api/admin/purchases/${id}/payment`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'paid' } })).status, 400)
    assert.equal((await request(`/api/admin/purchases/${id}/payment`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'paid', verified: true } })).status, 200)
    assert.ok((await request('/api/notifications', { cookie: buyer.cookie })).data.notifications.some((n) => n.title === `Order #${number} payment confirmed` && /prepare/.test(n.body)))
    assert.equal((await request(`/api/admin/purchases/${id}/payment`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'paid', verified: true } })).status, 409)
    assert.equal((await request(`/api/purchases/${id}/refunds`, { cookie: other.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Reason' } })).status, 404)
    assert.equal((await request(`/api/purchases/${id}/refunds`, { cookie: buyer.cookie, method: 'POST', body: { sellerId: other.data.user.id, reason: 'Reason' } })).status, 404)
    assert.equal((await request(`/api/purchases/${id}/refunds`, { cookie: buyer.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Damaged item' } })).status, 201)
    assert.equal((await request(`/api/purchases/${id}/refunds`, { cookie: buyer.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Again' } })).status, 409)
    const refund = (await request('/api/seller/refunds', { cookie: a.cookie })).data.refunds[0]
    assert.equal(refund.orderNumber, number)
    assert.equal((await request('/api/seller/refunds', { cookie: b.cookie })).data.refunds.length, 0)
    assert.equal((await request(`/api/seller/refunds/${refund.id}`, { cookie: b.cookie, method: 'PATCH', body: { status: 'approved' } })).status, 404)
    assert.equal((await request(`/api/admin/refunds/${refund.id}/complete`, { cookie: admin.cookie, method: 'PATCH', body: { verified: true, transferReference: 'ref' } })).status, 409)
    assert.equal((await request(`/api/seller/refunds/${refund.id}`, { cookie: a.cookie, method: 'PATCH', body: { status: 'approved' } })).status, 200)
    assert.equal((await request(`/api/admin/refunds/${refund.id}/complete`, { cookie: admin.cookie, method: 'PATCH', body: { transferReference: 'ref' } })).status, 400)
    assert.equal((await request(`/api/admin/refunds/${refund.id}/complete`, { cookie: admin.cookie, method: 'PATCH', body: { verified: true, transferReference: 'ref' } })).status, 200)
    assert.equal((await request(`/api/admin/refunds/${refund.id}/complete`, { cookie: admin.cookie, method: 'PATCH', body: { verified: true, transferReference: 'ref' } })).status, 409)
    assert.equal((await request('/api/refunds', { cookie: buyer.cookie })).data.refunds[0].status, 'completed')
    const sellerOrder = (await request('/api/seller/purchases', { cookie: a.cookie })).data.orders[0]
    assert.deepEqual(sellerOrder.items.map((item) => item.name), ['A product'])
    assert.equal(sellerOrder.subtotalCents, 1000)
    assert.ok(!JSON.stringify(sellerOrder).includes('secret-'))
    assert.equal((await request(`/api/purchase-sellers/${id}/${b.data.user.id}`, { cookie: a.cookie, method: 'PATCH', body: { status: 'delivered' } })).status, 403)
    for (const status of ['about_to_send', 'sent']) {
      assert.equal((await request(`/api/purchase-sellers/${id}/${a.data.user.id}`, { cookie: admin.cookie, method: 'PATCH', body: { status } })).status, 200)
      assert.equal((await request(`/api/purchases/${id}`, { cookie: buyer.cookie })).data.order.sellers.find((seller) => seller.sellerId === a.data.user.id).status, status)
    }
    assert.equal((await request(`/api/purchase-sellers/${id}/${a.data.user.id}`, { cookie: a.cookie, method: 'PATCH', body: { status: 'on_the_way' } })).status, 200)
    assert.ok((await request('/api/notifications', { cookie: buyer.cookie })).data.notifications.some((n) => n.link === `/purchase/${id}` && /on the way/.test(n.body)))
    assert.equal((await request(`/api/purchase-sellers/${id}/${a.data.user.id}`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'delivered' } })).status, 200)
    assert.equal((await request(`/api/purchases/${id}`, { cookie: buyer.cookie })).data.order.sellers.find((seller) => seller.sellerId === a.data.user.id).status, 'delivered')
    assert.ok((await request('/api/notifications', { cookie: a.cookie })).data.notifications.some((notification) => notification.title === `Order #${number} marked delivered`))
    const zeroStockOrder = await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: { ...body, requestKey: randomUUID(), items: [{ id: imported.data.product.id, quantity: 1, selectedColor: '', selectedSize: '' }] } })
    assert.equal(zeroStockOrder.status, 201)
    assert.equal((await request('/api/seller/stock', { cookie: a.cookie })).data.stock[0].quantity, 0)
    const small = await request('/api/seller/products', { cookie: a.cookie, method: 'POST', body: { name: 'Small item', category: 'Home', imageUrl: 'https://example.test/image.png', price: 0.17 } })
    await request('/api/admin/payment-wallets/ETH', { cookie: admin.cookie, method: 'PUT', body: { address: 'eth-wallet', network: 'Ethereum', usdRate: '3' } })
    const smallOrder = await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: { ...body, requestKey: randomUUID(), coin: 'ETH', items: [{ id: small.data.product.id, quantity: 1, selectedColor: '', selectedSize: '' }] } })
    const calculated = (await request(`/api/purchases/${smallOrder.data.id}`, { cookie: buyer.cookie })).data.order
    assert.equal(calculated.taxCents, 0)
    assert.equal(calculated.coinAmount, '0.05666667')
    server.kill('SIGTERM')
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit')
    const legacy = new Database(join(dir, 'test.db'))
    legacy.exec(`
      CREATE TABLE purchase_sellers_old (order_id INTEGER NOT NULL REFERENCES purchase_orders(id), seller_id INTEGER NOT NULL REFERENCES users(id), status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','on_the_way','hold','stalled','delivered')), PRIMARY KEY(order_id, seller_id));
      INSERT INTO purchase_sellers_old SELECT order_id, seller_id, status FROM purchase_sellers;
      DROP TABLE purchase_sellers;
      ALTER TABLE purchase_sellers_old RENAME TO purchase_sellers;
    `)
    legacy.close()
    server = start()
    let restored
    for (let i = 0; i < 100; i++) { try { restored = await request(`/api/purchases/${id}`, { cookie: buyer.cookie }); break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) } }
    assert.equal(restored?.data.order.status, 'paid')
    assert.equal(restored.data.order.orderNumber, number)
    assert.equal(restored.data.order.sellers.find((seller) => seller.sellerId === a.data.user.id).status, 'delivered')
    assert.equal((await request(`/api/purchase-sellers/${id}/${a.data.user.id}`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'about_to_send' } })).status, 200)
    assert.equal(restored.data.order.walletAddress, 'wallet-one')
    assert.deepEqual(Buffer.from(await (await fetch(base + replaced.data.product.imageUrl)).arrayBuffer()), pngImage)
    assert.deepEqual(Buffer.from(await (await fetch(base + uploaded.data.product.imageUrl)).arrayBuffer()), pngImage)
    assert.deepEqual(Buffer.from(await (await fetch(base + uploaded.data.product.imageUrls[1])).arrayBuffer()), pngImage)
    assert.equal((await request(`/api/seller/products/${uploaded.data.product.id}`, { cookie: a.cookie, method: 'DELETE' })).status, 200)
    assert.deepEqual(Buffer.from(await (await fetch(base + replaced.data.product.imageUrl)).arrayBuffer()), pngImage)
    const restoredSamples = (await request('/api/warehouse', { cookie: admin.cookie })).data.products
    assert.equal(restoredSamples.filter((p) => p.name.startsWith('Sample: ')).length, 20)
    assert.ok(!restoredSamples.some((p) => p.id === deletedSample.id))
    assert.equal((await request('/api/refunds', { cookie: buyer.cookie })).data.refunds[0].transferReference, 'ref')
    assert.equal((await request('/api/seller/stock', { cookie: a.cookie })).data.stock[0].quantity, 0)

    const makeOrder = (account) => request('/api/purchases', { cookie: account.cookie, method: 'POST', body: { ...body, requestKey: randomUUID(), items: [{ id: first.data.product.id, quantity: 1, selectedColor: '', selectedSize: '' }] } })
    assert.equal((await request('/api/purchases', { method: 'POST', body })).status, 401)
    const sellerPurchase = await makeOrder(b)
    const adminPurchase = await makeOrder(admin)
    const promotedPurchase = await makeOrder(other)
    for (const purchase of [sellerPurchase, adminPurchase, promotedPurchase]) assert.equal(purchase.status, 201)
    assert.equal((await request(`/api/admin/users/${other.data.user.id}/role`, { cookie: admin.cookie, method: 'PATCH', body: { role: 'seller' } })).status, 200)
    for (const [account, purchase] of [[b, sellerPurchase], [admin, adminPurchase], [other, promotedPurchase]]) {
      const personal = await request(`/api/purchases/${purchase.data.id}`, { cookie: account.cookie })
      assert.equal(personal.status, 200)
      assert.equal(personal.data.order.walletAddress, 'wallet-two')
      assert.equal(personal.data.order.status, 'awaiting_receipt')
      assert.ok((await request('/api/purchases', { cookie: account.cookie })).data.orders.some((order) => order.id === purchase.data.id))
      assert.equal((await request(`/api/purchases/${purchase.data.id}/receipt`, { cookie: account.cookie, method: 'POST', raw: png })).status, 201)
      assert.equal((await request(`/api/admin/purchases/${purchase.data.id}/payment`, { cookie: admin.cookie, method: 'PATCH', body: { status: 'paid', verified: true } })).status, 200)
      assert.equal((await request(`/api/purchases/${purchase.data.id}`, { cookie: account.cookie })).data.order.status, 'paid')
      assert.equal((await request(`/api/purchases/${purchase.data.id}/refunds`, { cookie: account.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Item issue' } })).status, 201)
      assert.ok((await request('/api/refunds', { cookie: account.cookie })).data.refunds.some((refund) => refund.orderId === purchase.data.id))
    }
    assert.equal((await request(`/api/purchases/${sellerPurchase.data.id}`, { cookie: admin.cookie })).status, 404)
    assert.equal((await request(`/api/purchases/${sellerPurchase.data.id}/receipt`, { cookie: other.cookie, method: 'POST', raw: png })).status, 404)
    assert.equal((await request(`/api/purchases/${sellerPurchase.data.id}/refunds`, { cookie: other.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Other order' } })).status, 404)
    assert.ok(!(await request('/api/refunds', { cookie: admin.cookie })).data.refunds.some((refund) => refund.orderId === sellerPurchase.data.id))
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: 'seller-b@example.test', password: 'wrong-password' } })).status, 401)
    assert.equal((await request('/api/auth/me', { cookie: b.cookie })).status, 200)
    const sellerLogin = await request('/api/auth/login', { method: 'POST', body: { email: 'seller-b@example.test', password: 'buyer-password' } })
    assert.equal(sellerLogin.status, 200)
    assert.equal((await request('/api/auth/me', { cookie: b.cookie })).status, 200)
    assert.equal((await request('/api/auth/me', { cookie: sellerLogin.cookie })).status, 200)

    const balanceBody = { ...body, coin: 'BALANCE', requestKey: randomUUID(), expectedTotalCents: 2060 }
    assert.equal((await request('/api/purchases', { cookie: admin.cookie, method: 'POST', body: balanceBody })).status, 403)
    assert.equal((await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: balanceBody })).status, 409)
    assert.equal((await request(`/api/admin/users/${buyer.data.user.id}/rewards`, { cookie: admin.cookie, method: 'PATCH', body: { adjustmentUnits: 5000, reason: 'Account credit' } })).status, 200)
    assert.equal((await request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: { ...balanceBody, expectedTotalCents: 1 } })).status, 409)
    assert.equal((await request('/api/rewards', { cookie: buyer.cookie })).data.balanceUnits, 5000)
    const [balancePurchase, duplicate] = await Promise.all([
      request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: balanceBody }),
      request('/api/purchases', { cookie: buyer.cookie, method: 'POST', body: balanceBody }),
    ])
    assert.deepEqual([balancePurchase.status, duplicate.status].sort(), [200, 201])
    assert.equal(balancePurchase.data.id, duplicate.data.id)
    assert.equal((await request('/api/rewards', { cookie: buyer.cookie })).data.balanceUnits, 2940)
    assert.equal((await request('/api/buyer/profile', { cookie: buyer.cookie })).data.wallet.balanceCents, 2940)
    const balanceOrder = (await request(`/api/purchases/${balancePurchase.data.id}`, { cookie: buyer.cookie })).data.order
    assert.equal(balanceOrder.coin, 'BALANCE')
    assert.equal(balanceOrder.status, 'paid')
    assert.equal(balanceOrder.taxCents, 60)
    assert.equal((await request(`/api/purchases/${balancePurchase.data.id}/receipt`, { cookie: buyer.cookie, method: 'POST', raw: png })).status, 409)
    assert.equal((await request(`/api/purchases/${balancePurchase.data.id}/refunds`, { cookie: buyer.cookie, method: 'POST', body: { sellerId: a.data.user.id, reason: 'Return' } })).status, 409)
    assert.equal((await request(`/api/purchase-sellers/${balancePurchase.data.id}/${a.data.user.id}`, { cookie: a.cookie, method: 'PATCH', body: { status: 'confirmed' } })).status, 200)
    assert.equal((await request(`/api/admin/users/${b.data.user.id}/rewards`, { cookie: admin.cookie, method: 'PATCH', body: { adjustmentUnits: 3000, reason: 'Account credit' } })).status, 200)
    const sellerBalanceOrder = await request('/api/purchases', { cookie: b.cookie, method: 'POST', body: { ...balanceBody, requestKey: randomUUID(), expectedTotalCents: 1030, items: [{ id: first.data.product.id, quantity: 1, selectedColor: '', selectedSize: '', price: 0 }] } })
    assert.equal(sellerBalanceOrder.status, 201)
    assert.equal((await request('/api/rewards', { cookie: b.cookie })).data.balanceUnits, 1970)
    const competingOrders = await Promise.all([0, 1].map(() => request('/api/purchases', { cookie: b.cookie, method: 'POST', body: { ...balanceBody, requestKey: randomUUID(), expectedTotalCents: 1030, items: [{ id: first.data.product.id, quantity: 1, selectedColor: '', selectedSize: '' }] } })))
    assert.deepEqual(competingOrders.map((order) => order.status).sort(), [201, 409])
    assert.equal((await request('/api/rewards', { cookie: b.cookie })).data.balanceUnits, 940)
    const audit = new Database(join(dir, 'test.db'), { readonly: true })
    assert.equal(audit.prepare('SELECT amount_cents FROM balance_purchase_history WHERE order_id = ?').get(balancePurchase.data.id).amount_cents, 2060)
    assert.equal(audit.prepare('SELECT COUNT(*) AS count FROM balance_purchase_history WHERE user_id = ?').get(buyer.data.user.id).count, 1)
    audit.close()
    assert.equal((await request(`/api/admin/users/${buyer.data.user.id}/details`, { cookie: admin.cookie })).data.balancePurchases[0].amountCents, 2060)
    server.kill('SIGTERM')
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit')
    server = start()
    let restoredBalance
    for (let attempt = 0; attempt < 100; attempt += 1) { try { restoredBalance = await request('/api/rewards', { cookie: buyer.cookie }); break } catch { await new Promise((resolve) => setTimeout(resolve, 100)) } }
    assert.equal(restoredBalance?.data.balanceUnits, 2940)
    assert.equal((await request(`/api/purchases/${balancePurchase.data.id}`, { cookie: buyer.cookie })).data.order.status, 'paid')
  } finally {
    server.kill('SIGTERM')
    if (server.exitCode === null && server.signalCode === null) await once(server, 'exit')
    await rm(dir, { recursive: true, force: true })
  }
})
