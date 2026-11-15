export async function testTransactionPin({req,check,db,buyer,seller,buyerId,sellerId}){
 const call=(path,body,cookie,ip='198.51.100.218',method='POST')=>req(path,{method,headers:{'X-Forwarded-For':ip},body:JSON.stringify(body)},cookie)
 const setup=(pin,cookie,loginPassword='long-test-password-123')=>call('/api/account/transaction-pin',{pin,confirmPin:pin,loginPassword},cookie,'198.51.100.219','PUT')
 const request={kind:'deposit',coin:'USDT',transactionPin:'0456'}
 let r=await call('/api/buyer/requests',request,buyer);check('buyer deposit blocked before PIN is set',r.status===403)
 r=await setup('123',buyer);check('PIN setup rejects fewer than four digits',r.status===400)
 r=await setup('12345',buyer);check('PIN setup rejects more than four digits',r.status===400)
 r=await setup('abcd',buyer);check('PIN setup rejects nondigits',r.status===400)
 r=await setup('0456',buyer,'incorrect');check('PIN setup requires correct login password',r.status===403)
 r=await setup('0456',buyer);check('buyer can set PIN with leading zero',r.status===200)
 const stored=(await db.query('SELECT * FROM shop.transaction_security WHERE user_id=$1',[buyerId])).rows[0]
 check('PIN is stored as bcrypt hash, never clear text',stored.pin_hash.startsWith('$2')&&!stored.pin_hash.includes('0456'))
 r=await req('/api/account/transaction-pin',{},buyer);check('PIN status exposes only a boolean',r.data.hasTransactionPin===true&&Object.keys(r.data).length===1)
 r=await call('/api/buyer/requests',{...request,transactionPin:undefined,transactionPassword:'0456'},buyer);check('legacy transaction password cannot bypass PIN',r.status===403)
 r=await call('/api/buyer/requests',request,buyer);check('buyer deposit accepts correct four-digit PIN',r.status===201)
 r=await call('/api/buyer/requests',{kind:'withdrawal',coin:'USDT',amountCents:100,destination:'fixture-wallet',transactionPin:'0456'},buyer);check('buyer withdrawal accepts correct PIN',r.status===201)
 for(let i=0;i<5;i++)await call('/api/buyer/requests',{...request,transactionPin:'9999'},buyer,'198.51.100.'+(220+i))
 r=await call('/api/buyer/requests',request,buyer,'198.51.100.225');check('five wrong attempts lock PIN across IP addresses',r.status===403&&r.data.error.includes('15 minutes'))
 check('lock persisted in database',(await db.query('SELECT locked_until FROM shop.transaction_security WHERE user_id=$1',[buyerId])).rows[0].locked_until>new Date().toISOString())
 r=await setup('0088',buyer);check('login password can reset locked PIN',r.status===200)
 r=await call('/api/buyer/requests',request,buyer);check('previous PIN fails after reset',r.status===403)
 r=await call('/api/buyer/requests',{...request,transactionPin:'0088'},buyer);check('new PIN works after reset',r.status===201)
 // Seller fixtures set a PIN in the finance test; prove both request kinds require it.
 const base={kind:'deposit',coin:'USDT',amountCents:100,requestKey:crypto.randomUUID()}
 r=await call('/api/seller/finance/requests',base,seller);check('seller deposit rejects missing PIN',r.status===403)
 r=await call('/api/seller/finance/requests',{...base,transactionPin:'0088'},seller);check('buyer PIN does not authorize another account',r.status===403)
 r=await call('/api/seller/finance/requests',{...base,transactionPin:'0456'},seller);check('seller deposit accepts seller PIN',r.status===201)
 r=await call('/api/seller/finance/requests',{...base,kind:'withdrawal',requestKey:crypto.randomUUID(),network:'TRC20',address:'fixture-wallet',password:'long-test-password-123'},seller);check('seller login password cannot substitute for transaction PIN',r.status===403)
 r=await setup('0456',seller,'incorrect');check('seller PIN reset requires login password',r.status===403)
 const sellerStored=(await db.query('SELECT pin_hash FROM shop.transaction_security WHERE user_id=$1',[sellerId])).rows[0]
 check('accounts have individually salted PIN hashes',sellerStored.pin_hash!==stored.pin_hash)
}
