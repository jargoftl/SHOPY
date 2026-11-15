import {randomUUID} from 'node:crypto'
export async function testSellerFinance({req,check,db,cookie,seller,buyer,sellerId,buyerId}) {
 const post=(path,body,who=seller,method='POST')=>req(path,{method,body:JSON.stringify(path==='/api/seller/finance/requests'?{transactionPin:'0456',...body}:body)},who)
 let r=await req('/api/auth/me',{},seller);const publicId=r.data.user.publicId
 check('seller has stable random eight digit public reference',/^[1-9]\d{7}$/.test(publicId))
 r=await req('/api/auth/me',{},buyer);check('buyer has distinct eight digit reference',/^[1-9]\d{7}$/.test(r.data.user.publicId)&&r.data.user.publicId!==publicId)
 r=await req('/api/products');check('all public products have eight digit references',r.data.products.every(p=>/^[1-9]\d{7}$/.test(p.publicId)))
 r=await req('/api/warehouse',{},seller);check('warehouse products have public references',r.data.products.every(p=>/^[1-9]\d{7}$/.test(p.publicId)))
 for(const path of ['/api/seller/finance','/api/seller/analytics']){r=await req(path,{},buyer);check('buyer denied '+path,r.status===403)}
 r=await req('/api/admin/seller-finance',{},seller);check('seller cannot review funds',r.status===403)
 r=await req('/api/seller/analytics',{},seller);check('actual dashboard has real daily sales and visits',r.status===200&&Array.isArray(r.data.daily)&&Array.isArray(r.data.visits))
 let setup=await post('/api/account/transaction-pin',{pin:'0456',confirmPin:'0456',loginPassword:'long-test-password-123'},seller,'PUT');check('seller can set four-digit transaction PIN',setup.status===200,setup)
 const deposit={kind:'deposit',coin:'USDT',amountCents:20000,requestKey:randomUUID()}
 r=await post('/api/seller/finance/requests',deposit);check('seller requests deposit',r.status===201,r)
 await post('/api/seller/finance/requests',deposit)
 let finance=(await req('/api/seller/finance',{},seller)).data;const q=finance.requests[0]
 check('deposit retries do not duplicate',finance.requests.length===1&&finance.wallet.balanceCents===0)
 const adminPath='/api/admin/seller-finance/requests/'+q.id
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('deposit cannot credit before receipt',r.status===409)
 r=await post(adminPath,{action:'quote',network:'TRC20',address:'fixture-admin-address',usdRate:'1'},cookie,'PATCH');check('admin sends coin payment quote',r.status===200,r)
 r=await req('/api/seller/finance',{},seller);check('exact quoted coin amount',r.data.requests[0].coin_amount==='200.00000000')
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64')
 r=await req(`/api/seller/finance/requests/${q.id}/receipt`,{method:'POST',body:png,headers:{'Content-Type':'image/png'}},seller);check('private seller deposit receipt uploaded',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data
 r=await req('/api/seller/finance/receipts/'+finance.requests[0].receiptId,{},buyer);check('another buyer cannot read receipt',r.status===404)
 r=await post(adminPath,{action:'confirm',verified:false,transferReference:'fixture-deposit'},cookie,'PATCH');check('admin must independently verify payment',r.status===409)
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('verified deposit credits wallet',r.status===200,r)
 r=await post(adminPath,{action:'confirm',verified:true,transferReference:'fixture-deposit'},cookie,'PATCH');check('repeat confirmation is refused',r.status===409)
 finance=(await req('/api/seller/finance',{},seller)).data;check('deposit ledger credits once',finance.wallet.balanceCents===20000&&finance.records.length===1)
 const withdrawal={kind:'withdrawal',coin:'USDT',amountCents:15000,requestKey:randomUUID(),network:'TRC20',address:'fixture-seller-address',transactionPin:'0456'}
 r=await post('/api/seller/finance/requests',{...withdrawal,transactionPin:'9999'});check('withdrawal requires transaction PIN',r.status===403)
 r=await post('/api/seller/finance/requests',withdrawal);check('withdrawal reserves real funds',r.status===201,r)
 await post('/api/seller/finance/requests',withdrawal)
 finance=(await req('/api/seller/finance',{},seller)).data;check('withdrawal retry reserves only once',finance.wallet.balanceCents===20000&&finance.wallet.reservedCents===15000)
 r=await post('/api/seller/finance/requests',{...withdrawal,requestKey:randomUUID()});check('cannot overspend pending holds',r.status===409)
 let w=finance.requests[0]
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'reject',instructions:'Fixture rejection'},cookie,'PATCH');check('admin rejects withdrawal',r.status===200)
 finance=(await req('/api/seller/finance',{},seller)).data;check('rejection releases hold without debit',finance.wallet.balanceCents===20000&&finance.wallet.reservedCents===0)
 r=await post('/api/seller/finance/requests',{...withdrawal,requestKey:randomUUID()});finance=(await req('/api/seller/finance',{},seller)).data;w=finance.requests[0]
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'quote',usdRate:'1'},cookie,'PATCH');check('admin locks withdrawal coin conversion',r.status===200,r)
 r=await post('/api/admin/seller-finance/requests/'+w.id,{action:'confirm',verified:true,transferReference:'fixture-outgoing'},cookie,'PATCH');check('admin confirms outgoing transfer',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data;check('outgoing transfer debits and releases hold',finance.wallet.balanceCents===5000&&finance.wallet.reservedCents===0)
 // Synthetic external sale fixture: no blockchain or live payment is used.
 const o=(await db.query("INSERT INTO shop.purchase_orders(buyer_id,request_key,coin,billing_json,subtotal_cents,status) VALUES($1,$2,'USDT','{}',12345,'paid') RETURNING id",[buyerId,randomUUID()])).rows[0].id
 await db.query("INSERT INTO shop.order_numbers(kind,order_id,number) VALUES('purchase',$1,87654321)",[o])
 await db.query("INSERT INTO shop.purchase_items(order_id,seller_id,name,image_url,price_cents,quantity,color,size) VALUES($1,$2,'Finance fixture','',12345,1,'','')",[o,sellerId])
 await db.query("INSERT INTO shop.purchase_sellers(order_id,seller_id,status) VALUES($1,$2,'pending')",[o,sellerId])
 const release={orderId:o,sellerId,amountCents:12345,verified:true}
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('undelivered sale cannot be released',r.status===409)
 await db.query("UPDATE shop.purchase_sellers SET status='delivered' WHERE order_id=$1",[o])
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('admin releases full product sale amount',r.status===200,r)
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('sale cannot be released twice',r.status===409)
 finance=(await req('/api/seller/finance',{},seller)).data;check('full sale posted to wallet',finance.wallet.balanceCents===17345)
 const refund=(await db.query("INSERT INTO shop.purchase_refunds(order_id,seller_id,buyer_id,reason,status) VALUES($1,$2,$3,'Finance fixture refund','approved') RETURNING id",[o,sellerId,buyerId])).rows[0].id
 r=await post('/api/admin/refunds/'+refund+'/complete',{verified:true,transferReference:'fixture-refund'},cookie,'PATCH');check('completed refund reverses released sale funds',r.status===200,r)
 finance=(await req('/api/seller/finance',{},seller)).data;check('refund restores pre-sale balance and adds reversal ledger',finance.wallet.balanceCents===5000&&finance.records[0].kind==='sale_refund')
 r=await post('/api/admin/seller-finance/releases',release,cookie);check('refunded sale cannot be released again',r.status===409)
 r=await req('/api/seller/analytics',{},seller);check('dashboard activity is recorded from real fund and order changes',r.status===200&&r.data.activity.some(a=>a.kind==='sale_refund'))
 const balances=finance.records;check('fund record stores before and after amounts',balances.every(r=>r.after_cents-r.before_cents===r.delta_cents))
 r=await req('/api/admin/seller-finance',{},cookie);check('admin finance review returns real sale and wallet rows',r.status===200&&r.data.sales.some(s=>s.orderId===o)&&r.data.wallets.some(w=>w.seller_id===sellerId))
}
