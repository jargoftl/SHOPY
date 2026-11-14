import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { apiRequest } from '../lib/api.js'
import WarehouseBrowser from './WarehouseBrowser.jsx'
import CategoryPicker from './CategoryPicker.jsx'
import ProductImageFields, { productImagePayload } from './ProductImageFields.jsx'

const blank = { name: '', category: '', price: '', imageUrl: '', imageUrls: [], description: '', colors: [], sizes: [] }

export default function AdminWarehouse() {
  const [reloadKey, setReloadKey] = useState(0)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [imageUploads, setImageUploads] = useState({ primary: null, gallery: [] })
  const [isReadingImages, setIsReadingImages] = useState(false)
  const [imageFormVersion, setImageFormVersion] = useState(0)
  const load = async () => setReloadKey((value) => value + 1)
  const save = async (event) => {
    event.preventDefault()
    const element = event.currentTarget
    if (isReadingImages) return
    if (!form.category) { setMessage('Choose a category.'); return }
    setBusy(true); setMessage('')
    try {
      await apiRequest(editing ? `/api/admin/warehouse/${editing}` : '/api/admin/warehouse', { method: editing ? 'PUT' : 'POST', body: JSON.stringify({ ...form, ...productImagePayload(form, imageUploads), price: Number(form.price) }) })
      await load(); setEditing(null); setForm({ ...blank, category: form.category }); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false); element.reset(); setMessage('Warehouse product saved. Existing seller listings are not changed.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  const remove = async (product) => {
    if (!window.confirm(`Remove ${product.name} from the warehouse? Existing seller listings will remain.`)) return
    try { await apiRequest(`/api/admin/warehouse/${product.id}`, { method: 'DELETE' }); await load(); setMessage('Warehouse product removed.') } catch (error) { setMessage(error.message); throw error }
  }
  return <details id="warehouse" className="group mb-8 rounded-xl border border-[#263c2d] bg-[#0d1b12] p-5 sm:p-7">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c8f135] [&::-webkit-details-marker]:hidden">
      <div><h2 className="text-lg font-semibold">Shared product warehouse</h2><p className="mt-1 text-sm text-[#9baa9d]">Add and manage products for your sellers. Expand to browse the catalog.</p></div>
      <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#3b5140] text-[#c8f135]"><ChevronDown aria-hidden="true" size={18} className="transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none" /></span>
    </summary>
    <div className="mt-5 border-t border-[#263c2d] pt-4">
    <form onSubmit={save} className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-sm">Product name<input required maxLength={500} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <CategoryPicker dark value={form.category} onChange={(category) => setForm({ ...form, category })} />
      <label className="text-sm">Price (USD)<input required type="number" min="0" max="1000000" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <ProductImageFields key={imageFormVersion} dark form={form} setForm={setForm} uploads={imageUploads} setUploads={setImageUploads} onBusyChange={setIsReadingImages} onError={setMessage} />
      <label className="text-sm md:col-span-2">Description<textarea maxLength={100000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="mt-1 block w-full rounded border border-[#3b5140] bg-[#07120b] p-2" /></label>
      <div className="flex gap-2"><button disabled={busy || isReadingImages} className="rounded bg-[#c8f135] px-4 py-2 text-sm font-semibold text-[#102016] disabled:opacity-60">{editing ? 'Save changes' : 'Add to warehouse'}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm(blank); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false) }} className="px-3 text-sm underline">Cancel</button>}</div>
    </form>
    {message && <p role="status" className="mt-3 text-sm">{message}</p>}
    <WarehouseBrowser dark reloadKey={reloadKey} onCategoryChange={(category) => { if (!editing) setForm((current) => ({ ...current, category })) }} onRemove={remove} onEdit={async (product) => {
      const { product: p } = await apiRequest(`/api/warehouse/${product.id}`)
      setEditing(p.id); setImageFormVersion((version) => version + 1); setImageUploads({ primary: null, gallery: [] }); setIsReadingImages(false)
      setForm({ ...p, sourceDetails: undefined, source: undefined, imageUrls: (p.imageUrls || []).filter((url) => url !== p.imageUrl), price: String(p.price) })
      document.getElementById('warehouse')?.scrollIntoView({ behavior: 'smooth' })
    }} />
    </div>
  </details>
}
