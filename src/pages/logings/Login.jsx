import ContentPlaceholder from '../../components/ContentPlaceholder.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import AuthLayout from '../../components/AuthLayout.jsx'
import { apiRequest } from '../../lib/api.js'

const Login = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [message, setMessage] = useState(location.state?.sessionNotice || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCheckingSession, setIsCheckingSession] = useState(true)

  useEffect(() => {
    if(new URLSearchParams(location.search).get('switch')==='1'){setIsCheckingSession(false);return}
    let active = true
    apiRequest('/api/auth/me', { background: true })
      .then(({ user }) => {
        if (active) navigate(user.isSuperAdmin ? '/super-admin' : user.role === 'admin' ? '/admin' : user.role === 'seller' ? '/seller' : '/profile', { replace: true })
      })
      .catch((error) => { if (active && error.status !== 401) setMessage(error.message) })
      .finally(() => { if (active) setIsCheckingSession(false) })
    return () => { active = false }
  }, [navigate,location.search])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setIsSubmitting(true)
    setMessage('')
    const formData = new FormData(event.currentTarget)

    try {
      const { user } = await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: formData.get('email'), password: formData.get('password') }),
      })
      navigate(user.isSuperAdmin ? '/super-admin' : user.role === 'admin' ? '/admin' : user.role === 'seller' ? '/seller' : '/profile')
    } catch (error) {

      setMessage(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthLayout>
      {isCheckingSession ? <ContentPlaceholder/> : <>
      <div className="mb-7">
        <p className="mb-2 text-xs font-bold tracking-[0.14em] text-[#555555]">WELCOME BACK</p>
        <h1 className="text-4xl font-bold tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-[#686868]">Good to see you again.</p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <label className="block text-sm font-medium">Email address
          <input className="mt-2 block h-12 w-full border border-[#cccccc] px-3 outline-none focus:border-black" type="email" name="email" autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="block text-sm font-medium">Password
          <PasswordInput className="mt-2 block h-12 w-full border border-[#cccccc] px-3 outline-none focus:border-black"  name="password" autoComplete="current-password" placeholder="Enter your password" required />
        </label>
        <div className="text-right"><Link to="/forgot-password" className="text-sm font-medium underline underline-offset-2">Forgot password?</Link></div>

        {message && <p role="alert" className="text-sm text-[#a33]">{message}</p>}
        <button disabled={isSubmitting} className="h-12 w-full bg-black text-sm font-semibold text-white disabled:opacity-60" type="submit">{isSubmitting ? 'Signing in…' : 'Log in'}</button>
      </form>
      <p className="mt-7 text-center text-sm text-[#666]">New here? <Link to="/register" className="font-semibold text-black underline underline-offset-2">Create an account</Link></p>
      </>}
    </AuthLayout>
  )
}

export default Login
