import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const Register = () => {
  const navigate = useNavigate()
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
      const { emailNotifications } = await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: formData.get('fullName'),
          email: formData.get('email'),
          phone: formData.get('phone'),
          password: formData.get('password'),
        }),
      })
      navigate('/profile', { replace: true, state: { signupNotice: emailNotifications?.userEmailSent ? 'Account created. A confirmation email was sent.' : 'Account created. Confirmation email could not be sent; SMTP may not be configured.' } })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      <div className="mb-5">
        <p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#c87800]">JOIN THE GOOD STUFF</p>
        <h1 className="text-4xl font-bold tracking-tight">Register</h1>
      </div>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">Full name
          <input className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="text" name="fullName" autoComplete="name" maxLength={100} required placeholder="Enter your full name" />
        </label>
        <label className="block text-sm font-medium">Email
          <input className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="email" name="email" autoComplete="email" maxLength={254} required placeholder="Enter your email address" />
        </label>
        <label className="block text-sm font-medium">Phone number <span className="font-normal text-[#777]">(optional)</span>
          <input className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="tel" name="phone" autoComplete="tel" maxLength={30} placeholder="Enter your phone number" />
        </label>
        <label className="block text-sm font-medium">Password
          <input className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="password" name="password" autoComplete="new-password" minLength={8} required placeholder="Create a password" />
        </label>
        <label className="block text-sm font-medium">Confirm password
          <input className="mt-2 h-11 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="password" name="confirmPassword" autoComplete="new-password" minLength={8} required placeholder="Enter your password again" />
        </label>
        <button disabled={isSubmitting} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60" type="submit">{isSubmitting ? 'Creating account…' : 'Create account'}</button>
      </form>
      {message && <p role="status" className="mt-3 text-sm text-[#555]">{message}</p>}
      <p className="mt-5 text-center text-sm text-[#666]">Already have an account? <Link to="/login" className="font-semibold text-black underline underline-offset-2">Log in</Link></p>
    </AuthLayout>
  )
}

export default Register
