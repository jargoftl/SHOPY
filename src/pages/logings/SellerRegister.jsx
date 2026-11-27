import CountrySelect from '../../components/CountrySelect.jsx'
import {readReferralCode,clearReferralCode} from '../../lib/referralCode.js'
import PasswordInput from '../../components/PasswordInput.jsx'
import SiteName from '../../components/SiteName.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ShieldCheck, Store, Sparkles, ClipboardCheck } from 'lucide-react'
import '../../styles/seller-signup.css'
import SellerAuthStory from '../../components/SellerAuthStory.jsx'
import VerificationPhotoFields from '../../components/VerificationPhotoFields.jsx'
import { apiRequest } from '../../lib/api.js'

const steps = ['Welcome', 'Your account', 'Your store', 'Verification']
const titles = ['Let’s build something yours.', 'First, a little about you.', 'Give your store its own identity.', 'One last step. Make it official.']
const descriptions = ['Your next chapter starts with a store. Here’s what to expect before you apply.', 'Add your contact details and create a secure account to manage your store.', 'Introduce your business with a name, a logo and a little of your story.', 'Share your location and identity photos so our support team can review your application.']
const initialForm = {
  fullName: '', email: '', password: '', confirmPassword: '', verificationCode: '',
  storeName: '', storeDescription: '', storeLogoUrl: '', country: 'United States', address: '', city: '', region: '', postalCode: '',
}

