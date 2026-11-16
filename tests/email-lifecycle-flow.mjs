import {randomUUID} from 'node:crypto'
import {Database} from '../dist-server/database.js'
import {deliverSellerDeliveryEmails} from '../dist-server/deliveryEmails.js'
import {deliverApprovalEmails} from '../dist-server/sellerVerification.js'
export async function testEmailLifecycle({req,check,db,cookie,seller,sellerId,sellerForm}){
 const saved={fetch:globalThis.fetch,key:process.env.BREVO_API_KEY,from:process.env.EMAIL_FROM,verification:process.env.SELLER_EMAIL_VERIFICATION,url:process.env.APP_URL}
 const accepted=[],attempted=[];let providerWorks=true
 process.env.BREVO_API_KEY='fixture-email-key';process.env.EMAIL_FROM='sender@example.test';process.env.SELLER_EMAIL_VERIFICATION='required';process.env.APP_URL='https://example.test'
 globalThis.fetch=async(url,options)=>{if(String(url)==='https://api.brevo.com/v3/smtp/email'){const mail=JSON.parse(options.body);attempted.push(mail);if(providerWorks)accepted.push(mail);return new Response('{}',{status:providerWorks?201:503})}return saved.fetch(url,options)}
 const post=(path,body,who,method='POST')=>req(path,{method,headers:{'X-Forwarded-For':'198.51.100.94'},body:JSON.stringify(body)},who)
 const codeFor=email=>attempted.findLast(m=>m.to[0].email===email&&/verification code is \d{6}/.test(m.textContent))?.textContent.match(/verification code is (\d{6})/)[1]
 const database=new Database()
 try{
  const buyerForm={fullName:'Verified Email Buyer',email:'lifecycle-buyer@example.test',password:'email-buyer-password-123'}
  let r=await post('/api/auth/register',buyerForm);check('required email blocks buyer creation before code verification',r.status===400)
  r=await post('/api/auth/registration-verification-code',{email:buyerForm.email,fullName:buyerForm.fullName});const browser=r.cookie,code=codeFor(buyerForm.email)
  check('buyer receives six-digit email code without API plaintext disclosure',r.status===200&&r.data.sent===true&&/^\d{6}$/.test(code||'')&&!JSON.stringify(r.data).includes(code),r)
  const stored=(await db.query('SELECT * FROM shop.seller_email_verifications WHERE email=$1',[buyerForm.email])).rows[0];check('email challenge stores a hash and ten-minute expiry',stored.code_hash!==code&&stored.code_hash.length===64&&new Date(stored.expires_at)>new Date())
  r=await post('/api/auth/verify-registration-email-code',{email:buyerForm.email,code:'000000'},browser);check('wrong buyer code cannot verify email',r.status===400)
  r=await post('/api/auth/verify-registration-email-code',{email:buyerForm.email,code});check('email code is bound to requesting browser',r.status===400)
  r=await post('/api/auth/verify-registration-email-code',{email:buyerForm.email,code},browser);check('correct buyer code verifies email ownership',r.status===200&&r.data.verified===true)
  r=await post('/api/auth/register',buyerForm,browser);const buyer=r.cookie,buyerId=r.data.user?.id;check('verified buyer can finish signup immediately',r.status===201&&r.data.user.role==='customer',r)
  check('successful buyer signup consumes the verified challenge',(await db.query('SELECT 1 FROM shop.seller_email_verifications WHERE email=$1',[buyerForm.email])).rows.length===0)
  r=await req('/api/buyer/profile',{},buyer);check('verified buyer can access shopping account without seller approval',r.status===200)
  const application={...sellerForm,email:'lifecycle-seller@example.test',transactionPin:undefined,confirmTransactionPin:undefined}
  r=await post('/api/auth/register-seller',application);check('seller application requires verified email code',r.status===400)
  r=await post('/api/auth/seller-verification-code',{email:application.email,fullName:application.fullName});const sellerBrowser=r.cookie,sellerCode=codeFor(application.email)
  r=await post('/api/auth/verify-seller-email-code',{email:application.email,code:sellerCode},sellerBrowser);check('seller verifies code before submitting application',r.status===200&&r.data.verified===true)
  r=await post('/api/auth/register-seller',application,sellerBrowser);const applicant=r.cookie,applicantId=r.data.user?.id;check('verified email does not bypass administrator seller approval',r.status===201&&r.data.user.role==='customer'&&r.data.user.sellerStatus==='pending',r)
  r=await req('/api/seller/products',{},applicant);check('email-verified pending seller cannot publish products',r.status===403)
  r=await post(`/api/admin/seller-applications/${applicantId}/review`,{status:'approved',revision:1,reviewed:true},cookie,'PATCH');await deliverApprovalEmails(database);check('administrator approval enables seller account',r.status===200&&r.data.user.role==='seller')
  const approval=accepted.find(m=>m.to[0].email===application.email&&m.subject.includes('seller application is approved'));check('approved seller receives approval email at provided address',approval?.textContent.includes('Congratulations')&&approval.textContent.includes('/seller/login'))
  r=await req('/api/seller/products',{},applicant);check('approved seller can publish using existing session',r.status===200)
  r=await post(`/api/admin/seller-applications/${applicantId}/review`,{status:'approved',revision:1,reviewed:true},cookie,'PATCH');await deliverApprovalEmails(database);check('approval retries do not repeat approval email',r.status===409&&accepted.filter(m=>m.to[0].email===application.email&&m.subject.includes('seller application is approved')).length===1)
  // Drain older synthetic jobs first; all sends remain mocked.
  for(let i=0;i<3;i++)await deliverSellerDeliveryEmails(database)
  r=await post('/api/admin/buyer-funding',{buyerId,amountCents:10000,reason:'Email lifecycle checkout fixture',verified:true,requestKey:randomUUID()},cookie);check('email-verified buyer can be funded for purchases',r.status===200)
  r=await post('/api/seller/products',{name:'Email lifecycle product',category:'Email fixtures',price:10,imageUrl:'https://example.test/product.jpg',stockQuantity:10},seller);const productId=r.data.product?.id
  const purchase=async()=>post('/api/purchases',{requestKey:randomUUID(),coin:'BALANCE',expectedTotalCents:1030,billing:{fullName:buyerForm.fullName,email:buyerForm.email,phone:'+12025550123',address:'1 Private fixture street',city:'Test',region:'CA',postalCode:'90210',country:'United States'},items:[{id:productId,quantity:1,selectedColor:'',selectedSize:''}]},buyer)
  r=await purchase();const orderId=r.data.id;check('verified buyer can buy after email signup',r.status===201,r)
  const number=(await db.query("SELECT number FROM shop.order_numbers WHERE kind='purchase' AND order_id=$1",[orderId])).rows[0].number
  const subject=`Order #${number} marked delivered`
  const freshMail=()=>accepted.filter(m=>m.subject.startsWith(subject))
  r=await post(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'on_the_way'},seller,'PATCH');await deliverSellerDeliveryEmails(database);check('in-transit progress does not send a delivery email',r.status===200&&freshMail().length===0)
  const balances=JSON.stringify((await db.query('SELECT * FROM shop.seller_wallets ORDER BY seller_id')).rows)
  r=await post(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'delivered'},seller,'PATCH');check('marking delivered commits independently of email sending',r.status===200)
  await deliverSellerDeliveryEmails(database)
  const owner=(await db.query('SELECT email FROM shop.users WHERE id=$1',[sellerId])).rows[0].email,tracking=(await db.query('SELECT tracking_code FROM shop.purchase_sellers WHERE order_id=$1 AND seller_id=$2',[orderId,sellerId])).rows[0].tracking_code
  check('delivery email goes to order store owner, not buyer',freshMail().length===1&&freshMail()[0].to[0].email===owner)
  check('delivery email includes correct order and tracking without buyer private details',freshMail()[0]?.textContent.includes(tracking)&&freshMail()[0].textContent.includes('/seller/orders?order=')&&!freshMail()[0].textContent.includes('Private fixture street')&&!freshMail()[0].textContent.includes(buyerForm.email))
  await post(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'delivered'},seller,'PATCH');await post(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'on_the_way'},cookie,'PATCH');await post(`/api/purchase-sellers/${orderId}/${sellerId}`,{status:'delivered'},cookie,'PATCH');await deliverSellerDeliveryEmails(database)
  check('repeated delivered updates do not duplicate sent delivery email',freshMail().length===1&&(await db.query('SELECT COUNT(*) AS n FROM shop.seller_delivery_emails WHERE order_id=$1 AND seller_id=$2',[orderId,sellerId])).rows[0].n===1)
  check('delivery email has no effect on seller wallet money',JSON.stringify((await db.query('SELECT * FROM shop.seller_wallets ORDER BY seller_id')).rows)===balances)
  r=await purchase();const failedOrder=r.data.id
  providerWorks=false;r=await post(`/api/purchase-sellers/${failedOrder}/${sellerId}`,{status:'delivered'},cookie,'PATCH');await deliverSellerDeliveryEmails(database)
  const failed=(await db.query('SELECT * FROM shop.seller_delivery_emails WHERE order_id=$1 AND seller_id=$2',[failedOrder,sellerId])).rows[0]
  check('email outage preserves delivered status and durable retry job',r.status===200&&failed.status==='pending'&&failed.attempts===1&&(await db.query('SELECT status FROM shop.purchase_sellers WHERE order_id=$1 AND seller_id=$2',[failedOrder,sellerId])).rows[0].status==='delivered')
  r=await post(`/api/admin/purchase-sellers/${failedOrder}/${sellerId}/delivery-email`,{},buyer);check('buyer cannot send delivery emails',r.status===403)
  r=await post(`/api/admin/purchase-sellers/${failedOrder}/${sellerId}/delivery-email`,{},seller);check('seller cannot repeatedly force email retries',r.status===403)
  providerWorks=true;r=await post(`/api/admin/purchase-sellers/${failedOrder}/${sellerId}/delivery-email`,{},cookie);check('administrator can retry failed delivery email',r.status===200&&r.data.email.status==='sent')
  r=await post(`/api/admin/purchase-sellers/${failedOrder}/${sellerId}/delivery-email`,{},cookie);check('sent delivery email cannot be manually resent',r.status===409)
  r=await req('/api/seller/purchases',{},seller);check('seller dashboard exposes actual delivery email status',r.data.orders.some(o=>o.id===failedOrder&&o.sellers[0].deliveryEmailStatus==='sent'))
 }finally{globalThis.fetch=saved.fetch;for(const [name,key] of [['BREVO_API_KEY','key'],['EMAIL_FROM','from'],['SELLER_EMAIL_VERIFICATION','verification'],['APP_URL','url']]){if(saved[key]===undefined)delete process.env[name];else process.env[name]=saved[key]}}
}
