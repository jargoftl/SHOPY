import {randomBytes,createHash} from 'node:crypto'
export async function testAdminAccess({req,check,db,cookie,buyer,seller}){
 const path='/api/admin/access'
 check('anonymous cannot list admins',(await req(path)).status===401)
 check('regular admin cannot manage admins',(await req(path,{},cookie)).status===403)
 check('buyer cannot manage admins',(await req(path,{},buyer)).status===403)
 check('seller cannot manage admins',(await req(path,{},seller)).status===403)
 const events=await req('/api/admin/events',{},cookie)
 check('admin activity includes bounded network location metadata',events.status===200&&events.data.events.some(e=>e.type==='login'&&e.ipAddress)&&events.data.events.every(e=>typeof e.location==='string'&&typeof e.locationSource==='string'))
 const root=(await db.query("SELECT id,password_hash FROM shop.users WHERE email='admin@example.test'")).rows[0]
 await db.query('UPDATE shop.users SET is_super_admin=1 WHERE id=$1',[root.id])
 const target=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role) VALUES ('Access fixture','access-fixture@example.test',$1,'customer') RETURNING id",[root.password_hash])).rows[0]
 const fixtureSession=async()=>{const token=randomBytes(32).toString('hex');await db.query('INSERT INTO shop.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)',[createHash('sha256').update(token).digest('hex'),target.id,new Date(Date.now()+600000).toISOString()]);return 'ggu_session='+token}
 const targetCookie=await fixtureSession()
 let r
 const change=(payload,session=cookie)=>req(path+'/'+target.id,{method:'PATCH',body:JSON.stringify({action:'grant',expectedRole:'customer',password:'long-test-password-123',...payload})},session)
 check('public session exposes super-admin flag',(await req('/api/auth/me',{},cookie)).data.user.isSuperAdmin===true)
 r=await req(path+'?search=access-fixture@example.test',{},cookie)
 check('super admin can find exact account',r.status===200&&r.data.accounts.some(a=>a.id===target.id)&&!JSON.stringify(r.data).includes('password_hash'))
 check('password confirmation is enforced',(await change({password:'wrong-password'})).status===403)
 check('ordinary buyer cannot promote self',(await change({},targetCookie)).status===403)
 check('super admin can grant admin',(await change({})).status===200)
 check('promoted account must sign in again',(await req('/api/auth/me',{},targetCookie)).status===401)
 // Isolated session avoids exhausting the shared login rate limit in the full suite.
 const newCookie=await fixtureSession()
 r=await req('/api/admin/overview',{},newCookie);check('promoted account can access admin',r.status===200,r)
 check('promoted admin cannot delegate admin',(await req(path,{},newCookie)).status===403)
 check('stale role changes are rejected',(await change({})).status===409)
 check('last super admin cannot remove their own access',(await req(path+'/'+root.id,{method:'PATCH',body:JSON.stringify({action:'remove',expectedRole:'admin',password:'long-test-password-123'})},cookie)).status===409)
 check('super admin can remove regular admin',(await change({action:'remove',expectedRole:'admin'})).status===200)
 check('removed admin session is revoked',(await req('/api/admin/overview',{},newCookie)).status===401)
 r=await req(path,{},cookie)
 check('access history records both transitions',r.data.history.filter(h=>h.targetEmail==='access-fixture@example.test').length===2)
 const approved=(await db.query("INSERT INTO shop.users(full_name,email,password_hash,role,seller_status) VALUES ('Approved seller','approved-access@example.test',$1,'seller','approved') RETURNING id",[root.password_hash])).rows[0]
 const approvedChange=payload=>req(path+'/'+approved.id,{method:'PATCH',body:JSON.stringify({password:'long-test-password-123',...payload})},cookie)
 check('approved seller can be given admin access',(await approvedChange({action:'grant',expectedRole:'seller'})).status===200)
 check('removing admin restores approved seller access',(await approvedChange({action:'remove',expectedRole:'admin'})).status===200&&(await db.query('SELECT role FROM shop.users WHERE id=$1',[approved.id])).rows[0].role==='seller')
 const remaining=(await db.query('SELECT role,is_super_admin FROM shop.users WHERE id=$1',[root.id])).rows[0]
 check('owner access survives changes',remaining.role==='admin'&&remaining.is_super_admin===1)
 check('super admin can grant admin access again',(await change({})).status===200)
 check('a regular admin can be given management access',(await change({action:'grant_management',expectedRole:'admin'})).status===200)
 const managementCookie=await fixtureSession()
 check('new super admin can manage accounts',(await req(path,{},managementCookie)).status===200)
 const selfRemoval=await change({action:'remove',expectedRole:'admin'},managementCookie)
 check('a super admin can remove their own access when another remains',selfRemoval.status===200&&selfRemoval.data.signedOut===true)
 check('self-removal revokes the session',(await req('/api/auth/me',{},managementCookie)).status===401)
 await db.query('UPDATE shop.users SET is_super_admin=0 WHERE id=$1',[root.id])
}
