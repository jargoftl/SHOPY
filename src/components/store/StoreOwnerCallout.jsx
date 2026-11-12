import SiteName from '../SiteName.jsx'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'

const StoreOwnerCallout = () => (
  <section className="relative isolate overflow-hidden bg-[#253b35] text-white">
    <img src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1800&q=85" alt="A curated storefront interior" loading="lazy" className="absolute inset-0 -z-20 size-full object-cover opacity-35" />
    <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#17251f]/90 via-[#17251f]/65 to-[#17251f]/25" />
    <div className="mx-auto flex max-w-[1440px] flex-col justify-between gap-6 px-5 py-12 sm:px-8 sm:py-16 md:flex-row md:items-end lg:px-12">
      <div className="max-w-2xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#e2b69a]">For independent sellers</p>
        <h2 className="mt-3 text-3xl font-semibold sm:text-4xl">Make a little room for your store.</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-white/80">Create a seller workspace, organize your products, and bring your shop to <SiteName />.</p>
      </div>
      <Link to="/seller/register" className="inline-flex min-h-12 items-center justify-center gap-3 self-start bg-white px-5 text-xs font-semibold uppercase tracking-wide text-black transition-colors hover:bg-[#ecece7] md:self-auto">
        Create your store <ArrowRight size={16} />
      </Link>
    </div>
  </section>
)

export default StoreOwnerCallout
