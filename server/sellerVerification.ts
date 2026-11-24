import {setStoreEstablishedDate,storeDates,validEstablishedDate} from './storeDates.ts'
import {decryptSellerSsn,ssnStorageConfigured} from './sellerSsn.ts'
import { randomUUID } from 'node:crypto'
import express, { type Express, type RequestHandler } from 'express'
import type { Database } from './database.ts'
import { ObjectStorage } from './storage.ts'
import { isEmailConfigured, sendSellerApprovalEmail } from './email.ts'

type Role = 'customer' | 'seller' | 'admin'
const kinds = ['id_front','id_back'] as const
type PhotoKind = typeof kinds[number] | 'selfie'
type Photo = { kind: PhotoKind, contentType: string, image: Buffer }
export type StoredVerificationPhoto = { id: string, kind: PhotoKind, contentType: string, objectPath: string }
type Application = { ssn_encrypted: string | null, ssn_last4: string | null, user_id: number, status: string, revision: number, consented_at: string, submitted_at: string, reviewed_at: string | null, reviewed_by: number | null, review_note: string }
const storage = new ObjectStorage()
const stamp = () => new Date().toISOString()
const idValue = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0
export function verificationPhone(value: unknown) {
  if (typeof value !== 'string') return null
  const phone = value.replace(/[\s()-]/g, '')
  return /^\+?[1-9]\d{6,14}$/.test(phone) ? phone : null
}
export function prepareVerificationPhotos(body: Record<string, unknown>): { photos: Photo[] } | { error: string } {
  if (body.verificationConsent !== true) return { error: 'Agree to private administrator review of your verification photos.' }
  const input = body.verificationPhotos
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'Upload the front and back of your government-issued ID.' }
  const photos: Photo[] = []
  for (const kind of kinds) {
    const file = (input as Record<string, unknown>)[kind] as { type?: unknown, data?: unknown } | undefined
    if (!file || typeof file.data !== 'string' || typeof file.type !== 'string' || file.data.length > 2800000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(file.data)) return { error: `Choose a valid ${kind.replace('_',' ')} image up to 2 MB.` }
    const image = Buffer.from(file.data, 'base64')
    const png = image.length >= 24 && image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    const jpeg = image.length >= 12 && image[0] === 255 && image[1] === 216 && image[2] === 255
    const webp = image.length >= 12 && image.subarray(0,4).toString() === 'RIFF' && image.subarray(8,12).toString() === 'WEBP'
    const actual = png ? 'image/png' : jpeg ? 'image/jpeg' : webp ? 'image/webp' : ''
    if (!actual || file.type !== actual || image.length > 2 * 1024 * 1024) return { error: 'Use valid PNG, JPEG or WebP verification photos, up to 2 MB each.' }
    photos.push({ kind, contentType: actual, image })
  }
  return { photos }
}
export async function queuePhotoCleanup(db: Database, photos: StoredVerificationPhoto[]) {
  for (const photo of photos) await db.prepare('INSERT INTO verification_cleanup(object_path,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').run(photo.objectPath, stamp())
}
export async function uploadVerificationPhotos(db: Database, photos: Photo[]) {
  const uploaded: StoredVerificationPhoto[] = []
  try {
    for (const photo of photos) uploaded.push({ id: randomUUID(), kind: photo.kind, contentType: photo.contentType, objectPath: await storage.putVerification(photo.image, photo.contentType) })
    return uploaded
  } catch (error) { await queuePhotoCleanup(db, uploaded); throw error }
}
export async function insertApplicationPhotos(db: Database, userId: number, photos: StoredVerificationPhoto[]) {
  for (const photo of photos) await db.prepare('INSERT INTO seller_verification_documents(id,user_id,kind,content_type,object_path,created_at) VALUES (?,?,?,?,?,?)').run(photo.id,userId,photo.kind,photo.contentType,photo.objectPath,stamp())
}
let delivering = false
export async function deliverApprovalEmails(db: Database) {
  if (delivering || !isEmailConfigured()) return
  delivering = true
  try {
    for (let i = 0; i < 5; i++) {
      const job = await db.transaction(async () => {
        const row = await db.prepare("SELECT e.id,e.user_id,e.attempts,u.email,u.full_name FROM seller_approval_emails e JOIN users u ON u.id=e.user_id JOIN seller_applications a ON a.user_id=e.user_id AND a.revision=e.revision WHERE a.status='approved' AND u.role='seller' AND e.status IN ('pending','sending') AND e.next_attempt_at<=? ORDER BY e.next_attempt_at,e.id LIMIT 1").get(stamp()) as { id: string, user_id: number, attempts: number, email: string, full_name: string } | undefined
        if (!row) return null
        await db.prepare("UPDATE seller_approval_emails SET status='sending',attempts=attempts+1,next_attempt_at=? WHERE id=?").run(new Date(Date.now()+120000).toISOString(),row.id)
        return row
      })()
      if (!job) break
      const setting = await db.prepare("SELECT value FROM site_settings WHERE key='site_name'").get() as { value: string } | undefined
      const sent = await sendSellerApprovalEmail(job.email, job.full_name, setting?.value || 'our marketplace')
      await db.prepare('UPDATE seller_approval_emails SET status=?,sent_at=?,last_error=?,next_attempt_at=? WHERE id=?').run(sent?'sent':job.attempts+1>=5?'failed':'pending',sent?stamp():null,sent?'':'Email provider did not accept the message. Check backend email settings.',new Date(Date.now()+300000).toISOString(),job.id)
    }
  } finally { delivering = false }
}
export async function cleanupVerificationPhotos(db: Database) {
  const rows = await db.prepare('SELECT object_path FROM verification_cleanup ORDER BY created_at LIMIT 20').all() as { object_path: string }[]
  for (const row of rows) {
    try { await storage.deleteVerification(row.object_path); await db.prepare('DELETE FROM verification_cleanup WHERE object_path=?').run(row.object_path) }
    catch { /* Keep the private object queued for another attempt. */ }
  }
}
class ReviewError extends Error { status: number; constructor(status: number, message: string) { super(message); this.status=status } }
export async function registerSellerVerification(app: Express, db: Database, auth: RequestHandler, role: (...roles: Role[]) => RequestHandler) {
  app.use(['/api/seller/application','/api/admin/seller-applications','/api/seller-verification'], (_req,res,next)=>{res.set('Cache-Control','private, no-store');next()})
  const getApplication = async (id: number) => await db.prepare('SELECT * FROM seller_applications WHERE user_id=?').get(id) as Application | undefined
  const notify = db.prepare('INSERT INTO notifications(user_id,type,title,body,link,created_at) VALUES (?,?,?,?,?,?)')
  const serialize = async (id: number) => {
    const application = await getApplication(id)
    const user = await db.prepare('SELECT id,full_name AS fullName,email,phone,role,seller_status AS sellerStatus FROM users WHERE id=?').get(id)
    const profile = await db.prepare('SELECT store_name AS storeName,country,address,city,region,postal_code AS postalCode, established_on::text AS establishedOn FROM seller_profiles WHERE user_id=?').get(id)
    const docs = await db.prepare('SELECT id,kind,content_type AS contentType,created_at AS createdAt FROM seller_verification_documents WHERE user_id=? ORDER BY kind').all(id) as { id: string }[]
    const email = await db.prepare('SELECT status,attempts,sent_at AS sentAt,last_error AS lastError FROM seller_approval_emails WHERE user_id=? ORDER BY revision DESC LIMIT 1').get(id)
    return { application: application ? { status: application.status, revision: application.revision, consentedAt: application.consented_at, submittedAt: application.submitted_at, reviewedAt: application.reviewed_at, reviewNote: application.review_note, ssnLast4: application.ssn_last4 || null, ssnAvailable: Boolean(application.ssn_encrypted), ssnVerified: false } : null, user, profile: profile || null, documents: docs.map(doc=>({...doc,url:`/api/seller-verification/documents/${doc.id}`})), email: email || null }
  }
  const reviewedRoute = (handler: RequestHandler): RequestHandler => async (req,res,next) => {
    try { await handler(req,res,next) } catch(error) { if(error instanceof ReviewError) { res.status(error.status).json({error:error.message}); return } next(error) }
  }
  app.post('/api/admin/seller-applications/:id/ssn',auth,role('admin'),reviewedRoute(async(req,res)=>{
    const id=idValue(req.params.id),application=await getApplication(id)
    if(!application?.ssn_encrypted)return res.status(404).json({error:'No full SSN is on file.'})
    if(!ssnStorageConfigured())return res.status(503).json({error:'SSN storage key is unavailable.'})
    const ssn=decryptSellerSsn(application.ssn_encrypted)
    await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES (?,?,?,?)').run(id,req.user!.id,'ssn_viewed','Administrator viewed seller SSN.')
    res.set('Cache-Control','private, no-store').json({ssn})
  }))
  app.get('/api/seller/application-policy',(_req,res)=>res.set('Cache-Control','no-store').json({requiresAdminApproval:true,requiresIdentityPhotos:true,optionalSsnLast4:false,fullSsn:false}))
  app.get('/api/seller/application',auth,async(req,res)=>res.json(await serialize(req.user!.id)))
  app.get('/api/admin/seller-applications',auth,role('admin'),async(_req,res)=>{
    const applications = await db.prepare(`SELECT a.user_id AS userId,u.public_id AS publicId,a.status,a.revision,a.submitted_at AS submittedAt,u.full_name AS fullName,u.email,u.phone,p.store_name AS storeName,
      (SELECT COUNT(*) FROM seller_verification_documents d WHERE d.user_id=a.user_id) AS documentCount
      FROM seller_applications a JOIN users u ON u.id=a.user_id JOIN seller_profiles p ON p.user_id=u.id WHERE u.deleted_at IS NULL ORDER BY CASE WHEN a.status='pending' THEN 0 ELSE 1 END,a.submitted_at DESC LIMIT 250`).all()
    res.json({applications,emailConfigured:isEmailConfigured()})
  })
  app.get('/api/admin/seller-applications/:id',auth,role('admin'),async(req,res)=>{
    const id=idValue(req.params.id)
    if (!id || !await db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) return res.status(404).json({error:'Applicant not found.'})
    res.json({...await serialize(id),emailConfigured:isEmailConfigured()})
  })
  app.get('/api/seller-verification/documents/:id',auth,async(req,res)=>{
    const document = await db.prepare('SELECT user_id,content_type,object_path FROM seller_verification_documents WHERE id=?').get(String(req.params.id)) as {user_id:number,content_type:string,object_path:string}|undefined
    if(!document || (req.user!.role!=='admin' && req.user!.id!==document.user_id)) return res.status(404).json({error:'Verification photo not found.'})
    const image=await storage.getVerification(document.object_path)
    res.set('Cache-Control','private, no-store').set('X-Content-Type-Options','nosniff').set('Content-Disposition','inline').type(document.content_type).send(image)
  })
  app.patch('/api/admin/seller-applications/:id/review',auth,role('admin'),reviewedRoute(async(req,res)=>{
    const id=idValue(req.params.id),status=req.body?.status,note=(typeof req.body?.note==='string'?req.body.note.trim():'') || (status==='needs_changes'?'Changes requested.':'')
    if(!['approved','rejected','needs_changes'].includes(status)||note.length>2000) return res.status(400).json({error:'Choose a review decision.'})
    const establishedOn=req.body?.establishedOn
    if(establishedOn!==undefined&&(status!=='approved'||!validEstablishedDate(establishedOn)))return res.status(400).json({error:'Choose a valid original opening date.'})
    await db.transaction(async()=>{
      const application=await getApplication(id)
      if(!application)throw new ReviewError(404,'Seller application not found.')
      if(application.status!=='pending'||req.body?.revision!==application.revision)throw new ReviewError(409,'This application changed or was already reviewed. Reload it first.')
      const applicant = await db.prepare('SELECT phone,suspended,role FROM users WHERE id=? AND deleted_at IS NULL').get(id) as {phone:string,suspended:number,role:string}
      if (!applicant) throw new ReviewError(404,'Active seller applicant not found.')
      if (applicant.role==='admin') throw new ReviewError(400,'Administrator accounts cannot be reviewed as seller applicants.')
      if(status==='approved') {
        const documents=await db.prepare('SELECT kind FROM seller_verification_documents WHERE user_id=?').all(id) as {kind:string}[]
        if(req.body?.reviewed!==true||kinds.some(kind=>!documents.some(d=>d.kind===kind))||!verificationPhone(applicant.phone)||applicant.suspended)throw new ReviewError(400,'Review both ID photos and the phone number before approval. Suspended or admin accounts cannot be approved here.')
      }
      if(establishedOn!==undefined){
        const dates=await storeDates(db,id)
        if(!dates)throw new ReviewError(404,'Store not found.')
        await setStoreEstablishedDate(db,id,req.user!.id,establishedOn,dates.establishedOn,'Original opening date supplied during seller approval')
      }
      const reviewedAt=stamp()
      await db.prepare('UPDATE seller_applications SET status=?,reviewed_at=?,reviewed_by=?,review_note=? WHERE user_id=?').run(status,reviewedAt,req.user!.id,note,id)
      await db.prepare('UPDATE users SET role=?,seller_status=? WHERE id=?').run(status==='approved'?'seller':'customer',status,id)
      await db.prepare('UPDATE seller_profiles SET verification_status=? WHERE user_id=?').run(status,id)
      await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES (?,?,?,?)').run(id,req.user!.id,'Seller application review',`${status}; revision ${application.revision}${note?': '+note:''}`)
      await notify.run(id,'seller_verification',status==='approved'?'Your seller application is approved!':status==='needs_changes'?'Seller verification needs an update':'Seller application rejected',status==='approved'?'You can now open your seller dashboard.':status==='rejected'?'Your seller application was rejected.':note,'/seller/application',reviewedAt)
      if(status==='approved')await db.prepare('INSERT INTO seller_approval_emails(id,user_id,revision,next_attempt_at) VALUES (?,?,?,?) ON CONFLICT(user_id,revision) DO NOTHING').run(randomUUID(),id,application.revision,stamp())
    })()
    await deliverApprovalEmails(db)
    res.json({...await serialize(id),emailConfigured:isEmailConfigured()})
  }))
  app.post('/api/seller/application/resubmit',auth,express.json({limit:'10mb'}),reviewedRoute(async(req,res)=>{
    if (req.user!.role!=='customer') return res.status(409).json({error:'This account is not awaiting a seller application resubmission.'})
    const fullName=typeof req.body?.fullName==='string'?req.body.fullName.trim():req.user!.full_name
    if (!fullName || fullName.length>100) return res.status(400).json({error:'Enter your full name (up to 100 characters).'})
    const phone=verificationPhone(req.body?.phone),prepared=prepareVerificationPhotos(req.body||{})
    if(!phone)return res.status(400).json({error:'Enter a valid phone number with country code.'})
    if('error' in prepared)return res.status(400).json({error:prepared.error})
    const initial=await getApplication(req.user!.id)
    if(!initial||!['rejected','needs_changes'].includes(initial.status))return res.status(409).json({error:'This application is not awaiting a resubmission.'})
    const uploaded=await uploadVerificationPhotos(db,prepared.photos)
    try{
      await db.transaction(async()=>{
        const current=await getApplication(req.user!.id)
        if(!current||current.revision!==req.body?.revision||!['rejected','needs_changes'].includes(current.status))throw new ReviewError(409,'This application changed. Reload before resubmitting.')
        const previous=await db.prepare('SELECT id,kind,content_type,object_path FROM seller_verification_documents WHERE user_id=?').all(req.user!.id) as {id:string,kind:PhotoKind,content_type:string,object_path:string}[]
        await queuePhotoCleanup(db,previous.map(photo=>({id:photo.id,kind:photo.kind,contentType:photo.content_type,objectPath:photo.object_path})))
        await db.prepare('DELETE FROM seller_verification_documents WHERE user_id=?').run(req.user!.id)
        await insertApplicationPhotos(db,req.user!.id,uploaded)
        await db.prepare("UPDATE seller_applications SET status='pending',revision=revision+1,consented_at=?,submitted_at=?,reviewed_at=NULL,reviewed_by=NULL,review_note='' WHERE user_id=?").run(stamp(),stamp(),req.user!.id)
        await db.prepare("UPDATE users SET full_name=?,phone=?,seller_status='pending',role='customer' WHERE id=?").run(fullName,phone,req.user!.id)
        await db.prepare("UPDATE seller_profiles SET verification_status='pending' WHERE user_id=?").run(req.user!.id)
        await db.prepare("INSERT INTO notifications(user_id,type,title,body,link) SELECT id,'seller_verification','Seller application resubmitted','Review the updated verification photos and phone number.',? FROM users WHERE role='admin'").run(`/admin/users/${req.user!.id}`)
      })()
    }catch(error){await queuePhotoCleanup(db,uploaded);throw error}
    res.json(await serialize(req.user!.id))
  }))
  app.post('/api/admin/seller-applications/:id/email',auth,role('admin'),reviewedRoute(async(req,res)=>{
    const id=idValue(req.params.id),application=await getApplication(id)
    if(!application||application.status!=='approved')return res.status(409).json({error:'Approve the application before sending an approval email.'})
    if(!isEmailConfigured())return res.status(409).json({error:'Configure BREVO_API_KEY and EMAIL_FROM on the backend before sending approval email.'})
    const job=await db.prepare('SELECT status FROM seller_approval_emails WHERE user_id=? AND revision=?').get(id,application.revision) as {status:string}|undefined
    if(job?.status==='sent'||job?.status==='sending')return res.status(409).json({error:'The approval email was already sent or is currently sending.'})
    await db.prepare("UPDATE seller_approval_emails SET status='pending',attempts=0,next_attempt_at=?,last_error='' WHERE user_id=? AND revision=?").run(stamp(),id,application.revision)
    await deliverApprovalEmails(db);res.json({...await serialize(id),emailConfigured:isEmailConfigured()})
  }))
  app.delete('/api/admin/seller-applications/:id/documents',auth,role('admin'),reviewedRoute(async(req,res)=>{
    const id=idValue(req.params.id)
    await db.transaction(async()=>{
      const application=await getApplication(id)
      if(!application||!['approved','rejected'].includes(application.status))throw new ReviewError(409,'Complete the review before deleting verification photos.')
      const photos=await db.prepare('SELECT object_path FROM seller_verification_documents WHERE user_id=?').all(id) as {object_path:string}[]
      for(const photo of photos)await db.prepare('INSERT INTO verification_cleanup(object_path,created_at) VALUES (?,?) ON CONFLICT DO NOTHING').run(photo.object_path,stamp())
      await db.prepare('DELETE FROM seller_verification_documents WHERE user_id=?').run(id)
      await db.prepare('INSERT INTO account_admin_history(user_id,admin_id,action,details) VALUES (?,?,?,?)').run(id,req.user!.id,'Verification photos removed','Private verification photos removed after review; review history retained.')
    })()
    await cleanupVerificationPhotos(db);res.json({ok:true})
  }))
  const worker=async()=>{await deliverApprovalEmails(db);await cleanupVerificationPhotos(db)}
  let timer: ReturnType<typeof setInterval> | undefined
  if(process.env.SELLER_VERIFICATION_WORKER!=='disabled') { timer=setInterval(()=>{void worker().catch(()=>console.error('Seller verification background delivery will retry.'))},60000);timer.unref() }
  return ()=>{if(timer)clearInterval(timer)}
}
