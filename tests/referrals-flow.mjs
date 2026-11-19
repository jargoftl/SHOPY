export async function testReferrals({req,check,db,cookie,seller,sellerId,buyer,sellerForm}){
 const post=(path,body,who=cookie,method='POST')=>req(path,{method,headers:{'X-Forwarded-For':'198.51.100.171'},body:JSON.stringify(body)},who)
 let r=await req('/api/seller/referrals',{},seller);check('seller has a private unique referral code',r.status===200&&/^[A-F0-9]{16}$/.test(r.data.code),r)
 const code=r.data.code
 check('referral code remains stable across visits',(await req('/api/seller/referrals',{},seller)).data.code===code)
 check('referral account history requires login',(await req('/api/seller/referrals')).status===401)
 check('ordinary buyer cannot issue seller referral codes',(await req('/api/seller/referrals',{},buyer)).status===403)
 r=await post('/api/auth/register',{fullName:'No-referral Buyer',email:'referral-buyer@example.test',password:'referral-password-123',referralCode:code},null)
 check('buyer signup ignores referral codes',r.status===201,r);const joinedId=r.data.user.id,joinedCookie=r.cookie
 check('buyer signup creates no attribution',(await db.query('SELECT COUNT(*) AS n FROM shop.seller_referrals WHERE referred_id=$1',[joinedId])).rows[0].n===0)
 r=await post('/api/auth/register',{fullName:'No-code Buyer',email:'referral-invalid@example.test',password:'referral-password-123',referralCode:'INVALID'},null);check('invalid buyer referral cannot obstruct ordinary signup',r.status===201)
 r=await post('/api/auth/register-seller',{...sellerForm,email:'invalid-seller-ref@example.test',referralCode:'INVALID'},null);check('seller referral codes are validated',r.status===400)
 r=await post('/api/auth/register-seller',{...sellerForm,email:'referral-seller@example.test',referralCode:code},null);check('seller signup accepts referral without wallet PIN',r.status===201,r)
 const newSeller=r.data.user.id,applicantCookie=r.cookie
 r=await req('/api/seller/referrals',{},applicantCookie);check('seller applicant has their own private referral code',r.status===200&&r.data.code!==code)
 r=await post('/api/auth/register-seller',{...sellerForm,email:'second-referral-seller@example.test',referralCode:code},null);const secondSeller=r.data.user.id
 r=await req('/api/admin/referrals',{},cookie);const first=r.data.referrals.find(v=>v.referredId===newSeller),second=r.data.referrals.find(v=>v.referredId===secondSeller)
 check('new referral attributions are seller-only',first?.sellerId===sellerId&&first.signupKind==='seller'&&second?.signupKind==='seller'&&!r.data.referrals.some(v=>v.referredId===joinedId))
 check('referral starts pending without automatic credits',first.status==='pending'&&first.amountCents===0)
 const before=(await req('/api/seller/finance',{},seller)).data.wallet.balanceCents
 check('seller cannot approve own reward',(await post('/api/admin/referrals/'+first.id,{status:'rewarded',amountCents:500,reason:'Fixture reward'},seller,'PATCH')).status===403)
 check('negative rewards rejected',(await post('/api/admin/referrals/'+first.id,{status:'rewarded',amountCents:-1,reason:'Invalid'},cookie,'PATCH')).status===400)
 const reward={status:'rewarded',amountCents:500,reason:'Fixture referral approved'}
 const concurrent=await Promise.all([post('/api/admin/referrals/'+first.id,reward,cookie,'PATCH'),post('/api/admin/referrals/'+first.id,reward,cookie,'PATCH')]);check('referral rewards are idempotent',concurrent.every(v=>v.status===200))
 const finance=(await req('/api/seller/finance',{},seller)).data
 check('referral credits seller wallet exactly once',finance.wallet.balanceCents===before+500)
 check('reward can be rejected without funds',(await post('/api/admin/referrals/'+second.id,{status:'rejected',reason:'Fixture duplicate signup'},cookie,'PATCH')).status===200)
 r=await req('/api/seller/referrals',{},seller);check('seller sees accurate referral summary',r.data.summary.total===2&&r.data.summary.rewardedCents===500)
 check('buyer cannot view admin report',(await req('/api/admin/referrals',{},buyer)).status===403)
 check('buyer cannot view seller history',(await req('/api/seller/referrals',{},joinedCookie)).status===403)
 check('one attribution per seller signup',(await db.query('SELECT COUNT(*) AS n FROM shop.seller_referrals WHERE referred_id=$1',[newSeller])).rows[0].n===1)
 check('seller referral does not create transaction PIN',!(await db.query('SELECT pin_hash FROM shop.transaction_security WHERE user_id=$1',[newSeller])).rows[0])
}
