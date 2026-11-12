import SiteName from './SiteName.jsx'
import { Link } from 'react-router-dom'

const AuthLayout = ({ children }) => (
  <div className="min-h-screen bg-white text-[#171717]">
    <header className="border-b border-[#ededed]">
      <div className="mx-auto flex h-[82px] max-w-[1180px] items-center justify-between px-5 md:px-8">
        <Link to="/" className="text-[27px] font-black tracking-[-0.06em]">
          <SiteName /><span className="ml-1 text-[#f1a900]">▰</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link to="/login" className="hover:underline">Log in</Link>
          <span className="text-[#999]">or</span>
          <Link to="/register" className="font-semibold hover:underline">Register</Link>
          <span className="ml-4" aria-hidden="true">🇺🇸</span>
        </nav>
      </div>
    </header>

    <main className="mx-auto max-w-[1040px] px-4 py-8 md:px-8 md:py-10">
      <div className="grid overflow-hidden border border-[#ededed] bg-white p-3 md:grid-cols-2 md:gap-5 md:p-5">
        <aside className="relative hidden min-h-[560px] overflow-hidden bg-[#f7be45] md:block">
          <img
            className="absolute inset-0 size-full object-cover mix-blend-multiply opacity-75"
            src="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1100&q=85"
            alt="A customer paying for a purchase in a shop"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#a9580b]/65 via-[#e99919]/10 to-transparent" />
          <div className="absolute bottom-8 left-8 right-8 text-white">
            <p className="text-xs font-bold tracking-[0.18em]">THINGS THAT MAKE YOU GO</p>
            <p className="mt-2 text-5xl font-black tracking-tight">“Ooh, nice.”</p>
          </div>
        </aside>
        <section className="flex min-h-[560px] flex-col justify-center px-2 py-7 sm:px-5 md:px-3 lg:px-7">
          {children}
        </section>
      </div>
    </main>
  </div>
)

export default AuthLayout