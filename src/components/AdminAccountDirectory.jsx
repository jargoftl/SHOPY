import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, FolderOpen, Search, Store, Users } from 'lucide-react'

const AdminAccountDirectory = ({ users, sellers }) => {
  const [query, setQuery] = useState('')
  const [status,setStatus]=useState('active')
  const [role, setRole] = useState('all')
  const stores = useMemo(() => new Map(sellers.map((seller) => [seller.id, seller])), [sellers])
  const matching = users.filter((user) => {
    const seller = stores.get(user.id)
    return (status==='deleted'?Boolean(user.deletedAt):!user.deletedAt) && (role === 'all' || user.role === role) && [user.fullName, user.email, user.phone, String(user.publicId), seller?.storeName]
      .some((value) => value?.toLowerCase().includes(query.trim().toLowerCase()))
  })

  return <section className="mb-8 rounded-2xl border border-[#111111] bg-[#111111] p-5 sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#cccccc]">Account folders</p><h2 className="mt-2 text-2xl font-semibold">People & stores</h2><p className="mt-2 text-sm text-[#777777]">Open an account to see its profile, activity and available controls together.</p></div>
      <span className="rounded-full border border-[#111111] px-3 py-1 text-xs text-[#a3a3a3]">{matching.length} {matching.length === 1 ? 'account' : 'accounts'}</span>
    </div>
    <div className="mt-6 flex flex-col gap-3 sm:flex-row">
      <label className="relative flex-1"><span className="sr-only">Search accounts</span><Search size={17} className="absolute left-3 top-3.5 text-[#777777]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, email, ID or store" className="h-11 w-full rounded-lg border border-[#111111] bg-[#111111] pl-10 pr-3 text-sm text-white outline-none focus:border-[#cccccc]" /></label>
      <label><span className="sr-only">Filter account type</span><select value={role} onChange={(event) => setRole(event.target.value)} className="h-11 w-full rounded-lg border border-[#111111] bg-[#111111] px-3 text-sm sm:w-48"><option value="all">All accounts</option><option value="customer">Buyers</option><option value="seller">Sellers / store owners</option><option value="admin">Admins</option></select></label>
      <label><span className="sr-only">Account status filter</span><select aria-label="Account status filter" value={status} onChange={e=>setStatus(e.target.value)} className="h-11 w-full rounded-lg border px-3 text-sm"><option value="active">Active accounts</option><option value="deleted">Deleted accounts</option></select></label>
    </div>
    {matching.length ? ['customer', 'seller', 'admin'].map((group) => {
      const members = matching.filter((user) => user.role === group)
      if (!members.length) return null
      return <div key={group} className="mt-6"><h3 className="text-sm font-semibold text-[#e5e5e5]">{group === 'customer' ? 'Buyers' : group === 'seller' ? 'Sellers & store owners' : 'Administrators'} <span className="text-[#777777]">({members.length})</span></h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{members.map((user) => {
      const seller = stores.get(user.id)
      return <Link key={user.id} to={`/admin/users/${user.id}`} className="group rounded-xl border border-[#111111] bg-[#111111] p-5 transition hover:border-[#cccccc]/70 hover:bg-[#111111]">
        <div className="flex items-start justify-between gap-3"><span className="grid size-11 place-items-center rounded-xl bg-[#111111] text-[#cccccc]">{seller?.storeLogoUrl ? <img src={seller.storeLogoUrl} alt="" className="size-11 rounded-xl object-cover" /> : user.role === 'seller' ? <Store size={20} /> : <Users size={20} />}</span><ArrowUpRight size={18} className="text-[#555555] group-hover:text-[#cccccc]" /></div>
        <h3 className="mt-4 break-words font-semibold">{user.fullName}</h3>{user.deletedAt&&<p className="mt-1 text-xs text-red-700">Deleted · historical records only</p>}<p className="mt-1 break-all text-xs text-[#a3a3a3]">{user.email}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#111111] pt-3 text-xs"><span className="font-mono text-[#777777]">ID #{user.publicId}</span><span className={`rounded-full px-2.5 py-1 ${user.role === 'seller' ? 'bg-[#111111] text-[#e5e5e5]' : user.role === 'customer' ? 'bg-[#111111] text-[#cccccc]' : 'bg-[#111111] text-[#e5e5e5]'}`}>{user.role === 'customer' ? 'Buyer' : user.role === 'seller' ? 'Seller / store owner' : 'Admin'}</span></div>
        {seller?.storeName && <p className="mt-3 truncate text-xs text-[#a3a3a3]">{seller.storeName}</p>}
      </Link>
    })}</div></div>
    }) : <div className="py-12 text-center text-sm text-[#777777]"><FolderOpen size={24} className="mx-auto mb-3" />No accounts match your search.</div>}
  </section>
}

export default AdminAccountDirectory
