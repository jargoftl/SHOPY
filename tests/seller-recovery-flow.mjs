import {randomBytes,createHash} from 'node:crypto'
import bcrypt from 'bcryptjs'
export async function testSellerRecovery({req,check,db,cookie,buyer}){
 const old=process.env.RECOVERY_PHRASE_KEY;process.env.RECOVERY_PHRASE_KEY=randomBytes(32).toString('hex')
 const post=(path,body,who,ip='198.51.100.235')=>req(path,{method:'POST',headers:{'X-Forwarded-For':ip},body:JSON.stringify(body)},who)
 try{
  const password='phrase-fixture-password',email='phrase-fixture@example.test'
  const id=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role,seller_status) VALUES('Phrase fixture',$1,$2,'customer','pending') RETURNING id",[email,await bcrypt.hash(password,12)])).rows[0].id
  const token=randomBytes(32).toString('hex'),seller='ggu_session='+token
  await db.query('INSERT INTO shop.sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)',[id,createHash('sha256').update(token).digest('hex'),new Date(Date.now()+3600000).toISOString()])
  check('phrase setup requires login',(await post('/api/seller/recovery-phrase/setup',{})).status===401)
  check('ordinary buyer cannot enroll phrase',(await post('/api/seller/recovery-phrase/setup',{},buyer)).status===403)
  let r=await post('/api/seller/recovery-phrase/setup',{},seller),phrase=r.data.phrase
  check('pending seller gets 12 words at registration',r.status===200&&phrase?.split(' ').length===12,r)
  if(!phrase)return
  check('unfinished onboarding returns the same phrase',(await post('/api/seller/recovery-phrase/setup',{},seller)).data.phrase===phrase)
  const stored=(await db.query('SELECT * FROM shop.seller_recovery_phrases WHERE user_id=$1',[id])).rows[0]
  check('phrase backup is encrypted and verifier hashed',!stored.encrypted_phrase.includes(phrase)&&stored.phrase_hash===createHash('sha256').update(phrase).digest('hex'))
  check('cannot reset before phrase saved',(await post('/api/auth/reset-with-phrase',{email,phrase,password:'new-fixture-password'})).status===400)
  check('cannot acknowledge a different phrase',(await post('/api/seller/recovery-phrase/acknowledge',{phrase:'wrong'},seller)).status===400)
  check('seller can acknowledge saved phrase',(await post('/api/seller/recovery-phrase/acknowledge',{phrase},seller)).status===200)
  r=await post('/api/seller/recovery-phrase/setup',{},seller)
  check('saved phrase is absent from onboarding response',r.data.required===false&&!r.data.phrase)
  check('reveal requires current password',(await post('/api/seller/recovery-phrase/reveal',{password:'wrong-password'},seller)).status===403)
  check('seller can reveal with password',(await post('/api/seller/recovery-phrase/reveal',{password},seller)).data.phrase===phrase)
  check('seller cannot access admin backup',(await post(`/api/admin/users/${id}/recovery-phrase`,{password,identityReviewed:true},seller)).status===403)
  check('admin must review identity',(await post(`/api/admin/users/${id}/recovery-phrase`,{password:'long-test-password-123'},cookie)).status===403)
  r=await post(`/api/admin/users/${id}/recovery-phrase`,{password:'long-test-password-123',identityReviewed:true},cookie)
  check('admin retrieves encrypted phrase after password and review',r.data.phrase===phrase,r)
  const audit=(await db.query("SELECT details FROM shop.account_admin_history WHERE user_id=$1 AND action='recovery_phrase_revealed'",[id])).rows[0]
  check('admin access audited without phrase',audit&&!audit.details.includes(phrase))
  check('wrong phrase cannot reset',(await post('/api/auth/reset-with-phrase',{email,phrase:Array(12).fill('wrong').join(' '),password:'new-fixture-password'})).status===400)
  r=await post('/api/auth/reset-with-phrase',{email,phrase:phrase.toUpperCase().replaceAll(' ','  '),password:'new-fixture-password'})
  check('normalized phrase resets password',r.status===200,r)
  check('phrase reset revokes existing sessions',(await req('/api/auth/me',{},seller)).status===401)
  check('consumed phrase cannot be reused',(await post('/api/auth/reset-with-phrase',{email,phrase,password:'another-password'})).status===400)
  check('password actually updated',await bcrypt.compare('new-fixture-password',(await db.query('SELECT password_hash FROM shop.users WHERE id=$1',[id])).rows[0].password_hash))
 }finally{if(old===undefined)delete process.env.RECOVERY_PHRASE_KEY;else process.env.RECOVERY_PHRASE_KEY=old}
}
