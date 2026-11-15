import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const SellerLogin = () => {
  const navigate = useNavigate()
  const [message, setMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    let active = true
    apiRequest('/api/auth/me', { background: true })
      .then(({ user }) => {
        if (active && ['seller', 'admin'].includes(user.role)) navigate(user.role === 'admin' ? '/admin' : '/seller', { replace: true })
        else if (active && ['pending','rejected','needs_changes'].includes(user.sellerStatus)) navigate('/seller/application', {replace:true})
      })
      .catch((error) => { if (active && error.status !== 401) setMessage(error.message) })
      .finally(() => { if (active) setIsCheckingSession(false) })
    return () => { active = false }
  }, [navigate])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setIsSubmitting(true)
    setMessage('')

    try {
      const { user } = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password'), loginType: 'seller' }),
      })
      if (['pending','rejected','needs_changes'].includes(user.sellerStatus)) { navigate('/seller/application',{replace:true}); return }
      if (!['seller', 'admin'].includes(user.role)) {
        setMessage('This account is not a seller account. Create a seller account or use customer login.')
        return
      }
      navigate(user.role === 'admin' ? '/admin' : '/seller', { replace: true })
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      {isCheckingSession ? <p role="status" className="text-sm text-[#666]">Checking your account…</p> : <>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#c87800]">SELLER CENTER</p>
        <h1 className="text-4xl font-bold tracking-tight">Seller login</h1>
        <p className="mt-2 text-sm text-[#686868]">Sign in to continue to your seller workspace and profile.</p>
      </div>
      <ol className="mb-6 grid grid-cols-3 gap-2 text-center text-[10px] sm:text-xs">
        <li className="border border-black bg-black px-2 py-3 font-medium text-white">1 · Account</li>
        <li className="border border-[#ddd] px-2 py-3 text-[#777]">2 · Workspace</li>
        <li className="border border-[#ddd] px-2 py-3 text-[#777]">3 · Profile</li>
      </ol>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">Email address
          <input className="mt-2 h-12 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="email" name="email" autoComplete="email" required placeholder="you@example.com" />
        </label>
        <label className="block text-sm font-medium">Password
          <input className="mt-2 h-12 w-full border border-[#d9dce2] px-3 outline-none focus:border-black" type="password" name="password" autoComplete="current-password" required placeholder="Enter your password" />
        </label>
        <div className="text-right"><Link to="/forgot-password" className="text-sm font-medium underline underline-offset-2">Forgot password?</Link></div>
        {message && <p role="alert" className="text-sm text-[#a33]">{message}</p>}
        <button type="submit" disabled={isSubmitting} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60">{isSubmitting ? 'Signing in…' : 'Continue to workspace'}</button>
      </form>
      <p className="mt-6 text-center text-sm text-[#666]">New seller? <Link to="/seller/register" className="font-semibold text-black underline underline-offset-2">Create an account</Link></p>
      </>}
    </AuthLayout>
  )
}

export default SellerLogin
