import {randomUUID} from 'node:crypto'
export async function testTrackingFunding({req,check,db,cookie,buyer,buyerId,seller,sellerId}){
 const post=(path,body,who=cookie,method='POST')=>req(path,{method,body:JSON.stringify(body)},who)
 const order=(await db.query("SELECT o.id,s.tracking_code FROM shop.purchase_orders o JOIN shop.purchase_sellers s ON s.order_id=o.id WHERE o.buyer_id=$1 AND s.seller_id=$2 AND o.status='paid' LIMIT 1",[buyerId,sellerId])).rows[0]
 check('tracking code allocated as 11 random digits',/^[1-9]\d{10}$/.test(order.tracking_code))
 let r=await req('/api/orders/track/'+order.tracking_code,{},buyer);check('buyer can track own shipment',r.status===200&&r.data.shipment.orderId===order.id,r)
 r=await req('/api/orders/track/'+order.tracking_code,{},seller);check('store owner can track own shipment',r.status===200)
 const other=await post('/api/auth/register',{fullName:'Unrelated tracking buyer',email:'other-tracking@example.test',password:'long-test-password-123'})
 r=await req('/api/orders/track/'+order.tracking_code,{},other.cookie);check('tracking number does not expose another buyer shipment',r.status===404)
 r=await req('/api/orders/track/123',{},buyer);check('tracking lookup requires exactly 11 digits',r.status===400)
 const initial=(await db.query('SELECT tracking_code FROM shop.purchase_sellers WHERE order_id=$1 AND seller_id=$2',[order.id,sellerId])).rows[0].tracking_code
 r=await post(`/api/purchase-sellers/${order.id}/${sellerId}`,{status:'sent',note:'Dispatched by store'},seller,'PATCH');check('seller dispatch update succeeds',r.status===200)
 r=await post(`/api/purchase-sellers/${order.id}/${sellerId}`,{status:'on_the_way',note:'Admin transit update'},cookie,'PATCH');check('admin transit update succeeds',r.status===200)
 r=await req('/api/orders/track/'+initial,{},buyer);check('buyer sees current progress and seller/admin update history',r.status===200&&r.data.shipment.status==='on_the_way'&&r.data.history.some(h=>h.updatedBy==='seller'&&h.status==='sent')&&r.data.history.some(h=>h.updatedBy==='admin'&&h.status==='on_the_way'))
 check('tracking number remains stable through progress updates',r.data.shipment.trackingNumber===initial)
 const numbers=(await db.query('SELECT tracking_code FROM shop.purchase_sellers')).rows.map(s=>s.tracking_code);check('all shipments have distinct 11-digit tracking codes',numbers.every(n=>/^[1-9]\d{10}$/.test(n))&&new Set(numbers).size===numbers.length)
 const before=(await req('/api/seller/finance',{},seller)).data.wallet.balanceCents
 const funding={sellerId,amountCents:12345,reason:'Approved fixture working capital',requestKey:randomUUID(),verified:true}
 r=await post('/api/admin/seller-funding',funding,seller);check('seller cannot fund their own wallet',r.status===403)
 r=await post('/api/admin/seller-funding',{...funding,verified:false});check('admin funding requires explicit authorization',r.status===400)
 r=await post('/api/admin/seller-funding',{...funding,amountCents:-1});check('funding cannot credit a negative amount',r.status===400)
 const concurrent=await Promise.all([post('/api/admin/seller-funding',funding),post('/api/admin/seller-funding',funding)])
 check('funding retries succeed idempotently',concurrent.every(r=>r.status===200))
 const finance=(await req('/api/seller/finance',{},seller)).data
 check('seller funding credits once',finance.wallet.balanceCents===before+12345)
 check('seller funding history shows the credit without source or reason',finance.records.some(r=>r.kind==='admin_funding'&&r.note===''&&!('actorRole' in r)&&!('actor_id' in r)&&!('reference' in r)&&r.delta_cents===12345))
 await db.query("INSERT INTO shop.notifications(user_id,type,title,body,link) VALUES($1,'wallet','Admin funding added',$2,'/seller/wallet')",[sellerId,'$1.25 credited to your seller wallet. Historical private reason.'])
 r=await req('/api/notifications',{},seller)
 const credits=r.data.notifications.filter(n=>n.title==='Credited to wallet')
 check('new and old seller notifications show only the credited amount',credits.some(n=>n.body==='$123.45 credited to your wallet.')&&credits.some(n=>n.body==='$1.25 credited to your wallet.')&&!r.data.notifications.some(n=>n.title==='Admin funding added'))
 r=await post('/api/admin/seller-funding',{...funding,amountCents:500});check('same funding key cannot be reused for another amount',r.status===409)
 r=await req('/api/admin/seller-funding',{},cookie);check('admin funding tab has balances and audit history',r.status===200&&r.data.sellers.some(s=>s.id===sellerId)&&r.data.history.some(h=>h.reference===funding.requestKey&&h.note===funding.reason&&h.adminName))
 r=await req('/api/admin/overview',{},cookie);check('lightweight admin overview returns counts without full product payload',r.status===200&&Number.isInteger(r.data.counts.products)&&!('products'in r.data))
 r=await req('/api/notifications/summary',{},cookie);check('notification summary returns unread count only',r.status===200&&Number.isInteger(r.data.unreadCount)&&!('notifications'in r.data))
}
