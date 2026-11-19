import {randomUUID} from 'node:crypto'
export async function testAdminBuyerFunding({req,check,db,cookie,buyer,buyerId,seller,sellerId}){
 const funding={buyerId,amountCents:25000,requestKey:randomUUID(),verified:true}
 const post=(data,who=cookie)=>req('/api/admin/buyer-funding',{method:'POST',body:JSON.stringify(data)},who)
 let r=await req('/api/admin/buyer-funding',{},cookie);check('admin buyer funding lists actual current balances',r.status===200&&r.data.buyers.some(b=>b.id===buyerId),r)
 const before=(await req('/api/buyer/profile',{},buyer)).data.wallet.balanceCents
 r=await post(funding,buyer);check('buyer cannot credit own balance',r.status===403)
 r=await post(funding,seller);check('seller cannot credit buyer balance',r.status===403)
 r=await post({...funding,verified:false});check('direct buyer funding requires explicit authorization',r.status===400)
 r=await post({...funding,amountCents:-1});check('direct buyer funding rejects negative credits',r.status===400)
 r=await post({...funding,buyerId:sellerId});check('buyer funding cannot accidentally target a seller wallet',r.status===404)
 const both=await Promise.all([post(funding),post(funding)]);check('buyer funding retries succeed without a duplicate credit',both.every(v=>v.status===200),both)
 r=await req('/api/buyer/profile',{},buyer);check('funding immediately increases the actual buyer spendable balance',r.data.wallet.balanceCents===before+25000)
 r=await req('/api/rewards',{},buyer);check('checkout account balance uses funded value',r.status===200&&r.data.balanceUnits===before+25000,r)
 const records=(await db.query('SELECT * FROM shop.admin_buyer_funding WHERE request_key=$1',[funding.requestKey])).rows
 check('buyer funding keeps one audited before/after record',records.length===1&&records[0].before_cents===before&&records[0].after_cents===before+25000&&records[0].reason==='Administrator action')
 const rewardHistory=(await db.query('SELECT * FROM shop.reward_history WHERE user_id=$1 AND reason=$2',[buyerId,'Administrator action'])).rows
 check('buyer funding is recorded once in account fund history',rewardHistory.length===1&&rewardHistory[0].adjustment_units===25000)
 r=await post({...funding,amountCents:26000});check('funding key cannot be reused for another amount',r.status===409)
 r=await req('/api/admin/buyer-funding',{},cookie);check('buyer admin funding history has credited amount',r.data.history.some(h=>h.delta_cents===25000&&h.note==='Administrator action'))
}
