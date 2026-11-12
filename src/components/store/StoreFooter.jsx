import { ArrowRight, Languages, MessageCircle, ShoppingBag } from 'lucide-react'
import { Link } from 'react-router-dom'
import SiteName from '../SiteName.jsx'

const currentYear = new Date().getFullYear()

const StoreFooter = ({ language, setLanguage, languages, text }) => (
  <footer className="bg-[#f8f8f5] pb-16 text-[#f5f3e8] md:pb-0">
    <div className="relative overflow-hidden">
      <svg aria-hidden="true" focusable="false" viewBox="0 0 1440 150" preserveAspectRatio="none" className="block h-16 w-full text-[#315445] sm:h-24 lg:h-32">
        <path fill="currentColor" d="M0 94 18 89 29 78 39 82 48 69 60 74 68 64 79 72 88 64 100 69 111 58 124 64 135 55 146 61 158 50 171 55 181 43 194 51 203 44 216 50 226 42 239 48 248 60 260 57 268 66 278 60 289 68 300 63 311 72 322 67 334 76 346 71 358 83 374 81 384 91 417 91 425 79 434 76 437 65 433 58 437 47 445 43 449 33 459 31 466 37 475 35 482 42 480 50 486 57 482 65 473 67 469 91 507 91 515 82 526 84 536 78 546 83 556 79 567 85 579 88 594 89 606 94 641 94 649 76 660 61 675 52 691 50 707 56 718 65 729 94 767 94 775 86 784 88 793 80 803 83 811 76 822 79 830 85 840 83 849 92 876 92 873 73 866 69 859 70 852 64 855 57 850 51 855 44 862 44 867 36 876 34 884 38 892 34 901 39 904 45 912 47 914 54 909 61 901 62 899 91 925 91 935 79 947 82 955 70 966 74 975 65 987 69 997 58 1008 63 1018 53 1030 58 1041 49 1054 54 1065 46 1079 51 1089 43 1102 49 1114 45 1126 52 1137 48 1149 57 1160 53 1171 62 1182 57 1194 67 1205 63 1216 72 1228 67 1238 77 1250 73 1261 81 1272 76 1283 84 1295 79 1306 87 1319 82 1331 90 1344 85 1356 93 1367 87 1380 95 1393 91 1405 99 1418 94 1430 102 1440 98 1440 150 0 150Z" />
        <path d="M650 94 660 63 676 53 693 51 708 58 719 94M676 53 668 94M693 51 687 94M707 58 698 69 712 75M660 75 674 67" fill="none" stroke="#c1d1bc" strokeOpacity=".55" strokeWidth="1.2" />
      </svg>

      <div className="bg-[#315445]">
        <div className="mx-auto grid max-w-[1240px] gap-10 px-6 pb-12 pt-5 sm:px-10 sm:pb-16 md:grid-cols-[1fr_1.7fr_1fr] md:gap-0 md:pt-8 lg:px-14">
          <nav aria-label="Footer navigation" className="flex flex-col items-start gap-3 text-sm font-semibold md:pr-10">
            <Link className="transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/">{text.nav[0]}</Link>
            <Link className="transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/products">{text.nav[2]}</Link>
            <Link className="transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/discounts">{text.nav[3]}</Link>
            <Link className="transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/seller/register">{text.nav[5]}</Link>
            <Link className="transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4" to="/profile">My profile</Link>
            <span className="mt-4 grid size-10 place-items-center rounded-full border border-[#d6e5d7]/70"><ShoppingBag size={18} strokeWidth={1.5} /></span>
          </nav>

          <section className="border-t border-[#a5bbae]/30 pt-9 text-left md:border-x md:border-t-0 md:px-10 md:pt-0 md:text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#c8dfc7]">A little something for every day</p>
            <h2 className="mt-3 font-[Fraunces] text-3xl font-medium sm:text-4xl">Find your next favorite</h2>
            <p className="mt-3 max-w-sm text-sm leading-6 text-[#e2eade] md:mx-auto">Thoughtful finds, independent stores, and fresh inspiration for your everyday.</p>
            <Link to="/products" className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-sm bg-[#f7f3e7] px-5 text-xs font-bold uppercase tracking-[0.08em] text-[#284438] transition-colors hover:bg-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
              Explore products <ArrowRight size={16} />
            </Link>
          </section>

          <section className="border-t border-[#a5bbae]/30 pt-9 md:border-t-0 md:pl-10 md:pt-0 md:text-right">
            <Link to="/messages" className="inline-flex items-center gap-2 text-sm font-semibold transition-colors hover:text-[#d4ebad] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Send us a message <ArrowRight size={17} /></Link>
            <p className="mt-5 text-sm leading-6 text-[#e2eade]">Have a question about your account or a store? We&apos;re here to help.</p>
            <p className="mt-2 text-xs leading-5 text-[#c4d5c6]">Sign in to reach the message center.</p>
            <div className="mt-6 inline-grid size-10 place-items-center rounded-full border border-[#d6e5d7]/70"><MessageCircle size={18} strokeWidth={1.5} /></div>
          </section>
        </div>
      </div>

      <div className="bg-[#294b3d]">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-4 px-6 py-5 text-xs text-[#d3dfd1] sm:px-10 lg:px-14">
          <p>© {currentYear} <SiteName />. {text.productNote}.</p>
          <label className="flex items-center gap-2">
            <Languages size={16} aria-hidden="true" />
            <span className="sr-only">Choose language</span>
            <select value={language} onChange={(event) => setLanguage(event.target.value)} className="max-w-40 bg-[#294b3d] py-1 text-xs text-[#f5f3e8] outline-offset-2">
              {languages.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
            </select>
          </label>
        </div>
      </div>
    </div>
  </footer>
)

export default StoreFooter
