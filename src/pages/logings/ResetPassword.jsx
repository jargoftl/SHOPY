import { useState } from 'react'
import { Link } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const ResetPassword = () => {
  const [token] = useState(() => window.location.hash.slice(1))
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const validToken = /^[a-f0-9]{64}$/.test(token)

  const submit = async (event) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    if (data.get('password') !== data.get('confirmPassword')) {
      setMessage('Those passwords do not match. Please try again.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password: data.get('password') }) })
      window.history.replaceState(window.history.state, '', window.location.pathname)
      setSuccess(true)
      setMessage('Your password has been updated. Please log in with your new password.')
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <AuthLayout>
    <div className="mb-7"><p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#555555]">ACCOUNT RECOVERY</p><h1 className="text-4xl font-bold tracking-tight">Choose a new password</h1><p className="mt-2 text-sm text-[#686868]">Use at least 8 characters (12 for admin accounts), up to 72 bytes.</p></div>
    {!validToken && !success ? <p role="alert" className="text-sm text-[#a33]">This reset link is invalid. <Link className="underline" to="/forgot-password">Request a new link</Link>.</p> : !success && <form onSubmit={submit} className="space-y-5">
      <label className="block text-sm font-medium">New password<input name="password" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-12 w-full border border-[#cccccc] px-3 outline-none focus:border-black" /></label>
      <label className="block text-sm font-medium">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={8} required className="mt-2 h-12 w-full border border-[#cccccc] px-3 outline-none focus:border-black" /></label>
      {message && <p role="alert" className="text-sm text-[#a33]">{message} <Link to="/forgot-password" className="underline">Request a new link</Link></p>}
      <button disabled={busy} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Updating…' : 'Update password'}</button>
    </form>}
    {success && <p role="status" className="text-sm text-[#111111]">{message}</p>}
    <p className="mt-6 text-center text-sm"><Link to="/login" className="font-semibold underline underline-offset-2">Back to login</Link></p>
  </AuthLayout>
}

export default ResetPassword
