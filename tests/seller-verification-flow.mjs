export async function testSellerVerification({req,check,cookie,seller,buyer,db,png,base,sellerForm,verificationObjects}){
 const signup=(email,extras={})=>req('/api/auth/register-seller',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.78'},body:JSON.stringify({...sellerForm,email,...extras})})
 const review=(id,status,extras={})=>req(`/api/admin/seller-applications/${id}/review`,{method:'PATCH',body:JSON.stringify({status,revision:1,reviewed:true,...extras})},cookie)
 let r=await req('/api/seller/application-policy');check('signup can require the new private approval API before uploading photos',r.status===200&&r.data.requiresAdminApproval===true&&r.data.requiresIdentityPhotos===true)
 r=await signup('no-docs@example.test',{verificationPhotos:null});check('seller signup requires verification photos',r.status===400)
 r=await signup('no-consent@example.test',{verificationConsent:false});check('seller signup requires private review consent',r.status===400)
 r=await signup('short-phone@example.test',{phone:'123'});check('seller signup validates real-length phone number',r.status===400)
 const invalid={...sellerForm.verificationPhotos,id_front:{type:'image/jpeg',data:png.toString('base64')}}
 r=await signup('bad-id@example.test',{verificationPhotos:invalid});check('verification image MIME must match bytes',r.status===400)
 r=await signup('review-applicant@example.test',{country:'United States',ssnLast4:'0001',phone:undefined});const userId=r.data.user?.id,applicant=r.cookie
 check('applicant can sign up without a phone and has no seller role before review',r.status===201&&r.data.user.role==='customer'&&r.data.user.sellerStatus==='pending',r.status)
 if(!userId)return
 const reference=(await db.query('SELECT ssn_last4 FROM shop.seller_applications WHERE user_id=$1',[userId])).rows[0];check('legacy signup SSN field is ignored',reference.ssn_last4===null)
 r=await req('/api/admin/seller-applications/'+userId,{},cookie);check('private admin review shows no SSN reference for new applicants',r.data.application.ssnLast4===null)
 for(const path of ['/api/seller/products','/api/warehouse','/api/seller/store','/api/seller/marketing']){r=await req(path,{},applicant);check('pending seller denied '+path,r.status===403,r.status)}
 r=await req('/api/seller/products',{method:'POST',body:JSON.stringify({name:'Bypass',price:1,category:'Home',imageUrl:'https://example.test/image.jpg'})},applicant);check('pending seller cannot create product',r.status===403)
 r=await req('/api/stores/'+userId);check('pending seller store is not public',r.status===404)
 r=await req('/api/buyer/account',{method:'PATCH',body:JSON.stringify({fullName:'Changed during review',phone:'+15559999999'})},applicant);check('pending identity details cannot change outside revision review',r.status===409)
 r=await req('/api/admin/users/'+userId+'/role',{method:'PATCH',body:JSON.stringify({role:'seller'})},cookie);check('generic role change cannot bypass verification',r.status===409)
 r=await req('/api/admin/seller-applications',{},cookie);check('admin receives pending application with document count',r.status===200&&r.data.applications.some(a=>a.userId===userId&&a.status==='pending'&&a.documentCount===2))
 r=await req('/api/admin/seller-applications/'+userId,{},buyer);check('buyer cannot open admin verification profile',r.status===403)
 r=await req('/api/seller/application',{},applicant);const document=r.data.documents[0]
 check('applicant receives document IDs, not raw Storage paths',r.status===200&&r.data.documents.length===2&&!JSON.stringify(r.data).includes('object_path')&&!JSON.stringify(r.data).match(/verification\/[a-f0-9-]{36}\./))
 const stored=(await db.query('SELECT * FROM shop.seller_verification_documents WHERE user_id=$1',[userId])).rows
 check('verification photos are stored separately from product images',stored.length===2&&stored.every(d=>d.object_path.startsWith('verification/')))
 let image=await fetch(base+document.url,{headers:{Cookie:applicant}});check('applicant can view own private photo without caching',image.ok&&image.headers.get('cache-control').includes('no-store')&&Buffer.from(await image.arrayBuffer()).equals(png))
 image=await fetch(base+document.url);check('anonymous viewer cannot retrieve verification photo',image.status===401)
 r=await req(document.url,{},buyer);check('other buyer cannot retrieve verification photo',r.status===404)
 r=await req(document.url,{},seller);check('other seller cannot retrieve verification photo',r.status===404)
 image=await fetch(base+document.url,{headers:{Cookie:cookie}});check('admin can retrieve submitted original verification bytes',image.ok&&Buffer.from(await image.arrayBuffer()).equals(png))
 r=await req('/api/product-images/'+document.id);check('private verification photo is not a public product image',r.status===404)
 r=await review(userId,'approved',{reviewed:false});check('approval requires explicit document review',r.status===400)
 r=await req(`/api/admin/seller-applications/${userId}/documents`,{method:'DELETE'},cookie);check('pending application photos cannot be deleted before review',r.status===409)
 const missing=stored[0];await db.query('DELETE FROM shop.seller_verification_documents WHERE id=$1',[missing.id]);r=await review(userId,'approved');check('approval requires both ID documents',r.status===400)
 await db.query('INSERT INTO shop.seller_verification_documents(id,user_id,kind,content_type,object_path,created_at) VALUES ($1,$2,$3,$4,$5,$6)',[missing.id,missing.user_id,missing.kind,missing.content_type,missing.object_path,missing.created_at])
 r=await review(userId,'needs_changes',{note:'Please send a clearer back photo.'});check('admin can request corrections',r.status===200&&r.data.application.status==='needs_changes'&&r.data.user.role==='customer')
 r=await req('/api/seller/application/resubmit',{method:'POST',body:JSON.stringify({revision:1,verificationConsent:true,verificationPhotos:sellerForm.verificationPhotos})},applicant);check('applicant can submit revised private documents without a phone number or SSN',r.status===200&&r.data.application.revision===2&&r.data.application.status==='pending'&&r.data.application.ssnLast4===null)
 r=await req(document.url,{},applicant);check('old document IDs stop working after replacement',r.status===404)
 r=await review(userId,'approved');check('admin cannot approve an outdated photo revision',r.status===409)
 await db.query("UPDATE shop.users SET role='admin' WHERE id=$1",[userId]);
 r=await review(userId,'rejected',{revision:2,note:'Cannot downgrade an admin'});check('seller review cannot demote administrator accounts',r.status===400);
 await db.query("UPDATE shop.users SET role='customer' WHERE id=$1",[userId]);
 r=await review(userId,'approved',{revision:2,establishedOn:'2020-02-30'});check('approval rejects invalid original opening dates',r.status===400,r)
 r=await review(userId,'approved',{revision:2,establishedOn:'2018-08-01'});check('admin approval activates seller and queues email',r.status===200&&r.data.user.role==='seller'&&r.data.user.sellerStatus==='approved'&&r.data.email.status==='pending',r.status)
 const approvedAt=r.data.application.reviewedAt
 check('approval stores original opening date without backdating approval',r.data.profile.establishedOn==='2018-08-01'&&Math.abs(Date.now()-Date.parse(approvedAt))<30000,r.data.application)
 const notice=(await req('/api/notifications',{},applicant)).data.notifications.find(item=>item.title==='Your seller application is approved!')
 check('approval notification matches the actual approval time',notice?.createdAt===approvedAt,notice)
 const dashboardDates=(await req('/api/seller/analytics',{},applicant)).data.dates
 check('seller dashboard receives both approval and original opening dates',dashboardDates?.approvedAt===approvedAt&&dashboardDates.establishedOn==='2018-08-01',dashboardDates)
 const datePath=`/api/admin/sellers/${userId}/dates`
 r=await req(datePath,{method:'PATCH',body:JSON.stringify({establishedOn:'2017-07-01',expectedEstablishedOn:'2018-08-01'})},cookie)
 check('already-approved seller opening date can be corrected',r.status===200&&r.data.dates.establishedOn==='2017-07-01'&&r.data.dates.approvedAt===approvedAt,r)
 r=await review(userId,'approved',{revision:2});check('review cannot be repeated',r.status===409)
 r=await req('/api/seller/products',{},applicant);check('same session gains seller access only after approval',r.status===200)
 r=await req('/api/stores/'+userId);check('approved seller store can now be opened',r.status===200)
 r=await req(`/api/admin/seller-applications/${userId}/email`,{method:'POST'},cookie);check('unconfigured approval email does not pretend delivery',r.status===409)
 const jobs=(await db.query('SELECT * FROM shop.seller_approval_emails WHERE user_id=$1',[userId])).rows;check('approval email is durable and deduplicated',jobs.length===1&&jobs[0].revision===2)
 const actualFetch=globalThis.fetch;let sent=[]
 try{
  process.env.BREVO_API_KEY='test-only-approval-key';process.env.EMAIL_FROM='sender@example.test';process.env.SELLER_EMAIL_VERIFICATION='disabled'
  globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.brevo.com/v3/smtp/email'){sent.push(JSON.parse(options.body));return new Response('{}',{status:201})}return actualFetch(url,options)}
  r=await req(`/api/admin/seller-applications/${userId}/email`,{method:'POST'},cookie);check('configured provider sends queued approval message',r.status===200&&r.data.email.status==='sent')
  const message=sent.find(mail=>mail.to[0].email==='review-applicant@example.test');check('approval email includes approval and safe login link, not identity photos',message?.textContent.includes('approved')&&message.textContent.includes('/seller/login')&&!message.textContent.includes('base64')&&!message.textContent.includes('verification/'))
  r=await req(`/api/admin/seller-applications/${userId}/email`,{method:'POST'},cookie);check('already-sent approval email is not resent',r.status===409)
  r=await signup('mail-outage-applicant@example.test');const outageId=r.data.user.id
  globalThis.fetch=async(url,options)=>String(url)==='https://api.brevo.com/v3/smtp/email'?new Response('{}',{status:503}):actualFetch(url,options)
  r=await review(outageId,'approved');check('email outage does not undo approved seller access',r.status===200&&r.data.user.role==='seller'&&r.data.email.status==='pending'&&r.data.email.attempts===1)
  globalThis.fetch=async(url,options)=>String(url)==='https://api.brevo.com/v3/smtp/email'?new Response('{}',{status:201}):actualFetch(url,options)
  r=await req(`/api/admin/seller-applications/${outageId}/email`,{method:'POST'},cookie);check('failed provider delivery can be retried without reapproval',r.status===200&&r.data.email.status==='sent')
 }finally{globalThis.fetch=actualFetch;process.env.BREVO_API_KEY='';process.env.EMAIL_FROM='';process.env.SELLER_EMAIL_VERIFICATION='auto'}
 const actor=(await db.query('SELECT reviewed_by FROM shop.seller_applications WHERE user_id=$1',[userId])).rows[0].reviewed_by;check('verification review stores authenticated admin actor',Number(actor)>0)
 r=await req(`/api/admin/seller-applications/${userId}/documents`,{method:'DELETE'},cookie);check('admin may remove verification photos after review',r.status===200)
 r=await req(document.url,{},cookie);check('removed verification photo cannot be retrieved',r.status===404)
 const remaining=(await db.query('SELECT COUNT(*) AS n FROM shop.seller_verification_documents WHERE user_id=$1',[userId])).rows[0].n;check('verification photo removal retains approval history',Number(remaining)===0&&(await db.query('SELECT status FROM shop.seller_applications WHERE user_id=$1',[userId])).rows[0].status==='approved')
 // Existing buyers apply using their own authenticated account; email/password/balances are retained.
 r=await req('/api/auth/register',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.83'},body:JSON.stringify({fullName:'Existing Buyer',email:'existing-applicant@example.test',password:'existing-password-123'})});
 const existingCookie=r.cookie,existingId=r.data.user.id;
 const hashBefore=(await db.query('SELECT password_hash FROM shop.users WHERE id=$1',[existingId])).rows[0].password_hash;
 await db.query("INSERT INTO shop.seller_profiles(user_id,store_name,country,address,city,region,postal_code) VALUES ($1,'Old inactive store','Test','Test','Test','Test','123')",[existingId]);
 const oldProduct=(await db.query("INSERT INTO shop.products(name,category,price,image_url,seller_id,is_published,is_store_published) VALUES ('Inactive legacy product','Home',10,'https://example.test/image.png',$1,1,1) RETURNING id",[existingId])).rows[0].id;
 await db.query('INSERT INTO shop.reward_balances(user_id,balance_units) VALUES ($1,12345)',[existingId]);
 r=await req('/api/seller/application',{method:'POST',headers:{'X-Forwarded-For':'198.51.100.84'},body:JSON.stringify({...sellerForm,email:'someone-else@example.test',password:'must-not-replace-existing-password'})},existingCookie);
 check('existing buyer can submit a seller application without a second account',r.status===201&&r.data.user.id===existingId&&r.data.user.email==='existing-applicant@example.test'&&r.data.user.sellerStatus==='pending',r.status);
 r=await req('/api/products/'+oldProduct);check('pending applicant legacy products cannot be sold publicly',r.status===404);
 check('existing buyer password and balance remain unchanged',hashBefore===(await db.query('SELECT password_hash FROM shop.users WHERE id=$1',[existingId])).rows[0].password_hash&&Number((await db.query('SELECT balance_units FROM shop.reward_balances WHERE user_id=$1',[existingId])).rows[0].balance_units)===12345);
 r=await req('/api/seller/application',{method:'POST',body:JSON.stringify(sellerForm)},existingCookie);check('existing buyer cannot create duplicate pending applications',r.status===409);
 r=await req('/api/seller/application',{method:'POST',body:JSON.stringify(sellerForm)});check('existing-account application requires authentication',r.status===401);
 const storagePut=(await import('../dist-server/storage.js')).ObjectStorage.prototype.putVerification;let writes=0
 try{
  const {ObjectStorage}=await import('../dist-server/storage.js');ObjectStorage.prototype.putVerification=async(...args)=>{if(++writes===2)throw new Error('Test-only private upload failure');return storagePut(...args)}
  r=await signup('private-upload-failure@example.test');check('partial verification upload failure blocks signup',r.status===500)
  check('failed verification upload creates no account',(await db.query("SELECT 1 FROM shop.users WHERE email='private-upload-failure@example.test'")).rows.length===0)
 }finally{(await import('../dist-server/storage.js')).ObjectStorage.prototype.putVerification=storagePut}
}
