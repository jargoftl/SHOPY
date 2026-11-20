import {randomUUID} from 'node:crypto'
export async function testBalanceMarketplace({req,check,db,cookie,seller,sellerId}){
 const call=(path,body,who=cookie,method='POST')=>req(path,{method,headers:{'X-Forwarded-For':'198.51.100.181'},body:JSON.stringify(body)},who)
 const registered=await call('/api/auth/register',{fullName:'Funded Buyer',email:'funded-buyer@example.test',password:'long-test-password-123'},undefined)
 const buyer=registered.cookie,buyerId=registered.data.user.id
 await call('/api/account/transaction-pin',{pin:'0123',confirmPin:'0123',loginPassword:'long-test-password-123'},buyer,'PUT')
 let r=await call('/api/buyer/requests',{kind:'deposit',coin:'USDT',amountCents:5000,transactionPin:'0123'},buyer)
 check('buyer requests a coin deposit to fund account',r.status===201,r);const depositId=r.data.id
 let profile=(await req('/api/buyer/profile',{},buyer)).data
 check('configured coin wallet is supplied automatically for deposits',profile.requests.find(q=>q.id===depositId)?.walletAddress==='test-address')
 r=await call('/api/admin/buyer-requests/'+depositId,{status:'confirmed',verified:true,transferReference:'fixture-funding'},cookie,'PATCH');check('deposit cannot credit before receipt exists',r.status===409,r)
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jF9kAAAAASUVORK5CYII=','base64')
 r=await req(`/api/buyer/requests/${depositId}/receipt`,{method:'POST',headers:{'Content-Type':'image/png'},body:png},buyer);check('buyer submits private funding receipt',r.status===201,r)
 r=await call('/api/admin/buyer-requests/'+depositId,{status:'confirmed',transferReference:'fixture-funding'},cookie,'PATCH');check('deposit needs explicit independent verification',r.status===400)
 r=await call('/api/admin/buyer-requests/'+depositId,{status:'confirmed',verified:true,transferReference:'fixture-funding'},cookie,'PATCH');check('admin confirmation credits spendable buyer balance',r.status===200,r)
 check('verified deposit adds the full stated amount',(await req('/api/rewards',{},buyer)).data.balanceUnits===5000)
 r=await call('/api/admin/buyer-requests/'+depositId,{status:'confirmed',verified:true,transferReference:'fixture-funding'},cookie,'PATCH');check('deposit confirmation cannot credit twice',r.status===409)
 const product=(await db.query("INSERT INTO shop.products(name,category,price,image_url,seller_id,is_published,is_store_published) VALUES('Funded marketplace product','Home',10,'',$1,1,1) RETURNING id",[sellerId])).rows[0].id
 const orderBody={billing:{fullName:'Funded Buyer',email:'funded-buyer@example.test',address:'Fixture',city:'Fixture',region:'Fixture',country:'US'},coin:'USDT',requestKey:randomUUID(),items:[{id:product,quantity:1,selectedColor:'',selectedSize:''}],expectedTotalCents:1030}
 r=await call('/api/purchases',orderBody,buyer);check('buyer cannot select a coin at checkout',r.status===400)
 orderBody.coin='BALANCE'
 r=await call('/api/purchases',orderBody,buyer);check('funded balance pays order immediately',r.status===201,r);const orderId=r.data.id
 r=await call('/api/purchases',orderBody,buyer);check('checkout retries do not duplicate charges',r.status===200&&r.data.id===orderId)
 check('balance deducted once',(await req('/api/rewards',{},buyer)).data.balanceUnits===3970)
 const purchase=(await req('/api/purchases/'+orderId,{},buyer)).data.order
 check('simplified billing is retained without phone or postal code',!('phone' in purchase.billing)&&!('postalCode' in purchase.billing))
 check('balance paid order has no external wallet quote',purchase.status==='paid'&&purchase.walletAddress===null&&purchase.accountBalancePayment)
 const sellerOrders=(await req('/api/seller/purchases',{},seller)).data.orders
 check('new paid purchase appears in seller orders immediately',sellerOrders.some(o=>o.id===orderId&&o.status==='paid'))
 const walletBefore=(await req('/api/seller/finance',{},seller)).data.wallet.balanceCents
 const confirmation={orderId,sellerId,amountCents:1000,verified:true}
 r=await call('/api/seller/finance/releases',{...confirmation,sellerId:sellerId+999},seller);check('seller cannot confirm another store sale',r.status===403)
 const approvals=await Promise.all([call('/api/seller/finance/releases',confirmation,seller),call('/api/admin/seller-finance/releases',confirmation,cookie)])
 check('seller/admin simultaneous confirmation credits once',approvals.filter(r=>r.status===200).length===1&&approvals.filter(r=>r.status===409).length===1,approvals)
 const finance=(await req('/api/seller/finance',{},seller)).data
 check('confirmed product subtotal credited once to seller',finance.wallet.balanceCents===walletBefore+1000)
 const sale=finance.sales.find(s=>s.orderId===orderId)
 check('sale confirmation records actor and role',sale.confirmedBy&&['seller','admin'].includes(sale.confirmedRole)&&sale.deliveryStatus==='confirmed')
 check('confirmation recorded in fund ledger',finance.records.some(r=>r.kind==='sale_release'&&r.delta_cents===1000))
 r=await call(`/api/admin/purchase-sellers/${orderId}/${sellerId}/tracking`,{trackingNumber:'TEST-TRACK-123',carrier:'Fixture carrier'},seller,'PUT');check('seller cannot assign admin tracking number',r.status===403)
 r=await call(`/api/admin/purchase-sellers/${orderId}/${sellerId}/tracking`,{trackingNumber:'TEST-TRACK-123',carrier:'Fixture carrier'},cookie,'PUT');check('admin assigns tracking to seller order',r.status===200,r)
 r=await req('/api/purchases/'+orderId,{},buyer);check('buyer can see assigned tracking number',r.data.order.sellers[0].carrierTrackingNumber==='TEST-TRACK-123'&&/^[1-9]\d{10}$/.test(r.data.order.sellers[0].trackingNumber))
 r=await call(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'on_the_way'},seller,'PATCH');check('seller updates fulfillment after receiving tracking',r.status===200)
 r=await call('/api/buyer/requests',{kind:'withdrawal',coin:'USDT',amountCents:3500,destination:'Fixture receiving wallet',transactionPin:'0123'},buyer);check('withdrawal holds available buyer funds',r.status===201);const withdrawalId=r.data.id
 const balance=(await req('/api/rewards',{},buyer)).data;check('held funds excluded from spending',balance.balanceUnits===3970&&balance.reservedUnits===3500&&balance.availableUnits===470)
 r=await call('/api/purchases',{...orderBody,requestKey:randomUUID()},buyer);check('checkout cannot spend a pending withdrawal',r.status===409)
 r=await call(`/api/admin/buyers/${buyerId}/balance`,{balanceCents:10,reason:'Fixture hold coverage'},cookie,'PATCH');check('admin reductions must cover withdrawal holds',r.status===400)
 r=await call('/api/admin/buyer-requests/'+withdrawalId,{status:'rejected',instructions:'Fixture rejected'},cookie,'PATCH');check('withdrawal rejection releases hold',r.status===200)
 check('available balance restored after rejection',(await req('/api/rewards',{},buyer)).data.availableUnits===3970)
 r=await call('/api/buyer/requests',{kind:'withdrawal',coin:'USDT',amountCents:1000,destination:'Fixture receiving wallet',transactionPin:'0123'},buyer);const completedWithdrawal=r.data.id
 r=await call('/api/admin/buyer-requests/'+completedWithdrawal,{status:'confirmed',verified:true,transferReference:'fixture-buyer-outgoing'},cookie,'PATCH');check('confirmed buyer withdrawal debits balance and releases hold',r.status===200&&(await req('/api/rewards',{},buyer)).data.availableUnits===2970,r)
 r=await call('/api/admin/buyer-requests/'+completedWithdrawal,{status:'confirmed',verified:true,transferReference:'fixture-buyer-outgoing'},cookie,'PATCH');check('confirmed buyer withdrawal cannot debit twice',r.status===409)
 r=await call('/api/buyer/requests',{kind:'deposit',coin:'USDT',amountCents:5000,transactionPin:'0123'},buyer);const duplicateDeposit=r.data.id
 await req(`/api/buyer/requests/${duplicateDeposit}/receipt`,{method:'POST',headers:{'Content-Type':'image/png'},body:png},buyer)
 r=await call('/api/admin/buyer-requests/'+duplicateDeposit,{status:'confirmed',verified:true,transferReference:'fixture-funding'},cookie,'PATCH');check('same incoming transfer cannot fund a second request',r.status===409&&(await req('/api/rewards',{},buyer)).data.balanceUnits===2970)
 check('seller fund history identifies confirming account',finance.records.some(r=>r.kind==='sale_release'&&r.actorName===sale.confirmedBy&&r.actorRole===sale.confirmedRole))
 // Display overrides never modify real orders, recorded visits or financial balances.
 const analyticsBefore=(await req('/api/seller/analytics',{},seller)).data
 r=await call(`/api/admin/sellers/${sellerId}/display-stats`,{values:{visits:999999,salesCents:50000000,followers:5000},reason:'Fixture labeled display adjustment'},seller,'PUT');check('seller cannot adjust own statistics',r.status===403)
 r=await call(`/api/admin/sellers/${sellerId}/display-stats`,{values:{visits:999999,salesCents:50000000,followers:5000},reason:'Fixture labeled display adjustment'},cookie,'PUT');check('admin can set labeled display statistics',r.status===200)
 const analyticsAfter=(await req('/api/seller/analytics',{},seller)).data
 check('dashboard receives display adjustments separately from actual values',analyticsAfter.displayStats.visits===999999&&analyticsAfter.overview.salesCents===analyticsBefore.overview.salesCents&&analyticsAfter.overview.visits===analyticsBefore.overview.visits)
 r=await req(`/api/admin/sellers/${sellerId}/display-stats`,{},cookie);check('display statistics changes keep before/after audit',r.data.history[0].reason==='Fixture labeled display adjustment'&&r.data.history[0].before_json==='{}')
 await call(`/api/admin/sellers/${sellerId}/display-stats`,{values:{},reason:'Restore actual fixture figures'},cookie,'PUT')
 // Sellers can shop as themselves with merchant funds; no second email is required.
 r=await call('/api/purchases',{...orderBody,requestKey:randomUUID()},seller);check('seller can buy from marketplace with existing account balance',r.status===201,r)
}
