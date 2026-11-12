import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const ForgotPassword = () => {
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (event) => {
    event.preventDefault()
    const email = new FormData(event.currentTarget).get('email')
    setBusy(true)
    setMessage('')
    setSuccess(false)
    try {
      await apiRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) })
      setSuccess(true)
      setMessage('If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <div className="mb-7"><p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#c87800]">ACCOUNT RECOVERY</p><h1 className="text-4xl font-bold tracking-tight">Forgot password?</h1><p className="mt-2 text-sm text-[#686868]">Enter your account email and we’ll send you a reset link.</p></div>
    <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">Email address<input name="email" type="email" autoComplete="email" maxLength={254} required className="mt-2 h-12 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" /></label>
      {message && <p role={success ? 'status' : 'alert'} className={`text-sm ${success ? 'text-[#315941]' : 'text-[#a33]'}`}>{message}</p>}
      <button disabled={busy} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Sending…' : 'Send reset link'}</button>
    </form>
    <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold underline underline-offset-2">Back to login</Link></p>
  </AuthLayout>
}

export default ForgotPassword
