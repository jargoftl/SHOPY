import SiteName from '../../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Store, Sparkles, ClipboardCheck } from 'lucide-react'
import '../../styles/seller-signup.css'
import OptionalSellerSsn, { sellerSsnSuffix } from '../../components/OptionalSellerSsn.jsx'
import VerificationPhotoFields from '../../components/VerificationPhotoFields.jsx'
import { apiRequest } from '../../lib/api.js'

const steps = ['Welcome', 'Your account', 'Your store', 'Verification']
const titles = ['Let’s build something yours.', 'First, a little about you.', 'Give your store its own identity.', 'One last step. Make it official.']
const descriptions = ['Your next chapter starts with a store. Here’s what to expect before you apply.', 'Add your contact details and create a secure account to manage your store.', 'Introduce your business with a name, a logo and a little of your story.', 'Share your location and identity photos so our administrators can review your application.']
const initialForm = {
  fullName: '', email: '', phone: '', password: '', confirmPassword: '', verificationCode: '',
  storeName: '', storeDescription: '', storeLogoUrl: '', country: '', address: '', city: '', region: '', postalCode: '',
}

const SellerRegister = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const previewStep = new URLSearchParams(location.search).get('preview')
  const isPreviewMode = import.meta.env.DEV && ['workspace', 'profile'].includes(previewStep)
  const [step, setStep] = useState(() => previewStep === 'profile' ? 2 : previewStep === 'workspace' ? 1 : 0)
  const [form, setForm] = useState(initialForm)
  const [existingAccount, setExistingAccount] = useState(null)
  const [codeSent, setCodeSent] = useState(false)
  const [developmentCode, setDevelopmentCode] = useState('')
  const [optionalSsn, setOptionalSsn] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [hasStarted, setHasStarted] = useState(isPreviewMode)
  const headingRef = useRef(null)
  const visibleStep = hasStarted ? step + 1 : 0

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    if (hasStarted) headingRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [step, hasStarted])
  const [verificationPhotos, setVerificationPhotos] = useState({selfie:null,id_front:null,id_back:null})
  const [verificationConsent, setVerificationConsent] = useState(false)
  const [isReadingVerification, setIsReadingVerification] = useState(false)
  const [message, setMessage] = useState('')
  const [isSendingCode, setIsSendingCode] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [logoUpload, setLogoUpload] = useState(null)
  const [isReadingLogo, setIsReadingLogo] = useState(false)
  const logoInput = useRef(null)
  const logoReadVersion = useRef(0)

  useEffect(() => {
    if (isPreviewMode) return
    let active = true
    apiRequest('/api/auth/me', {background:true}).then(({user}) => {
      if (!active) return
      if (['seller','admin'].includes(user.role)) { navigate(user.role==='admin'?'/admin':'/seller',{replace:true}); return }
      if (user.sellerStatus && user.sellerStatus!=='none') { navigate('/seller/application',{replace:true}); return }
      setExistingAccount(user);setForm(current=>({...current,fullName:user.fullName,email:user.email,phone:user.phone||''}))
    }).catch(()=>{})
    return()=>{active=false}
  }, [isPreviewMode,navigate])

  const clearLogoUpload = () => {
    logoReadVersion.current += 1
    setLogoUpload(null)
    setIsReadingLogo(false)
    if (logoInput.current) logoInput.current.value = ''
  }

  const chooseLogo = (event) => {
    const file = event.target.files?.[0]
    logoReadVersion.current += 1
    setLogoUpload(null)
    setIsReadingLogo(false)
    setMessage('')
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
      if (logoInput.current) logoInput.current.value = ''
      setMessage('Choose a PNG, JPEG or WebP logo up to 2 MB.')
      return
    }
    const version = logoReadVersion.current
    setIsReadingLogo(true)
    const reader = new FileReader()
    reader.onload = () => {
      if (version !== logoReadVersion.current) return
      const result = typeof reader.result === 'string' ? reader.result : ''
      const data = result.split(',')[1]
      if (!data) setMessage('This logo could not be read. Please choose it again.')
      else {
        setLogoUpload({ type: file.type, data, name: file.name })
        setForm((current) => ({ ...current, storeLogoUrl: '' }))
      }
      setIsReadingLogo(false)
    }
    reader.onerror = () => {
      if (version !== logoReadVersion.current) return
      setIsReadingLogo(false)
      setMessage('This logo could not be read. Please choose it again.')
    }
    reader.readAsDataURL(file)
  }

  const updateForm = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    if (name === 'country') setOptionalSsn('')
    if (name === 'storeLogoUrl') clearLogoUpload()
    if (name === 'email') {
      setCodeSent(false)
      setDevelopmentCode('')
      setForm((current) => ({ ...current, verificationCode: '' }))
    }
  }

  const continueFromAccount = async (event) => {
    event.preventDefault()
    setMessage('')
    if (!/^\+?[1-9]\d{6,14}$/.test(form.phone.replace(/[\s()-]/g, ''))) { setMessage('Enter a valid phone number with country code (7–15 digits).'); return }
    if (!existingAccount && form.password !== form.confirmPassword) {
      setMessage('Those passwords do not match.')
      return
    }

    if (!codeSent) {
      setIsSendingCode(true)
      try {
        const verification = await apiRequest('/api/auth/seller-verification-code', {
          method: 'POST',
          body: JSON.stringify({ email: form.email.trim(), fullName: form.fullName.trim() }),
        })
        if (verification.verificationRequired === false) {
          setStep(1)
          return
        }
        setCodeSent(true)
        if (verification.developmentCode) {
          setDevelopmentCode(verification.developmentCode)
          setForm((current) => ({ ...current, verificationCode: verification.developmentCode }))
          setMessage('SMTP is not configured. Use the local development code below to continue.')
        } else {
          setMessage('A verification code was sent to your email. Enter it here to continue.')
        }
      } catch (error) {
        setMessage(error.message)
      } finally {
        setIsSendingCode(false)
      }
      return
    }

    if (form.verificationCode.trim().length !== 6) {
      setMessage('Enter the six-digit code from your email to continue.')
      return
    }

    setIsSendingCode(true)
    try {
      const verification = await apiRequest('/api/auth/verify-seller-email-code', {
        method: 'POST',
        body: JSON.stringify({ email: form.email.trim(), code: form.verificationCode.trim() }),
      })
      setMessage(verification.verified ? 'Email verified.' : '')
      setStep(1)
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSendingCode(false)
    }
  }

  const finishRegistration = async (event) => {
    event.preventDefault()
    if (isPreviewMode) {
      setMessage('Preview only. Return to the registration flow to create a seller account.')
      return
    }
    if (isReadingVerification) return
    if (form.country === 'United States' && optionalSsn && !sellerSsnSuffix(optionalSsn)) { setMessage('Enter nine digits for the optional SSN, or leave it blank.'); return }
    if (!verificationConsent || Object.values(verificationPhotos).some(value=>!value)) { setMessage('Upload all three verification photos and agree to private review.'); return }
    if (!acceptedTerms) {
      setMessage('Please agree to the seller terms to continue.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const policy = await apiRequest('/api/seller/application-policy').catch(()=>null)
      if (!policy?.requiresAdminApproval || !policy?.requiresIdentityPhotos) throw new Error('Seller verification is being updated. Please refresh this page and try again shortly.')
      if (optionalSsn && !policy.optionalSsnLast4) throw new Error('The optional SSN reference is being updated. Refresh shortly, or clear this optional field to continue.')
      const { user } = await apiRequest(existingAccount ? '/api/seller/application' : '/api/auth/register-seller', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          verificationPhotos, verificationConsent,
          ssnLast4: form.country === 'United States' ? sellerSsnSuffix(optionalSsn) : null,
          password: form.password,
          storeName: form.storeName,
          storeDescription: form.storeDescription,
          storeLogoUrl: form.storeLogoUrl,
          ...(logoUpload ? { storeLogoUpload: { type: logoUpload.type, data: logoUpload.data } } : {}),
          country: form.country,
          address: form.address,
          city: form.city,
          region: form.region,
          postalCode: form.postalCode,
        }),
      })

      setOptionalSsn('')
      navigate('/seller/application', { replace: true, state: { welcome: `Your application was submitted, ${user.fullName}. Seller access is pending administrator approval.` } })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="seller-signup">
      <header className="signup-header">
        <Link to="/" className="signup-brand"><SiteName /><span aria-hidden="true">✳</span></Link>
        <Link to="/seller/login" className="signup-login">Already a seller? <strong>Log in <ArrowRight size={15}/></strong></Link>
      </header>
      <main className="signup-layout">
        <aside className="signup-story">
          <span className="signup-eyebrow"><span/> THE SELLER COLLECTIVE</span>
          <h2>A little ambition. <br/>A store of <em>your own.</em></h2>
          <p>Bring your products, your perspective and your story. We’ll give them a place to call home.</p>
          <div className="signup-store-art" aria-hidden="true">
            <div className="signup-art-orbit"/>
            <span className="signup-art-spark">✳</span>
            <div className="signup-mini-store"><div className="signup-awning">{Array.from({length:6},(_,i)=><i key={i}/>)}</div><div className="signup-store-window"><Store size={38} strokeWidth={1.2}/><span>YOUR NEXT CHAPTER</span><strong>Your store.</strong></div><div className="signup-store-door"/></div>
            <div className="signup-art-label"><ShieldCheck size={20}/><span>Real people.<strong>Thoughtfully reviewed stores.</strong></span></div>
          </div>
          <div className="signup-story-bottom"><ShieldCheck size={20}/><p>Your identity photos stay private.<br/><strong>Only you and administrators can view them.</strong></p></div>
        </aside>
        <section className="signup-panel" aria-labelledby="signup-title">
          <ol className="signup-progress" aria-label="Seller signup progress">
            {steps.map((label,index)=><li key={label} aria-current={visibleStep===index?'step':undefined} className={visibleStep===index?'current':visibleStep>index?'complete':''}><span>{visibleStep>index?<Check size={14}/>:index+1}</span><small>{label}</small></li>)}
          </ol>
          <div className="signup-heading">
            <span className="signup-eyebrow">STEP {String(visibleStep+1).padStart(2,'0')} / 04</span>
            <h1 id="signup-title" ref={headingRef} tabIndex={-1}>{titles[visibleStep]}</h1>
            <p>{descriptions[visibleStep]}</p>
          </div>
          {!hasStarted && <div className="signup-welcome">
            <div className="signup-welcome-note"><Sparkles size={20}/><span>A considered start for your business</span></div>
            <div className="signup-checklist">
              {[[Store,'Make it yours','Create your account and tell us about your store.'],[ShieldCheck,'Verify your identity','Have your phone number, a selfie and the front and back of your government-issued ID ready.'],[ClipboardCheck,'Leave the review to us','Submit your application. Seller access opens after an administrator approves it.']].map(([Icon,title,copy])=><div key={title}><span className="signup-check-icon"><Icon size={21} strokeWidth={1.6}/></span><section><h3>{title}</h3><p>{copy}</p></section></div>)}
            </div>
            <label className="signup-agreement"><input type="checkbox" checked={acceptedTerms} onChange={event=>setAcceptedTerms(event.target.checked)}/><span>I agree to provide accurate information belonging to me and submit my application for administrator review. I understand I can start selling only after approval.</span></label>
            <button type="button" className="signup-primary" disabled={!acceptedTerms} onClick={()=>{setHasStarted(true);setMessage('')}}>Agree & start my application <ArrowRight size={18}/></button>
            <p className="signup-private-note"><ShieldCheck size={14}/> Your application is reviewed before your store goes live.</p>
          </div>}
      {import.meta.env.DEV && (
        <nav className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#eee] pb-4 text-xs" aria-label="Seller form previews">
          <span className="font-semibold text-[#666]">Preview:</span>
          <Link to="/seller/register?preview=workspace" onClick={() => { setStep(1); setMessage('') }} className="underline underline-offset-4">02 Workspace</Link>
          <Link to="/seller/register?preview=profile" onClick={() => { setStep(2); setMessage('') }} className="underline underline-offset-4">03 Profile</Link>
          {isPreviewMode && <Link to="/seller/register" onClick={() => { setStep(0); setMessage('') }} className="underline underline-offset-4">Exit preview</Link>}
        </nav>
      )}

      {hasStarted && step === 0 && (
        <form className="space-y-4" onSubmit={continueFromAccount}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Full name
              <input name="fullName" value={form.fullName} onChange={updateForm} autoComplete="name" maxLength={100} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="Your legal full name" />
            </label>
            <label className="block text-sm font-medium">Phone
              <input name="phone" value={form.phone} onChange={updateForm} type="tel" autoComplete="tel" maxLength={30} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="+234 801 234 5678" />
            </label>
          </div>
          <label className="block text-sm font-medium">Email address
            <input name="email" readOnly={Boolean(existingAccount)} value={form.email} onChange={updateForm} type="email" autoComplete="email" maxLength={254} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="you@example.com" />
          </label>
          {existingAccount && <p className="rounded-lg bg-[#edf3e7] p-3 text-xs leading-6 text-[#5e7850]">You’re applying with your signed-in account. Your current password and purchases stay the same.</p>}
          {!existingAccount && <>          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Password
              <input name="password" value={form.password} onChange={updateForm} type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="Create password" />
            </label>
            <label className="block text-sm font-medium">Confirm password
              <input name="confirmPassword" value={form.confirmPassword} onChange={updateForm} type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="Type again" />
            </label>
          </div>
          </>}
          {codeSent && <label className="block text-sm font-medium">Email verification code
            <input name="verificationCode" value={form.verificationCode} onChange={updateForm} type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="6-digit email code" />
          </label>}
          {developmentCode && <div role="status" className="border border-[#eadfc7] bg-[#fff9eb] px-4 py-3">
            <p className="text-xs font-semibold text-[#71521e]">Local development code</p>
            <p className="mt-1 font-mono text-lg tracking-[0.12em] text-[#20231f]">{developmentCode}</p>
            <p className="mt-1 text-[10px] text-[#71521e]">Shown only in local development. It expires in 10 minutes.</p>
          </div>}
          {codeSent && <p className="text-[11px] leading-5 text-[#777]">Enter the code sent to your email. It expires after 10 minutes.</p>}
          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <button type="submit" disabled={isSendingCode} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{isSendingCode ? 'Please wait…' : codeSent ? 'Verify email & continue' : 'Continue to workspace'}</button>
        </form>
      )}

      {hasStarted && step === 1 && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (isReadingLogo) return; setMessage(''); setStep(2) }}>
          <p className="text-sm leading-6 text-[#666]">Set the public details for your seller workspace. You can edit these later.</p>
          <label className="block text-sm font-medium">Store or workspace name
            <input name="storeName" value={form.storeName} onChange={updateForm} maxLength={100} required className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="Your shop name" />
          </label>
          <div className="space-y-3">
            <label className="block text-sm font-medium">Shop logo <span className="font-normal text-[#777]">(optional)</span>
              <input ref={logoInput} name="storeLogoFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} aria-describedby="store-logo-help" className="mt-2 block w-full border border-[#d9dce2] p-2 text-xs file:mr-3 file:border-0 file:bg-[#f3f4f1] file:px-3 file:py-2 file:text-xs file:font-medium" />
            </label>
            <p id="store-logo-help" className="text-xs text-[#777]">Choose a PNG, JPEG or WebP image up to 2 MB.</p>
            {isReadingLogo && <p role="status" className="text-xs text-[#777]">Preparing logo…</p>}
            {(logoUpload || form.storeLogoUrl) && <div className="flex items-center gap-3">
              <img src={logoUpload ? `data:${logoUpload.type};base64,${logoUpload.data}` : form.storeLogoUrl} alt="Store logo preview" className="size-16 rounded-full border border-[#e4e4e4] bg-white object-cover" />
              {logoUpload && <div className="min-w-0"><p className="truncate text-xs text-[#666]">{logoUpload.name}</p><button type="button" onClick={clearLogoUpload} className="mt-1 text-xs underline underline-offset-2">Remove logo</button></div>}
            </div>}
            <label className="block text-xs font-medium text-[#777]">Or use a logo URL
              <input name="storeLogoUrl" value={form.storeLogoUrl} onChange={updateForm} type="url" maxLength={2000} className="mt-2 h-11 w-full border border-[#d9dce2] px-3 text-sm outline-none focus:border-black" placeholder="https://example.com/your-logo.jpg" />
            </label>
          </div>
          <label className="block text-sm font-medium">About your store
            <textarea name="storeDescription" value={form.storeDescription} onChange={updateForm} maxLength={500} rows={4} className="mt-2 w-full border border-[#d9dce2] px-3 py-2 outline-none focus:border-black" placeholder="What will you sell?" />
          </label>
          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setStep(0)} className="h-12 border border-[#ccc] text-sm">Back</button><button type="submit" disabled={isReadingLogo} className="h-12 bg-black text-sm font-semibold text-white disabled:opacity-60">Continue to verification</button></div>
        </form>
      )}

      {hasStarted && step === 2 && (
        <form className="space-y-4" onSubmit={finishRegistration}>
          <p className="text-sm leading-6 text-[#666]">Add your contact location and verification photos. Your administrator must approve your application before seller access is enabled.</p>
          <label className="block text-sm font-medium">Country
            <select name="country" value={form.country} onChange={updateForm} required className="mt-2 h-11 w-full border border-[#d9dce2] bg-white px-3 outline-none focus:border-black">
              <option value="">Select country</option><option>United States</option><option>Canada</option><option>United Kingdom</option><option>Nigeria</option><option>Germany</option><option>Japan</option><option>Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium">Home or business address
            <input name="address" value={form.address} onChange={updateForm} maxLength={200} required autoComplete="street-address" className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" placeholder="Street address" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">City
              <input name="city" value={form.city} onChange={updateForm} maxLength={100} required autoComplete="address-level2" className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" />
            </label>
            <label className="block text-sm font-medium">State / region
              <input name="region" value={form.region} onChange={updateForm} maxLength={100} required autoComplete="address-level1" className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" />
            </label>
          </div>
          <label className="block text-sm font-medium">Postal code
            <input name="postalCode" value={form.postalCode} onChange={updateForm} maxLength={20} required autoComplete="postal-code" className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" />
          </label>

          {form.country === 'United States' && <OptionalSellerSsn value={optionalSsn} onChange={setOptionalSsn}/>}
          <div className="signup-section-label"><ShieldCheck size={16}/> YOUR PRIVATE VERIFICATION</div>
          <VerificationPhotoFields photos={verificationPhotos} setPhotos={setVerificationPhotos} consent={verificationConsent} setConsent={setVerificationConsent} onError={setMessage} onBusyChange={setIsReadingVerification} />

          <label className="flex items-start gap-2 text-xs leading-5 text-[#555]">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 accent-black" />
            I confirm all information and photos in this application belong to me and are accurate. I understand seller access begins only after administrator approval.
          </label>
          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setStep(1)} className="h-12 border border-[#ccc] text-sm">Back</button><button type="submit" disabled={isSubmitting || isReadingLogo || isReadingVerification} className="h-12 bg-black text-sm font-semibold text-white disabled:opacity-60">{isSubmitting ? 'Submitting…' : 'Submit for admin review'}</button></div>
        </form>
      )}

      {hasStarted && step===0 && <button type="button" className="signup-return" disabled={isSubmitting || isSendingCode} onClick={()=>{setMessage('');if(step===0)setHasStarted(false);else setStep(step-1)}}><ArrowLeft size={14}/> {step===0?'Back to introduction':'Previous step'}</button>}
      <p className="mt-5 text-center text-sm text-[#666]">Already have a seller account? <Link to="/seller/login" className="font-semibold text-black underline underline-offset-2">Log in</Link></p>
        </section>
      </main>
      <footer className="signup-footer">A place for independent stores. A thoughtful start for yours.</footer>
    </div>
  )
}

export default SellerRegister
