export async function testAuthCaptcha({req,check,db}){
 const originalFetch=globalThis.fetch,old={...process.env};process.env.AUTH_CAPTCHA='enabled';let code
 const post=(path,body,cookie)=>req(path,{method:'POST',headers:{'X-Forwarded-For':'198.51.100.202'},body:JSON.stringify(body)},cookie)
 const puzzle=async(purpose='login',cookie)=>{const result=await req('/api/auth/captcha?purpose='+purpose,{headers:{'X-Forwarded-For':'198.51.100.202'}},cookie);const binding=cookie||result.cookie;const row=(await db.query('SELECT target_x FROM shop.auth_captcha WHERE id=$1',[result.data.id])).rows[0];await db.query('UPDATE shop.auth_captcha SET created_at=$1 WHERE id=$2',[new Date(Date.now()-1000).toISOString(),result.data.id]);return {challenge:result.data,cookie:binding,x:row.target_x}}
 const solve=async(purpose='login',cookie)=>{const p=await puzzle(purpose,cookie),r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x},p.cookie);return {...p,token:r.data.token}}
 try{
  let r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123'});check('login API rejects absent CAPTCHA proof',r.status===400&&r.data.captchaRequired)
  for(const path of ['/api/auth/register','/api/auth/register-seller','/api/auth/registration-verification-code','/api/auth/seller-verification-code']){r=await post(path,{});check('CAPTCHA protects direct '+path,r.status===400&&r.data.captchaRequired)}
  let p=await puzzle();check('challenge returns images without explicit answer',p.challenge.background.startsWith('data:image/svg+xml;base64,')&&!Object.hasOwn(p.challenge,'target_x')&&!Object.hasOwn(p.challenge,'answer'))
  r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x});check('puzzle answer requires the same browser cookie',r.status===400)
  r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:0},p.cookie);check('wrong slider position is rejected',r.status===400)
  r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x},p.cookie);check('correct slider position issues proof',r.status===200&&/^[a-f0-9]{64}$/.test(r.data.token));let token=r.data.token
  r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x},p.cookie);check('solved challenge cannot mint another proof',r.status===400)
  r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:token});check('proof cannot transfer to another browser',r.status===400&&r.data.captchaRequired)
  r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:token},p.cookie);check('completed puzzle allows login',r.status===200&&r.data.user.role==='admin')
  r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:token},p.cookie);check('login consumes proof once',r.status===400&&r.data.captchaRequired)
  p=await solve('signup');r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:p.token},p.cookie);check('signup proof cannot authorize login',r.status===400)
  const form={fullName:'Puzzle Buyer',email:'puzzle-buyer@example.test',password:'test-puzzle-password',captchaToken:p.token}
  r=await post('/api/auth/register',form,p.cookie);check('signup succeeds after server puzzle with email unconfigured',r.status===201)
  r=await post('/api/auth/register',{...form,email:'replayed-puzzle@example.test'},p.cookie);check('successful registration consumes signup proof',r.status===400&&r.data.captchaRequired)
  p=await puzzle();await db.query('UPDATE shop.auth_captcha SET expires_at=$1 WHERE id=$2',[new Date(Date.now()-1000).toISOString(),p.challenge.id]);r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x},p.cookie);check('expired challenge is rejected',r.status===400)
  p=await puzzle();for(let i=0;i<3;i++)await post('/api/auth/captcha/verify',{id:p.challenge.id,x:0},p.cookie);r=await post('/api/auth/captcha/verify',{id:p.challenge.id,x:p.x},p.cookie);check('three wrong answers require a fresh puzzle',r.status===400)
  p=await solve('login');await db.query('UPDATE shop.auth_captcha SET expires_at=$1 WHERE id=$2',[new Date(Date.now()-1000).toISOString(),p.challenge.id]);r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:p.token},p.cookie);check('expired proof cannot authorize login',r.status===400)
  p=await solve('login');const parallel=await Promise.all([1,2].map(()=>post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123',captchaToken:p.token},p.cookie)));check('concurrent login cannot reuse proof',parallel.filter(r=>r.status===200).length===1&&parallel.filter(r=>r.status===400).length===1)
  process.env.BREVO_API_KEY='test-only-puzzle-email';process.env.EMAIL_FROM='sender@example.test';process.env.SELLER_EMAIL_VERIFICATION='auto'
  globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.brevo.com/v3/smtp/email'){const mail=JSON.parse(options.body),match=mail.textContent.match(/verification code is (\d{6})/);if(match)code=match[1];return new Response('{}',{status:201})}return originalFetch(url,options)}
  p=await solve('signup');const account={fullName:'Email Puzzle Buyer',email:'puzzle-email@example.test',password:'test-puzzle-email-password',captchaToken:p.token}
  r=await post('/api/auth/register',account,p.cookie);check('configured mail requires code for buyer signup',r.status===400)
  r=await post('/api/auth/registration-verification-code',account,p.cookie);check('buyer signup sends a real provider code only after CAPTCHA',r.status===200&&r.data.sent&&!r.data.developmentCode&&code?.length===6)
  const second=await solve('signup');r=await post('/api/auth/verify-registration-email-code',{email:account.email,code,captchaToken:second.token},second.cookie);check('email code cannot be verified from another browser',r.status===400)
  r=await post('/api/auth/verify-registration-email-code',{email:account.email,code,captchaToken:p.token},p.cookie);check('correct email code is verified for original browser',r.status===200&&r.data.verified)
  r=await post('/api/auth/register',{...account,captchaToken:second.token},second.cookie);check('global verified email record cannot be reused by another browser',r.status===400)
  r=await post('/api/auth/register',account,p.cookie);check('buyer registration succeeds with puzzle and verified email',r.status===201)
 }finally{globalThis.fetch=originalFetch;for(const key of ['AUTH_CAPTCHA','BREVO_API_KEY','EMAIL_FROM','SELLER_EMAIL_VERIFICATION']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}}
}
