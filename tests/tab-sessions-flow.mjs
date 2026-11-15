export async function testTabSessions({req,check,db}){
 const scopes={buyer:'a'.repeat(32),seller:'b'.repeat(32),admin:'c'.repeat(32)},cookies=[]
 for(const [role,scope] of Object.entries(scopes)){
  const email=role==='buyer'?'buyer@example.test':role==='seller'?'seller@example.test':'admin@example.test'
  const r=await req('/api/auth/login',{method:'POST',headers:{'X-Session-Scope':scope,'X-Forwarded-For':'198.51.100.190'},body:JSON.stringify({email,password:'long-test-password-123'})})
  cookies.push(r.cookie);check(role+' receives its own HttpOnly-scoped session cookie',r.status===200&&r.cookie?.startsWith('ggu_session_'+scope+'='))
 }
 const jar=cookies.join('; ')
 for(const [role,scope] of Object.entries(scopes)){
  const r=await req('/api/auth/me',{headers:{'X-Session-Scope':scope}},jar)
  check('shared browser retains independent '+role+' tab',r.status===200&&r.data.user.role===(role==='buyer'?'customer':role))
 }
 let r=await req('/api/admin/users',{headers:{'X-Session-Scope':scopes.buyer}},jar);check('buyer tab cannot borrow admin cookie',r.status===403)
 r=await req('/api/auth/me',{},jar);check('no selector cannot silently select another tab session',r.status===401)
 r=await req('/api/auth/me',{headers:{'X-Session-Scope':'invalid'}},jar);check('malformed tab selector does not fall back to another account',r.status===401)
 r=await req('/api/auth/me',{headers:{'X-Session-Scope':scopes.buyer}},'ggu_session_'+scopes.buyer+'=j:%7B%22bad%22%3Atrue%7D');check('malformed session cookies are rejected without a server error',r.status===401)
 const receipt=(await db.query('SELECT id FROM shop.purchase_receipts LIMIT 1')).rows[0]
 if(receipt){r=await req(`/api/admin/purchase-receipts/${receipt.id}?sessionScope=${scopes.admin}`,{},jar);check('private receipt links use non-secret tab selector',r.status===200);r=await req(`/api/admin/purchase-receipts/${receipt.id}?sessionScope=${scopes.buyer}`,{},jar);check('private receipt still enforces role after tab selector',r.status===403)}
 await req('/api/auth/logout',{method:'POST',headers:{'X-Session-Scope':scopes.buyer},body:'{}'},jar)
 r=await req('/api/auth/me',{headers:{'X-Session-Scope':scopes.buyer}},jar);check('logout clears selected buyer session',r.status===401)
 for(const role of ['seller','admin']){r=await req('/api/auth/me',{headers:{'X-Session-Scope':scopes[role]}},jar);check('buyer logout preserves '+role+' tab',r.status===200)}
}
