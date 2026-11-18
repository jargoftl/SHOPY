// Regression coverage for puzzle-free authentication and browser-bound email codes.
export async function testAuthCaptcha({req,check}) {
 const originalFetch=globalThis.fetch,old={...process.env};let code
 const post=(path,body,cookie)=>req(path,{method:'POST',headers:{'X-Forwarded-For':'198.51.100.202'},body:JSON.stringify(body)},cookie)
 try {
  let r=await req('/api/auth/captcha');check('cached clients are told the puzzle is disabled',r.status===200&&r.data.enabled===false)
  r=await post('/api/auth/login',{email:'admin@example.test',password:'long-test-password-123'});check('login succeeds without a puzzle',r.status===200&&r.data.user.role==='admin')
  r=await post('/api/auth/login',{email:'admin@example.test',password:'incorrect'});check('puzzle removal retains password verification',r.status===401)
  r=await post('/api/auth/register',{fullName:'Puzzle-free buyer',email:'no-puzzle@example.test',password:'test-puzzle-free-password'});check('buyer signup succeeds without puzzle while mail unconfigured',r.status===201)
  process.env.BREVO_API_KEY='test-only-email';process.env.EMAIL_FROM='sender@example.test';process.env.REGISTRATION_EMAIL_VERIFICATION='required'
  globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.brevo.com/v3/smtp/email'){const mail=JSON.parse(options.body),match=mail.textContent.match(/verification code is (\d{6})/);if(match)code=match[1];return new Response('{}',{status:201})}return originalFetch(url,options)}
  const account={fullName:'Email Buyer',email:'browser-email@example.test',password:'test-email-password'}
  r=await post('/api/auth/register',account);check('configured mail still requires a verification code',r.status===400)
  r=await post('/api/auth/registration-verification-code',account);const browser=r.cookie
  check('code is emailed without exposing it and binds the browser',r.status===200&&r.data.sent&&!r.data.developmentCode&&/^\d{6}$/.test(code)&&browser?.startsWith('auth_browser='))
  r=await post('/api/auth/verify-registration-email-code',{email:account.email,code});check('another browser cannot verify the email code',r.status===400)
  r=await post('/api/auth/verify-registration-email-code',{email:account.email,code},browser);check('original browser can verify emailed code without puzzle',r.status===200&&r.data.verified)
  r=await post('/api/auth/register',account);check('verified email cannot be reused by another browser',r.status===400)
  r=await post('/api/auth/register',account,browser);check('verified buyer can register without puzzle',r.status===201)
 }finally{globalThis.fetch=originalFetch;for(const key of ['BREVO_API_KEY','EMAIL_FROM','REGISTRATION_EMAIL_VERIFICATION']){if(old[key]===undefined)delete process.env[key];else process.env[key]=old[key]}}
}
