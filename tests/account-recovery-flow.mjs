import {randomBytes,createHash} from 'node:crypto'
export async function testAccountRecovery({req,check,db,cookie,buyer,seller}){
 const saved={key:process.env.BREVO_API_KEY,from:process.env.EMAIL_FROM,required:process.env.REGISTRATION_EMAIL_VERIFICATION,old:process.env.SELLER_EMAIL_VERIFICATION,url:process.env.APP_URL,fetch:globalThis.fetch}
 let sends=0
 const post=(path,body,who)=>req(path,{method:'POST',headers:{'X-Forwarded-For':'198.51.100.218'},body:JSON.stringify(body)},who)
 try{
  delete process.env.REGISTRATION_EMAIL_VERIFICATION;process.env.SELLER_EMAIL_VERIFICATION='required';process.env.BREVO_API_KEY='fixture-paused';process.env.EMAIL_FROM='sender@example.test';process.env.APP_URL='https://example.test'
  globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.brevo.com/v3/smtp/email'){sends++;return new Response('{}',{status:403})}return saved.fetch(url,options)}
  let r=await post('/api/auth/registration-verification-code',{email:'recovery-fixture@example.test',fullName:'Recovery fixture'})
  check('signup code gate defaults off even with legacy required setting',r.status===200&&r.data.verificationRequired===false&&sends===0)
  r=await post('/api/auth/register',{email:'recovery-fixture@example.test',fullName:'Recovery fixture',password:'recovery-original-password'})
  check('buyer registration works with a failing email provider',r.status===201&&r.data.user.role==='customer'&&sends===0,r)
  const id=r.data.user.id
  r=await post('/api/auth/request-account-recovery',{email:'recovery-fixture@example.test'})
  const unknown=await post('/api/auth/request-account-recovery',{email:'unknown-recovery@example.test'})
  check('recovery request does not expose account existence',r.status===200&&unknown.status===200&&JSON.stringify(r.data)===JSON.stringify(unknown.data))
  check('buyers cannot read recovery queue',(await req('/api/admin/account-recovery',{},buyer)).status===403)
  const linkPath=`/api/admin/users/${id}/recovery-link`,payload={password:'long-test-password-123',identityReviewed:true}
  check('anonymous cannot issue reset links',(await post(linkPath,payload)).status===401)
  check('seller cannot issue reset links',(await post(linkPath,payload,seller)).status===403)
  check('admin must review requester identity',(await post(linkPath,{...payload,identityReviewed:false},cookie)).status===400)
  check('admin must confirm password',(await post(linkPath,{...payload,password:'wrong-password'},cookie)).status===403)
  r=await post(linkPath,payload,cookie);check('admin can generate an email-independent one-time link',r.status===200&&r.data.resetUrl.startsWith('https://example.test/reset-password#'),r)
  const token=r.data.resetUrl.split('#')[1],stored=(await db.query('SELECT token_hash FROM shop.password_resets WHERE user_id=$1',[id])).rows[0]
  check('only hashed reset token is stored',stored.token_hash===createHash('sha256').update(token).digest('hex')&&!stored.token_hash.includes(token))
  const audit=(await db.query("SELECT details FROM shop.account_admin_history WHERE user_id=$1 AND action='recovery_link_issued'",[id])).rows[0]
  check('reset link creation is audited without secrets',audit&&!audit.details.includes(token))
  const sessionToken=randomBytes(32).toString('hex');await db.query('INSERT INTO shop.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(sessionToken).digest('hex'),id,new Date(Date.now()+600000).toISOString()])
  r=await post('/api/auth/reset-password',{token,password:'recovery-new-password'})
  check('account holder can choose new password without mail',r.status===200)
  check('reset token cannot be reused',(await post('/api/auth/reset-password',{token,password:'another-new-password'})).status===400)
  check('reset revokes old sessions',(await req('/api/auth/me',{},'ggu_session='+sessionToken)).status===401)
  check('new password signs in',(await post('/api/auth/login',{email:'recovery-fixture@example.test',password:'recovery-new-password'})).status===200)
  const root=(await db.query("SELECT id FROM shop.users WHERE email='admin@example.test'")).rows[0]
  check('regular admin cannot recover another admin',(await post(`/api/admin/users/${root.id}/recovery-link`,payload,cookie)).status===403)
  r=await req('/api/admin/account-recovery',{},cookie);check('admin queue reflects link issuance',r.status===200&&r.data.requests.some(v=>v.userId===id&&v.status==='link_issued'))
 }finally{globalThis.fetch=saved.fetch;for(const [env,key]of [['BREVO_API_KEY','key'],['EMAIL_FROM','from'],['REGISTRATION_EMAIL_VERIFICATION','required'],['SELLER_EMAIL_VERIFICATION','old'],['APP_URL','url']]){if(saved[key]===undefined)delete process.env[env];else process.env[env]=saved[key]}}
}
