import {randomBytes,createHash} from 'node:crypto'
export async function testAccountDeletion({req,check,db,cookie,buyer,seller,sellerId}){
 const root=(await db.query("SELECT id,password_hash FROM shop.users WHERE email='admin@example.test'")).rows[0]
 const target=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role,seller_status) VALUES('Delete fixture','delete-fixture@example.test',$1,'customer','pending') RETURNING id",[root.password_hash])).rows[0]
 await db.query("INSERT INTO shop.seller_profiles(user_id,store_name,country,address,city,region,postal_code) SELECT $1,'Delete fixture store',country,address,city,region,postal_code FROM shop.seller_profiles WHERE user_id=$2",[target.id,sellerId])
 await db.query("INSERT INTO shop.seller_applications(user_id,status,consented_at,submitted_at,ssn_last4,ssn_encrypted) VALUES($1,'pending',$2,$2,'0000','encrypted-fixture')",[target.id,new Date().toISOString()])
 const token=randomBytes(32).toString('hex');await db.query('INSERT INTO shop.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(token).digest('hex'),target.id,new Date(Date.now()+600000).toISOString()])
 const session='ggu_session='+token,path=`/api/admin/users/${target.id}`,body={password:'long-test-password-123',confirmEmail:'delete-fixture@example.test',reason:'Owner requested account closure'}
 const remove=(payload=body,who=cookie,url=path)=>req(url,{method:'DELETE',body:JSON.stringify(payload)},who)
 check('anonymous cannot delete accounts',(await req(path,{method:'DELETE',body:JSON.stringify(body)})).status===401)
 check('buyer cannot delete accounts',(await remove(body,buyer)).status===403)
 check('seller cannot delete accounts',(await remove(body,seller)).status===403)
 check('deletion requires admin password',(await remove({...body,password:'wrong-password'})).status===403)
 check('deletion requires exact target email',(await remove({...body,confirmEmail:'wrong@example.test'})).status===400)
 await db.query('INSERT INTO shop.seller_wallets(seller_id,balance_cents) VALUES($1,500)',[target.id])
 const buyerId=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role) VALUES('Pending order buyer','delete-order-buyer@example.test',$1,'customer') RETURNING id",[root.password_hash])).rows[0].id
 const orderId=(await db.query("INSERT INTO shop.purchase_orders(buyer_id,request_key,coin,billing_json,subtotal_cents,status) VALUES($1,'deletion-pending-order','BALANCE','{}',500,'paid') RETURNING id",[buyerId])).rows[0].id
 await db.query("INSERT INTO shop.order_numbers(kind,order_id,number) VALUES('purchase',$1,98765431)",[orderId])
 await db.query("INSERT INTO shop.purchase_items(order_id,seller_id,name,image_url,price_cents,quantity,color,size) VALUES($1,$2,'Deletion fixture','',500,1,'','')",[orderId,target.id])
 await db.query("INSERT INTO shop.purchase_sellers(order_id,seller_id,status) VALUES($1,$2,'pending')",[orderId,target.id])
 check('admin can delete unapproved applicant with pending order and balance without reason',(await remove({...body,reason:undefined})).status===200)
 let r=await req(path+'/details',{},cookie);check('deletion record retains history and marks account deleted',r.status===200&&r.data.user.deletedAt&&r.data.user.suspended===1&&r.data.accountHistory.some(h=>h.action==='account_deleted'))
 const applications=await req('/api/admin/seller-applications',{},cookie)
 check('deleted applicant disappears from approval queue',!applications.data.applications.some(a=>a.userId===target.id))
 check('deleted applicant cannot be reviewed',(await req(`/api/admin/seller-applications/${target.id}/review`,{method:'PATCH',body:JSON.stringify({status:'needs_changes',revision:1})},cookie)).status===404)
 check('deleted account sessions are revoked',(await req('/api/auth/me',{},session)).status===401)
 check('deleted store disappears from public marketplace',(await req('/api/stores/'+target.id)).status===404)
 check('suspension restore cannot reactivate deleted account',(await req(path+'/suspension',{method:'PATCH',body:JSON.stringify({suspended:false,reason:'Attempted restore'})},cookie)).status===409)
 check('repeated deletion is safe',(await remove()).status===200)
 const audit=(await db.query("SELECT id FROM shop.account_admin_history WHERE user_id=$1 AND action='account_deleted'",[target.id])).rows
 check('account deletion creates one audit record',audit.length===1)
 const wallet=(await db.query('SELECT balance_cents FROM shop.seller_wallets WHERE seller_id=$1',[target.id])).rows[0]
 check('historical financial rows are retained',wallet&&wallet.balance_cents===500)
 const application=(await db.query('SELECT ssn_last4,ssn_encrypted FROM shop.seller_applications WHERE user_id=$1',[target.id])).rows[0]
 check('deletion clears private SSN material',application.ssn_last4===null&&application.ssn_encrypted===null)
 const retained=(await db.query('SELECT o.status,s.status AS shipment FROM shop.purchase_orders o JOIN shop.purchase_sellers s ON s.order_id=o.id WHERE o.id=$1',[orderId])).rows[0]
 check('deletion preserves payment and pending fulfillment state',retained.status==='paid'&&retained.shipment==='pending')
 check('admin can delete buyer with pending shipment and a written note',(await remove({...body,confirmEmail:'delete-order-buyer@example.test',reason:'Fixture buyer closure'},cookie,`/api/admin/users/${buyerId}`)).status===200)
 const orders=await req('/api/admin/purchases',{},cookie)
 check('deleted buyer order remains accessible to administrators',orders.status===200&&orders.data.orders.some(o=>o.id===orderId))
 check('admin cannot delete own account',(await remove({...body,confirmEmail:'admin@example.test'},cookie,`/api/admin/users/${root.id}`)).status===403)
 const another=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role) VALUES('Other admin','delete-admin@example.test',$1,'admin') RETURNING id",[root.password_hash])).rows[0]
 check('regular admin cannot delete another admin',(await remove({...body,confirmEmail:'delete-admin@example.test'},cookie,`/api/admin/users/${another.id}`)).status===403)
 await db.query('UPDATE shop.users SET is_super_admin=1 WHERE id=$1',[root.id])
 const owner=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role,is_super_admin) VALUES('Protected owner','protected-owner@example.test',$1,'admin',1) RETURNING id",[root.password_hash])).rows[0]
 check('even another super admin cannot delete an owner',(await remove({...body,confirmEmail:'protected-owner@example.test'},cookie,`/api/admin/users/${owner.id}`)).status===403)
 check('super admin can delete an ordinary admin',(await remove({...body,confirmEmail:'delete-admin@example.test'},cookie,`/api/admin/users/${another.id}`)).status===200)
 await db.query('UPDATE shop.users SET is_super_admin=0 WHERE id=$1',[root.id])
}
