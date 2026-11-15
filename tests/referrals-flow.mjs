export async function testReferrals({req,check,db,cookie,seller,sellerId,buyer,sellerForm}){
 const post=(path,body,who=cookie,method='POST')=>req(path,{method,body:JSON.stringify(body)},who)
 let r=await req('/api/seller/referrals',{},seller);check('seller has a private unique referral code',r.status===200&&/^[A-F0-9]{16}$/.test(r.data.code),r)
 const code=r.data.code
 const again=await req('/api/seller/referrals',{},seller);check('referral code remains stable across visits',again.data.code===code)
 r=await req('/api/seller/referrals');check('referral account history requires login',r.status===401)
 r=await req('/api/seller/referrals',{},buyer);check('ordinary buyer cannot issue seller referral codes',r.status===403)
 r=await post('/api/auth/register',{fullName:'Referred Buyer',email:'referral-buyer@example.test',password:'referral-password-123',referralCode:code},null)
 check('buyer signup accepts seller referral link code',r.status===201,r)
 const joinedId=r.data.user.id,joinedCookie=r.cookie
 r=await post('/api/auth/register',{fullName:'Unknown Referrer',email:'referral-invalid@example.test',password:'referral-password-123',referralCode:'INVALID'},null);check('invalid referral code gives a correctable signup error',r.status===400)
 r=await post('/api/auth/register-seller',{...sellerForm,email:'referral-seller@example.test',referralCode:code,transactionPin:undefined,confirmTransactionPin:undefined},null)
 check('seller signup accepts referral without wallet PIN',r.status===201,r)
 const newSeller=r.data.user.id,applicantCookie=r.cookie
 r=await req('/api/seller/referrals',{},applicantCookie);check('new seller applicant receives own shareable referral code',r.status===200&&r.data.code!==code)
 r=await req('/api/admin/referrals',{},cookie);const referredBuyer=r.data.referrals.find(v=>v.referredId===joinedId),referredSeller=r.data.referrals.find(v=>v.referredId===newSeller)
 check('admin sees referring seller code and both signup types',r.status===200&&referredBuyer?.sellerId===sellerId&&referredBuyer.code===code&&referredBuyer.signupKind==='buyer'&&referredSeller?.signupKind==='seller')
 check('referral starts awaiting review without automatic credits',referredBuyer.status==='pending'&&referredBuyer.amountCents===0)
 const before=(await req('/api/seller/finance',{},seller)).data.wallet.balanceCents
 r=await post('/api/admin/referrals/'+referredBuyer.id,{status:'rewarded',amountCents:500,reason:'Fixture referral approved'},seller,'PATCH');check('seller cannot approve own referral reward',r.status===403)
 r=await post('/api/admin/referrals/'+referredBuyer.id,{status:'rewarded',amountCents:-1,reason:'Invalid reward'},cookie,'PATCH');check('reward rejects negative amounts',r.status===400)
 const reward={status:'rewarded',amountCents:500,reason:'Fixture referral approved'}
 const concurrent=await Promise.all([post('/api/admin/referrals/'+referredBuyer.id,reward,cookie,'PATCH'),post('/api/admin/referrals/'+referredBuyer.id,reward,cookie,'PATCH')]);check('concurrent reward retries are idempotent',concurrent.every(v=>v.status===200),concurrent)
 const finance=(await req('/api/seller/finance',{},seller)).data
 check('referral reward credits seller wallet exactly once',finance.wallet.balanceCents===before+500&&finance.records.filter(v=>v.kind==='referral_reward'&&v.reference===`referral:${referredBuyer.id}`).length===1)
 r=await post('/api/admin/referrals/'+referredBuyer.id,{...reward,amountCents:700},cookie,'PATCH');check('reviewed referral cannot be rewarded again for a different amount',r.status===409)
 r=await post('/api/admin/referrals/'+referredSeller.id,{status:'rejected',reason:'Fixture duplicate signup'},cookie,'PATCH');check('admin can reject referral without issuing funds',r.status===200)
 r=await req('/api/seller/referrals',{},seller);check('seller sees referral count and earned total',r.status===200&&r.data.summary.total===2&&r.data.summary.rewardedCents===500)
 r=await req('/api/admin/referrals',{},buyer);check('buyer cannot view administrator attribution report',r.status===403)
 r=await req('/api/seller/referrals',{},joinedCookie);check('referred buyer cannot see referrer private history',r.status===403)
 check('one referral attribution per new account',(await db.query('SELECT COUNT(*) AS n FROM shop.seller_referrals WHERE referred_id=$1',[joinedId])).rows[0].n===1)
 const pin=(await db.query('SELECT pin_hash FROM shop.transaction_security WHERE user_id=$1',[newSeller])).rows[0];check('referred seller signup creates no PIN until wallet setup',!pin)
}