const SellerRegister = () => {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initialForm)
  const [existingAccount, setExistingAccount] = useState(null)
  const [codeSent, setCodeSent] = useState(false)
  const [referralCode,setReferralCode]=useState(readReferralCode)
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [hasStarted, setHasStarted] = useState(false)
  const headingRef = useRef(null)
  const visibleStep = hasStarted ? step + 1 : 0

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
    if (hasStarted) headingRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' })
  }, [step, hasStarted])
  const [verificationPhotos, setVerificationPhotos] = useState({id_front:null,id_back:null})
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
    let active = true
    apiRequest('/api/auth/me', {background:true}).then(({user}) => {
      if (!active) return
      if (['seller','admin'].includes(user.role)) { navigate(user.role==='admin'?'/admin':'/seller',{replace:true}); return }
      if (user.sellerStatus && user.sellerStatus!=='none') { navigate('/seller/application',{replace:true}); return }
      setExistingAccount(user);setForm(current=>({...current,fullName:user.fullName,email:user.email}))
    }).catch(()=>{})
    return()=>{active=false}
  }, [navigate])

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
      setForm((current) => ({ ...current, verificationCode: '' }))
    }
  }

  const continueFromAccount = async (event) => {
    event.preventDefault()
    setMessage('')
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
        if(!verification.sent)throw new Error('Email delivery is temporarily unavailable. Please try again later.')
        setCodeSent(true)
        setMessage('Enter the six-digit code sent to your email. After you submit your seller application, the support team will review it.')
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
    if (isReadingVerification) return
    if (!verificationConsent || Object.values(verificationPhotos).some(value=>!value)) { setMessage('Upload both ID photos and agree to private review.'); return }
    if (!acceptedTerms) {
      setMessage('Please agree to the seller terms to continue.')
      return
    }

    setIsSubmitting(true)
    setMessage('')
    try {
      const policy = await apiRequest('/api/seller/application-policy').catch(()=>null)
      if (!policy?.requiresAdminApproval || !policy?.requiresIdentityPhotos) throw new Error('Seller verification is being updated. Please refresh this page and try again shortly.')
      const { user } = await apiRequest(existingAccount ? '/api/seller/application' : '/api/auth/register-seller', {
        method: 'POST',
        body: JSON.stringify({
          referralCode,
          fullName: form.fullName,
          email: form.email,
          verificationPhotos, verificationConsent,
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
      clearReferralCode()
      navigate('/seller/application', { replace: true, state: { welcome: `Your application was submitted, ${user.fullName}. Your application is under review.` } })
    } catch (error) {

      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="seller-signup">
      <header className="signup-header">
        <Link to="/" className="signup-brand"><SiteName logo /></Link>
        <Link to="/seller/login" className="signup-login">Already a seller? <strong>Log in <ArrowRight size={15}/></strong></Link>
      </header>
      <main className="signup-layout">
        <SellerAuthStory/>
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
              {[[Store,'Make it yours','Create your account and tell us about your store.'],[ShieldCheck,'Verify your identity','Have the front and back of your government-issued ID ready.'],[ClipboardCheck,'Leave the review to us','Submit your application. Seller access opens after an support team approves it.']].map(([Icon,title,copy])=><div key={title}><span className="signup-check-icon"><Icon size={21} strokeWidth={1.6}/></span><section><h3>{title}</h3><p>{copy}</p></section></div>)}
            </div>
            <label className="signup-agreement"><input type="checkbox" checked={acceptedTerms} onChange={event=>setAcceptedTerms(event.target.checked)}/><span>I agree to provide accurate information belonging to me and submit my application for support team review. I understand I can start selling only after approval.</span></label>
            <button type="button" className="signup-primary" disabled={!acceptedTerms} onClick={()=>{setHasStarted(true);setMessage('')}}>Agree & start my application <ArrowRight size={18}/></button>
            <p className="signup-private-note"><ShieldCheck size={14}/> Your application is reviewed before your store goes live.</p>
          </div>}
      {hasStarted && step === 0 && (
        <form className="space-y-4" onSubmit={continueFromAccount}>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Full name
              <input name="fullName" value={form.fullName} onChange={updateForm} autoComplete="name" maxLength={100} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="Your legal full name" />
            </label>

          </div>
          <label className="block text-sm font-medium">Email address
            <input name="email" readOnly={Boolean(existingAccount)} value={form.email} onChange={updateForm} type="email" autoComplete="email" maxLength={254} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="you@example.com" />
          </label>
          {existingAccount && <p className="rounded-lg bg-[#f7f7f7] p-3 text-xs leading-6 text-[#555555]">You’re applying with your signed-in account. Your current password and purchases stay the same.</p>}
          {!existingAccount && <>          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">Password
              <PasswordInput name="password" value={form.password} onChange={updateForm}  autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="Create password" />
            </label>
            <label className="block text-sm font-medium">Confirm password
              <PasswordInput name="confirmPassword" value={form.confirmPassword} onChange={updateForm}  autoComplete="new-password" minLength={8} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="Type again" />
            </label>
          </div>
          </>}

          {!existingAccount&&<label className="block text-sm font-medium">Referral code<input value={referralCode} onChange={e=>setReferralCode(e.target.value.trim().toUpperCase())} maxLength={16} autoComplete="off" className="mt-2 h-11 w-full rounded-lg border px-3 font-mono" placeholder="Seller referral code"/></label>}
          <p className="text-xs text-gray-500">You’ll set your wallet PIN when you are ready to make a deposit or withdrawal.</p>
          {codeSent && <label className="block text-sm font-medium">Email verification code
            <input name="verificationCode" value={form.verificationCode} onChange={event=>setForm(current=>({...current,verificationCode:event.target.value.replace(/\D/g,'').slice(0,6)}))} type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="6-digit email code" />
          </label>}
          {codeSent && <button type="button" disabled={isSendingCode} className="text-xs underline underline-offset-4" onClick={async()=>{setIsSendingCode(true);setMessage('');try{const result=await apiRequest('/api/auth/seller-verification-code',{method:'POST',body:JSON.stringify({email:form.email.trim(),fullName:form.fullName.trim()})});setForm(current=>({...current,verificationCode:''}));setMessage(result.sent?'A new verification code was sent.':'Please continue with the current registration settings.')}catch(error){setMessage(error.message)}finally{setIsSendingCode(false)}}}>Resend email code</button>}
          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <button type="submit" disabled={isSendingCode} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{isSendingCode ? 'Please wait…' : codeSent ? 'Verify email & continue' : 'Continue to workspace'}</button>
        </form>
      )}

      {hasStarted && step === 1 && (
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); if (isReadingLogo) return; setMessage(''); setStep(2) }}>
          <p className="text-sm leading-6 text-[#666]">Set the public details for your seller workspace. You can edit these later.</p>
          <label className="block text-sm font-medium">Store or workspace name
            <input name="storeName" value={form.storeName} onChange={updateForm} maxLength={100} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="Your shop name" />
          </label>
          <div className="space-y-3">
            <label className="block text-sm font-medium">Shop logo <span className="font-normal text-[#777]"></span>
              <input ref={logoInput} name="storeLogoFile" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseLogo} aria-describedby="store-logo-help" className="mt-2 block w-full border border-[#cccccc] p-2 text-xs file:mr-3 file:border-0 file:bg-[#f7f7f7] file:px-3 file:py-2 file:text-xs file:font-medium" />
            </label>
            <p id="store-logo-help" className="text-xs text-[#777]">Choose a PNG, JPEG or WebP image up to 2 MB.</p>
            {isReadingLogo && <p role="status" className="text-xs text-[#777]">Preparing logo…</p>}
            {(logoUpload || form.storeLogoUrl) && <div className="flex items-center gap-3">
              <img src={logoUpload ? `data:${logoUpload.type};base64,${logoUpload.data}` : form.storeLogoUrl} alt="Store logo preview" className="size-16 rounded-full border border-[#e4e4e4] bg-white object-cover" />
              {logoUpload && <div className="min-w-0"><p className="truncate text-xs text-[#666]">{logoUpload.name}</p><button type="button" onClick={clearLogoUpload} className="mt-1 text-xs underline underline-offset-2">Remove logo</button></div>}
            </div>}
            <label className="block text-xs font-medium text-[#777]">Or use a logo URL
              <input name="storeLogoUrl" value={form.storeLogoUrl} onChange={updateForm} type="url" maxLength={2000} className="mt-2 h-11 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" placeholder="https://example.com/your-logo.jpg" />
            </label>
          </div>
          <label className="block text-sm font-medium">About your store
            <textarea name="storeDescription" value={form.storeDescription} onChange={updateForm} maxLength={500} rows={4} className="mt-2 w-full border border-[#cccccc] px-3 py-2 outline-none focus:border-black" placeholder="What will you sell?" />
          </label>
          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setStep(0)} className="h-12 border border-[#ccc] text-sm">Back</button><button type="submit" disabled={isReadingLogo} className="h-12 bg-black text-sm font-semibold text-white disabled:opacity-60">Continue to verification</button></div>
        </form>
      )}

      {hasStarted && step === 2 && (
        <form className="space-y-4" onSubmit={finishRegistration}>
          <p className="text-sm leading-6 text-[#666]">Add your contact location and verification photos. Your support team must approve your application before seller access is enabled.</p>
          <div className="block text-sm font-medium">Country
            <CountrySelect name="country" value={form.country} onChange={updateForm} required/>
          </div>
          <label className="block text-sm font-medium">Home or business address
            <input name="address" value={form.address} onChange={updateForm} maxLength={200} required autoComplete="street-address" className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" placeholder="Street address" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm font-medium">City
              <input name="city" value={form.city} onChange={updateForm} maxLength={100} required autoComplete="address-level2" className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" />
            </label>
            <label className="block text-sm font-medium">State / region
              <input name="region" value={form.region} onChange={updateForm} maxLength={100} required autoComplete="address-level1" className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" />
            </label>
          </div>
          <label className="block text-sm font-medium">Postal code
            <input name="postalCode" value={form.postalCode} onChange={updateForm} maxLength={20} required autoComplete="postal-code" className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" />
          </label>

          <div className="signup-section-label"><ShieldCheck size={16}/> YOUR PRIVATE VERIFICATION</div>
          <VerificationPhotoFields photos={verificationPhotos} setPhotos={setVerificationPhotos} consent={verificationConsent} setConsent={setVerificationConsent} onError={setMessage} onBusyChange={setIsReadingVerification} />

          <label className="flex items-start gap-2 text-xs leading-5 text-[#555]">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-1 accent-black" />
            I confirm all information and photos in this application belong to me and are accurate. I understand seller access begins only after support team approval.
          </label>

          {message && <p role="status" className="text-sm text-[#a33]">{message}</p>}
          <div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setStep(1)} className="h-12 border border-[#ccc] text-sm">Back</button><button type="submit" disabled={isSubmitting || isReadingLogo || isReadingVerification} className="h-12 bg-black text-sm font-semibold text-white disabled:opacity-60">{isSubmitting ? 'Submitting…' : 'Submit for review'}</button></div>
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
