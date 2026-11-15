import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const Register = () => {
  const navigate = useNavigate()
  const [codeSent,setCodeSent]=useState(false)
  const [verificationCode,setVerificationCode]=useState('')
  const formRef=useRef(null)
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setMessage('')
    const form = event.currentTarget
    const formData = new FormData(form)

    if (formData.get('password') !== formData.get('confirmPassword')) {
      setMessage('Those passwords do not match yet.')
      return
    }

    setIsSubmitting(true)
    try {
      if(!codeSent){
        const verification=await apiRequest('/api/auth/registration-verification-code',{method:'POST',body:JSON.stringify({email:formData.get('email'),fullName:formData.get('fullName')})})
        if(verification.verificationRequired!==false){setCodeSent(true);setMessage('Enter the six-digit code sent to your email.');return}
      }else{
        await apiRequest('/api/auth/verify-registration-email-code',{method:'POST',body:JSON.stringify({email:formData.get('email'),code:verificationCode})})
      }
      const { emailNotifications } = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: formData.get('fullName'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          password: formData.get('password'),
        }),
      })
      navigate('/profile', { replace: true, state: { signupNotice: emailNotifications?.userEmailSent ? 'Account created. A confirmation email was sent.' : 'Your account is ready. Welcome!' } })
    } catch (error) {

      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#555555]">JOIN THE GOOD STUFF</p>
        <h1 className="text-4xl font-bold tracking-tight">Register</h1>
        <p className="mt-3 text-sm text-[#555555]">Your next favorite find starts here.</p>
      </div>
      <form ref={formRef} className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">Full name
          <input className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="text" name="fullName" autoComplete="name" maxLength={100} required placeholder="Enter your full name" />
        </label>
        <label className="block text-sm font-medium">Email
          <input className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="email" name="email" readOnly={codeSent} autoComplete="email" maxLength={254} required placeholder="Enter your email address" />
        </label>
        <label className="block text-sm font-medium">Phone number <span className="font-normal text-[#777]">(optional)</span>
          <input className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="tel" name="phone" autoComplete="tel" maxLength={30} placeholder="Enter your phone number" />
        </label>
        <label className="block text-sm font-medium">Password
          <input className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="password" name="password" autoComplete="new-password" minLength={8} required placeholder="Create a password" />
        </label>
        <label className="block text-sm font-medium">Confirm password
          <input className="mt-2 h-11 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required placeholder="Enter your password again" />
        </label>

        {codeSent&&<div className="auth-email-code"><p>Check your inbox for your six-digit verification code. It expires in 10 minutes.</p><label>Email verification code<input name="verificationCode" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={verificationCode} onChange={event=>setVerificationCode(event.target.value.replace(/[^0-9]/g,''))} className="mt-2 h-12 w-full border px-3"/></label><div className="mt-3 flex gap-4"><button type="button" disabled={isSubmitting} className="text-xs underline" onClick={async()=>{setIsSubmitting(true);setMessage('');try{await apiRequest('/api/auth/registration-verification-code',{method:'POST',body:JSON.stringify({email:new FormData(formRef.current).get('email'),fullName:new FormData(formRef.current).get('fullName')})});setMessage('A new code was sent.')}catch(error){setMessage(error.message)}finally{setIsSubmitting(false)}}}>Resend code</button><button type="button" className="text-xs underline" onClick={()=>{setCodeSent(false);setVerificationCode('');setMessage('')}}>Change email</button></div></div>}
        <button disabled={isSubmitting} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60" type="submit">{isSubmitting ? 'Please wait…' : codeSent ? 'Verify email & create account' : 'Create account'}</button>
      </form>
      {message && <p role="status" className="mt-3 text-sm text-[#555]">{message}</p>}
      <p className="mt-5 text-center text-sm text-[#666]">Already have an account? <Link to="/login" className="font-semibold text-black underline underline-offset-2">Log in</Link></p>
    </AuthLayout>
  )
}

export default Register
