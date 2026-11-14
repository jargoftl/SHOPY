import { useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import CategoryPicker from './CategoryPicker.jsx'
import ProductImageFields, { productImagePayload } from './ProductImageFields.jsx'

const blank = { name: '', category: '', price: '', imageUrl: '', imageUrls: [], description: '' }

export default function AdminWarehouse() {
  const [products, setProducts] = useState([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [imageUploads, setImageUploads] = useState({ primary: null, gallery: [] })
  const [isReadingImages, setIsReadingImages] = useState(false)
  const [imageFormVersion, setImageFormVersion] = useState(0)
  const load = async () => { const data = await apiRequest('/api/warehouse'); setProducts(data.products) }
  useEffect(() => {
    let active = true
    apiRequest('/api/warehouse').then((data) => { if (active) { setProducts(data.products); setLoaded(true) } }).catch((error) => { if (active) setMessage(error.message) })
    return () => { active = false }
  }, [])
  const save = async (event) => {
    event.preventDefault()
    const element = event.currentTarget
    if (isReadingImages) return
    if (!form.category) { setMessage('Choose a category.'); return }
    setBusy(true); setMessage('')
    try {
      await apiRequest(editing ? `/api/admin/warehouse/${editing}` : '/api/admin/warehouse', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, ...productImagePayload(form, imageUploads), price: Number(form.price) }) })
      await load(); setEditing(null); setForm(blank); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false); element.reset(); setMessage('Warehouse product saved. Existing seller listings are not changed.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const remove = async (product) => {
    if (!window.confirm(`Remove ${product.name} from the warehouse? Existing seller listings will remain.`)) return
    try { await apiRequest(`/api/admin/warehouse/${product.id}`, { method: 'DELETE' }); await load(); setMessage('Warehouse product removed.') } catch (error) { setMessage(error.message) }
  }
  return <section id="warehouse" className="mb-8 rounded-xl border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
    <h2 className="text-lg font-semibold">Shared product warehouse</h2><p className="mt-1 text-sm text-[#9baa9d]">Add products for sellers to copy into their own stores. Changes here do not alter existing listings.</p>
    <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-sm">Product name<input required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <CategoryPicker dark value={form.category} onChange={(category) => setForm({ ...form, category })} />
      <label className="text-sm">Price (USD)<input required type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <ProductImageFields key={imageFormVersion} dark form={form} setForm={setForm} uploads={imageUploads} setUploads={setImageUploads} onBusyChange={setIsReadingImages} onError={setMessage} />
      <label className="text-sm md:col-span-2">Description<textarea maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <div className="flex gap-2"><button disabled={busy || isReadingImages} className="rounded bg-[#c8f135] px-4 py-2 text-sm font-semibold text-[#102016] disabled:opacity-60">{editing ? 'Save changes' : 'Add to warehouse'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(blank); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false) }} className="px-3 text-sm underline">Cancel</button>}</div>
    </form>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <div className="mt-5 divide-y divide-[#263c2d]">{products.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>{p.name} · {p.category} · ${Number(p.price).toFixed(2)}</span><div className="flex gap-3"><button onClick={() => { setEditing(p.id); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false); setForm({ ...p, imageUrls: (p.imageUrls || []).filter((url) => url !== p.imageUrl), price: String(p.price) }) }} className="underline">Edit</button><button onClick={() => remove(p)} className="underline">Remove</button></div></div>)}{loaded && !products.length && <p className="py-3 text-sm text-[#9baa9d]">No warehouse products yet.</p>}</div>
  </section>
}
