import { useEffect, useRef } from 'react'

const types = ['image/png', 'image/jpeg', 'image/webp']
const preview = (file) => `data:${file.type};base64,${file.data}`
const readImage = (file) => new Promise((resolve, reject) => {
  if (!types.includes(file.type) || !file.size || file.size > 2 * 1024 * 1024) {
    reject(new Error('Choose PNG, JPEG or WebP images up to 2 MB each.'))
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : ''
    if (!data) reject(new Error('This image could not be read. Please choose it again.'))
    else resolve({ type: file.type, data, name: file.name })
  }
  reader.onerror = () => reject(new Error('This image could not be read. Please choose it again.'))
  reader.readAsDataURL(file)
})

export const productImagePayload = (form, uploads) => ({
  imageUrls: [...new Set([form.imageUrl, ...(form.imageUrls || [])].filter(Boolean))],
  ...(uploads.primary || uploads.gallery.length ? { imageUploads: { primary: uploads.primary, gallery: uploads.gallery } } : {}),
})

export default function ProductImageFields({ form, setForm, uploads, setUploads, onBusyChange, onError, dark = false }) {
  const alive = useRef(true)
  const version = useRef({ primary: 0, gallery: 0 })
  const pending = useRef(new Set())
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const inputStyle = `mt-2 block w-full min-w-0 rounded border p-2 text-sm ${dark ? 'border-[#111111] bg-[#111111]' : 'border-[#cccccc] bg-white'}`
  const hint = dark ? 'text-[#a3a3a3]' : 'text-[#777]'
  const choose = async (event, kind) => {
    const input = event.currentTarget
    const files = [...(input.files || [])]
    const current = ++version.current[kind]
    if (!files.length) return
    if (kind === 'gallery' && files.length + uploads.gallery.length + (form.imageUrls || []).length > 7) {
      onError('Choose up to seven additional product images.')
      input.value = ''
      return
    }
    const token = Symbol()
    pending.current.add(token)
    onBusyChange(true)
    onError('')
    try {
      const images = await Promise.all(files.map(readImage))
      if (!alive.current || current !== version.current[kind]) return
      if (kind === 'primary') {
        setUploads((existing) => ({ ...existing, primary: images[0] }))
        setForm((existing) => ({ ...existing, imageUrl: '' }))
      } else setUploads((existing) => ({ ...existing, gallery: [...existing.gallery, ...images] }))
    } catch (error) { if (alive.current && current === version.current[kind]) onError(error.message) }
    finally {
      pending.current.delete(token)
      input.value = ''
      if (alive.current) onBusyChange(pending.current.size > 0)
    }
  }
  const source = uploads.primary ? preview(uploads.primary) : form.imageUrl
  return <fieldset className="min-w-0 space-y-3 md:col-span-2">
    <legend className="text-sm font-medium">Product images</legend>
    <label className="block text-sm">Upload main image
      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => choose(event, 'primary')} className={inputStyle} />
    </label>
    <p className={`text-xs ${hint}`}>PNG, JPEG or WebP, up to 2 MB each. One main image and up to seven additional images.</p>
    {source && <div className="flex items-center gap-3"><img src={source} alt="Main product image preview" className="size-20 rounded border border-[#777777] bg-white object-cover" />{uploads.primary && <button type="button" onClick={() => { version.current.primary += 1; setUploads((existing) => ({ ...existing, primary: null })) }} className="text-xs underline">Remove selected main image</button>}</div>}
    <label className={`block text-xs ${hint}`}>Or use a main image URL
      <input name="imageUrl" type="url" maxLength={2000} required={!uploads.primary && !form.imageUrl} value={form.imageUrl?.startsWith('/') ? '' : form.imageUrl || ''} onChange={(event) => { version.current.primary += 1; setUploads((existing) => ({ ...existing, primary: null })); setForm((existing) => ({ ...existing, imageUrl: event.target.value })) }} className={inputStyle} placeholder="https://example.com/image.jpg" />
    </label>
    <label className="block text-sm">Upload additional images <span className={`text-xs ${hint}`}></span>
      <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => choose(event, 'gallery')} className={inputStyle} />
    </label>
    {!!((form.imageUrls || []).length + uploads.gallery.length) && <div className="flex flex-wrap gap-3">
      {(form.imageUrls || []).map((url, index) => <div key={`saved-${index}`} className="w-20"><img src={url} alt={`Saved product image ${index + 1}`} className="size-20 rounded border border-[#777777] bg-white object-cover" /><button type="button" onClick={() => setForm((existing) => ({ ...existing, imageUrls: existing.imageUrls.filter((_, position) => position !== index) }))} className="mt-1 text-xs underline">Remove image {index + 1}</button></div>)}
      {uploads.gallery.map((file, index) => <div key={`new-${index}`} className="w-20"><img src={preview(file)} alt={`New product image ${index + 1}`} className="size-20 rounded border border-[#777777] bg-white object-cover" /><button type="button" onClick={() => { version.current.gallery += 1; setUploads((existing) => ({ ...existing, gallery: existing.gallery.filter((_, position) => position !== index) })) }} className="mt-1 text-xs underline">Remove new image {index + 1}</button></div>)}
    </div>}
  </fieldset>
}
