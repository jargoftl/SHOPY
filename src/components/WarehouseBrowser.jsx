import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import WarehousePublishModal from './WarehousePublishModal.jsx'
import { ChevronLeft, ChevronRight, Package, Search, X } from 'lucide-react'
import { apiRequest } from '../lib/api.js'

const money = (value) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))

export default function WarehouseBrowser({ dark = false, reloadKey = 0, onAdd, onEdit, onRemove, onCategoryChange, onSelect, onPublished }) {
  const publishedProduct=useRef(null)
  const [publishingProduct,setPublishingProduct]=useState(null)
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ products: [], categories: [], total: 0, pageSize: 24 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null)
  const [detail, setDetail] = useState(null)
  const [skuPage, setSkuPage] = useState(1)
  const [refresh, setRefresh] = useState(0)
  useEffect(() => { const timer = setTimeout(() => { setQuery(search); setPage(1) }, 300); return () => clearTimeout(timer) }, [search])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    apiRequest(`/api/warehouse?${new URLSearchParams({ page: String(page), q: query, category })}`)
      .then((result) => { if (active) setData(result) })
      .catch((failure) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, query, category, reloadKey, refresh])
  useEffect(() => {
    if (!detail) return
    const close = (event) => { if (event.key === 'Escape') setDetail(null) }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [detail])
  useEffect(() => {
    if (data.catalogImport?.complete !== false) return
    const timer = setTimeout(() => setRefresh((value) => value + 1), 30000)
    return () => clearTimeout(timer)
  }, [data])
  const browse = (value) => { setCategory(value); setPage(1); onCategoryChange?.(value) }
  const action = async (callback, product, reload = false) => {
    setBusy(product.id); setError('')
    try { await callback(product); if (reload) setRefresh((value) => value + 1) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(null) }
  }
  const inspect = async (product) => {
    setBusy(product.id)
    try { const result = await apiRequest(`/api/warehouse/${product.id}`); setSkuPage(1); setDetail(result.product) }
    catch (failure) { setError(failure.message) }
    finally { setBusy(null) }
  }
  const groups = [...new Set(data.categories.map((entry) => entry.category.split(' / ')[0]))]
  const parent = category.split(' / ')[0]
  const children = data.categories.filter((entry) => entry.category.startsWith(`${parent} / `))
  const panel = dark ? 'border-[#3b5140] bg-[#07120b] text-white' : 'border-[#dce4da] bg-white text-[#20231f]'
  const muted = dark ? 'text-[#a9b9ac]' : 'text-[#727b70]'
  return <div className="mt-6">
    <div className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-3 ${panel}`}>
      <label className="text-xs font-medium">Browse category<select aria-label="Browse warehouse category" value={parent} onChange={(event) => browse(event.target.value)} className={`mt-2 block min-h-11 w-full rounded-lg border px-3 text-sm ${panel}`}><option value="">All categories</option>{groups.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label className="text-xs font-medium">Browse subcategory<select aria-label="Browse warehouse subcategory" disabled={!parent || !children.length} value={category.includes(' / ') ? category : ''} onChange={(event) => browse(event.target.value || parent)} className={`mt-2 block min-h-11 w-full rounded-lg border px-3 text-sm disabled:opacity-50 ${panel}`}><option value="">All in this category</option>{children.map((entry) => <option key={entry.category} value={entry.category}>{entry.category.slice(parent.length + 3)} ({entry.count})</option>)}</select></label>
      <label className="text-xs font-medium">Search warehouse<span className={`mt-2 flex min-h-11 items-center gap-2 rounded-lg border px-3 ${panel}`}><Search size={16} /><input aria-label="Search warehouse products" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Product name or category" /></span></label>
    </div>
    <nav aria-label="Warehouse category path" className={`mt-4 flex flex-wrap items-center gap-2 text-xs ${muted}`}><button onClick={() => browse('')} className="underline">All products</button>{category && <><ChevronRight size={12} /><span>{category}</span></>}</nav>
    <div className="mt-4 flex items-center justify-between gap-3"><p className={`text-sm ${muted}`} role="status">{loading ? 'Loading products…' : `${data.total.toLocaleString()} products${category ? ` in ${category}` : ''}`}</p><span className={`text-xs ${muted}`}>Categories are already assigned</span></div>
    {data.catalogImport && <p className={`mt-3 text-xs ${muted}`}>{Number(data.catalogImport.imported).toLocaleString()} source listings imported. {data.catalogImport.complete ? 'Source import complete.' : 'Catalog import is not complete yet; this count refreshes automatically.'}</p>}
    {error && <p role="alert" className="mt-3 rounded-lg border border-red-300 p-3 text-sm text-red-500">{error}</p>}
    <div aria-busy={loading} className={`mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-50' : ''}`}>
      {data.products.map((product) => <article key={product.id} className={`flex min-w-0 flex-col overflow-hidden rounded-xl border ${panel}`}>
        <button onClick={() => inspect(product)} disabled={busy !== null} className="bg-[#f6f7f3] p-4" aria-label={`View details for ${product.name}`}><img src={product.imageUrl} alt={product.name} loading="lazy" className="h-44 w-full object-contain" /></button>
        <div className="flex flex-1 flex-col p-4"><p className={`text-[10px] ${muted}`}>{product.category}</p><h3 className="mt-2 line-clamp-3 text-sm font-semibold">{product.name}</h3><p className="mt-1 font-mono text-xs opacity-60">#{product.publicId}</p><p className="mt-3 font-semibold">{money(product.price)} {product.compareAtPrice && <s className={`ml-2 text-xs font-normal ${muted}`}>{money(product.compareAtPrice)}</s>}</p><p className={`mt-2 text-xs ${muted}`}>{product.colors?.length || 0} colors · {product.sizes?.length || 0} sizes · {product.imageUrls?.length || 1} images</p>
          <div className="mt-auto flex flex-wrap items-center gap-3 pt-4"><button onClick={() => inspect(product)} disabled={busy !== null} className="text-xs underline disabled:opacity-50">Full details</button>{onEdit && <button onClick={() => action(onEdit, product)} disabled={busy !== null} className="text-xs underline disabled:opacity-50">Edit</button>}{onRemove && <button onClick={() => action(onRemove, product, true)} disabled={busy !== null} className="text-xs underline disabled:opacity-50">Remove</button>}</div>
          {onSelect && <button onClick={() => action(onSelect, product)} disabled={busy !== null || loading} className="mt-4 min-h-11 rounded-full bg-[#263d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Use this product</button>}
          {onAdd && (product.storeProductId?<Link to="/seller/products" className="mt-4 flex min-h-11 items-center justify-center rounded-full border border-[#bfd0b7] bg-[#edf5e6] px-4 py-2 text-xs font-semibold text-[#4c713b]">In your store · Manage</Link>:<button onClick={() => setPublishingProduct(product)} disabled={busy !== null || loading} className="mt-4 min-h-11 rounded-full bg-[#263d35] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Add to my store</button>)}
        </div>
      </article>)}
    </div>
    {!loading && !data.products.length && <div className={`py-12 text-center ${muted}`}><Package className="mx-auto mb-3" /><p>No products match this category or search.</p></div>}
    <nav aria-label="Warehouse pages" className="mt-6 flex items-center justify-center gap-4 text-sm"><button disabled={loading || page <= 1} onClick={() => setPage((value) => value - 1)} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 disabled:opacity-40"><ChevronLeft size={16} /> Previous</button><span>Page {page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}</span><button disabled={loading || page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)} className="flex min-h-10 items-center gap-1 rounded-lg border px-3 disabled:opacity-40">Next <ChevronRight size={16} /></button></nav>
    {publishingProduct && <WarehousePublishModal product={publishingProduct} onClose={()=>{setPublishingProduct(null);if(publishedProduct.current){const created=publishedProduct.current;publishedProduct.current=null;onPublished?.(created)}}} onConfirm={async(product,pricing)=>{
      const created=await onAdd(product,pricing)
      publishedProduct.current=created
      setData(current=>({...current,products:current.products.map(item=>item.id===product.id?{...item,storeProductId:created.id}:item)}))
    }}/>}
    {detail && <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 p-4" onClick={(event) => { if (event.target === event.currentTarget) setDetail(null) }}><section role="dialog" aria-modal="true" aria-label="Warehouse product details" className={`relative mx-auto my-8 max-w-4xl rounded-2xl border p-5 sm:p-8 ${panel}`}><button autoFocus onClick={() => setDetail(null)} aria-label="Close product details" className="absolute right-4 top-4 rounded-full border p-2"><X size={18} /></button><p className={`pr-12 text-xs ${muted}`}>{detail.category}</p><h2 className="mt-3 pr-10 text-xl font-semibold">{detail.name}</h2><p className="mt-3 text-xl font-semibold">{money(detail.price)}</p><div className="mt-5 flex gap-3 overflow-x-auto pb-3">{(detail.imageUrls || [detail.imageUrl]).map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="shrink-0"><img src={url} alt={detail.name} loading="lazy" className="h-40 w-40 rounded-lg bg-white object-contain" /></a>)}</div><p className={`mt-4 whitespace-pre-wrap text-sm leading-7 ${muted}`}>{detail.description}</p>{detail.colors?.length > 0 && <p className="mt-4 text-sm"><strong>Colors: </strong>{detail.colors.join(', ')}</p>}{detail.sizes?.length > 0 && <p className="mt-3 text-sm"><strong>Sizes: </strong>{detail.sizes.join(', ')}</p>}
      {detail.sourceDetails?.skus?.length > 0 && <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold">Source variants ({detail.sourceDetails.skus.length})</summary><p className={`mt-2 text-xs ${muted}`}>Source variant prices are saved for reference. Your store listing uses the product price shown above.</p><div className="mt-3 max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Options</th><th className="p-2">Source price</th></tr></thead><tbody>{detail.sourceDetails.skus.slice((skuPage - 1) * 100, skuPage * 100).map((sku, index) => <tr key={sku.skuId || index} className="border-t"><td className="p-2">{(sku.attrs || []).map((attr) => `${attr.attrName}: ${attr.attrValueName}`).join(' · ')}</td><td className="whitespace-nowrap p-2">{money(sku.discountPrice ?? sku.sellingPrice ?? sku.price)}</td></tr>)}</tbody></table></div>{detail.sourceDetails.skus.length > 100 && <div className="mt-3 flex items-center gap-3 text-xs"><button disabled={skuPage === 1} onClick={() => setSkuPage((value) => value - 1)} className="underline disabled:opacity-40">Previous variants</button><span>{skuPage} / {Math.ceil(detail.sourceDetails.skus.length / 100)}</span><button disabled={skuPage * 100 >= detail.sourceDetails.skus.length} onClick={() => setSkuPage((value) => value + 1)} className="underline disabled:opacity-40">Next variants</button></div>}</details>}
      {detail.source && <p className={`mt-5 break-all text-xs ${muted}`}>Source: {detail.source.host} · Listing {detail.source.listingId} · Captured {detail.source.capturedAt}</p>}
    </section></div>}
  </div>
}
