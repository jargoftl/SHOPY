import UiverseSelect from '../components/UiverseSelect.jsx'
import ContentPlaceholder from '../components/ContentPlaceholder.jsx'
import ProductPublishConfirmation from '../components/ProductPublishConfirmation.jsx'
import {progressToast} from '../components/ProgressToast.jsx'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { apiRequest } from '../lib/api.js'
import { catalogTaxonomy } from '../data/catalogTaxonomy.js'
import { CATALOG_UPDATED, notifyCatalogUpdated } from '../lib/catalogEvents.js'
import { publishWarehouseProduct } from '../lib/warehousePublish.js'
import SellerProductTabs from '../components/SellerProductTabs.jsx'
import WarehouseBrowser from '../components/WarehouseBrowser.jsx'
import SiteName from '../components/SiteName.jsx'
import ProductImageFields, { productImagePayload } from '../components/ProductImageFields.jsx'

const taxonomyCategoryGroups = catalogTaxonomy.map((category) => ({
  name: category.name,
  options: [
    { value: category.name, label: category.name },
    ...category.items.map((item) => ({
      value: `${category.name} / ${item}`,
      label: item,
    })),
  ],
}))

const SellerPage = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const catalogVersion=useRef(0)
  const [pendingPublish,setPendingPublish]=useState(null)
  const [user, setUser] = useState(null)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [editingProduct, setEditingProduct] = useState(null)
  const [showWarehouse, setShowWarehouse] = useState(false)
  const [catalogSearch,setCatalogSearch]=useState('')
  const [catalogLimit,setCatalogLimit]=useState(24)
  const [newCategory, setNewCategory] = useState('')
  const [productForm, setProductForm] = useState({ name: '', category: '', price: '', compareAtPrice: '', imageUrl: '', imageUrls: [], description: '', isPublished: true })
  const [message, setMessage] = useState(location.state?.welcome || '')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [imageUploads, setImageUploads] = useState({ primary: null, gallery: [] })
  const [isReadingImages, setIsReadingImages] = useState(false)
  const [imageFormVersion, setImageFormVersion] = useState(0)
  const knownCategoryValues = new Set(taxonomyCategoryGroups.flatMap((group) => group.options.map((option) => option.value)))
  const additionalCategories = [...new Set([...categories.map((category) => category.name), productForm.category].filter(Boolean))].filter((name) => !knownCategoryValues.has(name)).map((name) => ({ id: name, name }))

  useEffect(() => {
    let isCurrent = true

    apiRequest('/api/auth/me')
      .then(async ({ user: account }) => {
        if (['pending','rejected','needs_changes'].includes(account.sellerStatus) && account.role==='customer') { navigate('/seller/application',{replace:true}); return }
        if (!['seller', 'admin'].includes(account.role)) {
          if (isCurrent) {
            setMessage('Store access is not enabled. Check your application status or contact support.')
            setIsLoading(false)
          }
          return
        }

        const [productData, categoryData] = await Promise.all([
          apiRequest('/api/seller/products'),
          apiRequest('/api/seller/categories'),
        ])
        if (!isCurrent) return
        setUser(account)
        setProducts(productData.products)
        setCategories(categoryData.categories)
        setMessage(location.state?.welcome || '')
        setIsLoading(false)
      })
      .catch((error) => {
        if (!isCurrent) return
        if (error.message.includes('log in') || error.message.includes('session')) {
          navigate('/seller/register', { replace: true })
          return
        }
        setMessage(error.message)
        setIsLoading(false)
      })

    return () => { isCurrent = false }
  }, [navigate, location.state?.welcome])

  useEffect(()=>{
    if(!user)return
    let active=true,lastStarted=0
    const refresh=async()=>{lastStarted=Date.now();const version=catalogVersion.current;try{const data=await apiRequest('/api/seller/products',{background:true});if(active&&version===catalogVersion.current)setProducts(data.products)}catch{/* Keep the current catalog available on a transient refresh failure. */}}
    const storage=event=>{if(event.key===CATALOG_UPDATED)void refresh()}
    const focus=()=>{if(Date.now()-lastStarted>10000)void refresh()}
    window.addEventListener('storage',storage);window.addEventListener('focus',focus)
    return()=>{active=false;window.removeEventListener('storage',storage);window.removeEventListener('focus',focus)}
  },[user])

  const saveProduct = async (event, confirmed=false) => {
    event.preventDefault()
    const form = event.currentTarget
    if (isReadingImages || isSaving) return
    if (!editingProduct && !confirmed) {setPendingPublish(form);return}
    setIsSaving(true)
    setMessage('')

    try {
      const payload = { ...productForm, ...productImagePayload(productForm, imageUploads), price: Number(productForm.price), compareAtPrice: productForm.compareAtPrice ? Number(productForm.compareAtPrice) : null }
      const { product } = await apiRequest(editingProduct ? `/api/seller/products/${editingProduct.id}` : '/api/seller/products', {
        method: editingProduct ? 'PATCH' : 'POST', body: JSON.stringify(payload),
      })
      catalogVersion.current+=1
      setPendingPublish(null)
      progressToast(editingProduct?'Product updated':'Product added to your store')
      notifyCatalogUpdated()
      setProducts((currentProducts) => editingProduct
        ? currentProducts.map((item) => item.id === product.id ? product : item)
        : [product, ...currentProducts])
      if (!categories.some((category) => category.name === product.category)) {
        const { categories: updatedCategories } = await apiRequest('/api/seller/categories')
        setCategories(updatedCategories)
      }
      setMessage(editingProduct ? `Product “${product.name}” was updated.` : `Product “${product.name}” was added.`)
      setEditingProduct(null)
      setImageFormVersion((version) => version + 1)
      setImageUploads({ primary: null, gallery: [] })
      setIsReadingImages(false)
      setProductForm({ name: '', category: '', price: '', compareAtPrice: '', imageUrl: '', imageUrls: [], description: '', isPublished: true })
      form.reset()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  const editProduct = (product) => {
    setEditingProduct(product)
    setImageFormVersion((version) => version + 1)
    setImageUploads({ primary: null, gallery: [] })
    setIsReadingImages(false)
    setProductForm({
      ...product,
      imageUrls: (product.imageUrls || []).filter((url) => url !== product.imageUrl),
      name: product.name,
      category: product.category,
      price: String(product.price),
      compareAtPrice: product.compareAtPrice ? String(product.compareAtPrice) : '',
      imageUrl: product.imageUrl,
      description: product.description || '',
      isPublished: product.isPublished,
    })
    requestAnimationFrame(()=>document.getElementById('catalog-editor')?.scrollIntoView({behavior:'smooth',block:'start'}))
  }

  const addCategory = async (event) => {
    event.preventDefault()
    try {
      const { category } = await apiRequest('/api/seller/categories', {
        method: 'POST',
        body: JSON.stringify({ name: newCategory }),
      })
      setCategories((currentCategories) => [...currentCategories, category].sort((first, second) => first.name.localeCompare(second.name)))
      setProductForm((currentForm) => ({ ...currentForm, category: category.name }))
      setNewCategory('')
      setMessage(`Category “${category.name}” was added.`)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const deleteCategory = async (categoryId, categoryName) => {
    try {
      await apiRequest(`/api/seller/categories/${categoryId}`, { method: 'DELETE' })
      setCategories((currentCategories) => currentCategories.filter((category) => category.id !== categoryId))
      setMessage(`Category “${categoryName}” was removed.`)
    } catch (error) {
      setMessage(error.message)
    }
  }

  const cancelEdit = () => {
    setEditingProduct(null)
    setImageFormVersion((version) => version + 1)
    setImageUploads({ primary: null, gallery: [] })
    setIsReadingImages(false)
    setProductForm({ name: '', category: '', price: '', compareAtPrice: '', imageUrl: '', imageUrls: [], description: '', isPublished: true })
  }

  const deleteProduct = async (productId) => {
    try {
      await apiRequest(`/api/seller/products/${productId}`, { method: 'DELETE' })
      catalogVersion.current+=1
      setProducts((currentProducts) => currentProducts.filter((product) => product.id !== productId))
      notifyCatalogUpdated()
      setMessage('Product removed from the catalog.')
    } catch (error) {
      setMessage(error.message)
    }
  }

  const logOut = async () => {
    await apiRequest('/api/auth/logout', { method: 'POST' }).catch(() => {})
    navigate('/', { replace: true })
  }

  if (isLoading) {
    return <main className="mx-auto max-w-5xl px-5 py-16"><ContentPlaceholder/></main>
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-5 py-20 text-center">
        <h1 className="text-3xl font-semibold">store access required</h1>
        <p className="mt-3 text-sm text-[#666]">{message}</p>
        <Link to="/seller/register" className="mt-6 inline-block bg-black px-5 py-3 text-sm font-medium text-white">Sign up as a store</Link>
        <Link to="/" className="mt-6 inline-block border border-[#ccc] px-5 py-3 text-sm">Back to store</Link>
      </main>
    )
  }

  return (
    <div className="seller-portal seller-products-page min-h-screen bg-[#f7f7f5] text-[#111111]">
      <header className="border-b border-[#e5e5e5] bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 md:px-10">
          <div>
            <Link to="/" className="text-2xl font-black tracking-[-0.07em]"><SiteName logo /></Link>
            <p className="mt-1 text-xs text-[#555555]">Workspace</p>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-[#666] sm:inline">{user.fullName} · #{user.publicId || '—'}</span>
            {user.role === 'admin' && <Link to="/admin" className="underline underline-offset-4">Admin</Link>}
            <button type="button" onClick={logOut} className="border border-[#cccccc] px-4 py-2">Log out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1440px] px-5 pt-6 md:px-10"><SellerProductTabs/></div>
      <section className="mx-auto max-w-[1440px] px-5 pt-8 md:px-10">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-[#555555]">Ready-to-add catalog</p><h2 className="mt-2 text-2xl font-semibold">Choose from your warehouse</h2><p className="mt-2 text-sm text-[#555555]">Choose a product, review its retail and wholesale prices, then confirm to publish. Its category and details are copied automatically.</p></div><button onClick={() => setShowWarehouse((value) => !value)} className="rounded-full border border-[#cccccc] bg-white px-5 py-3 text-sm">{showWarehouse ? 'Hide warehouse' : 'Browse warehouse'}</button></div>
        {showWarehouse && <WarehouseBrowser onPublished={()=>setMessage('Products added. Your warehouse has shuffled fresh items to choose from.')} onAdd={async(selected,pricing)=>{
          const product=await publishWarehouseProduct(selected,pricing)
          catalogVersion.current+=1
          setProducts(current=>[product,...current.filter(item=>item.id!==product.id)])
          setCategories(current=>current.some(item=>item.name===product.category)?current:[...current,{id:product.category,name:product.category}])
          setMessage(`Product “${product.name}” is published in your store and on the marketplace homepage.`)
          return product
        }}/>}
      </section>
      <main className="seller-catalog-layout mx-auto grid max-w-[1440px] gap-8 px-5 py-9 md:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.2fr)] md:px-10 md:py-12">
        <details id="catalog-editor" open={Boolean(editingProduct)} className="catalog-editor min-w-0"><summary className="portal-editor-heading">{editingProduct?'Edit product':'Add a product / categories'}</summary>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#111111]">Catalog tools</p>
          <h1 className="mt-2 text-3xl font-semibold">{editingProduct ? 'Edit product' : 'Add a product'}</h1>
          <p className="mt-2 text-sm text-[#555555]">Published items become visible on the storefront.</p>

          {pendingPublish&&<ProductPublishConfirmation product={productForm} busy={isSaving} onCancel={()=>setPendingPublish(null)} onConfirm={()=>saveProduct({preventDefault(){},currentTarget:pendingPublish},true)}/>}
          <form id="seller-product-form" key={editingProduct?.id || 'new-product'} className="mt-6 space-y-4 bg-white p-5 sm:p-6" onSubmit={saveProduct}>
            <label className="block text-sm font-medium">Product name
              <input name="name" value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} maxLength={500} required className="mt-2 h-11 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" placeholder="Example: Mira Everyday Tote" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium">Category
                <UiverseSelect name="category" value={productForm.category} onChange={(event) => setProductForm((current) => ({ ...current, category: event.target.value }))} required className="mt-2 h-11 w-full border border-[#cccccc] bg-white px-3 text-sm outline-none focus:border-black">
                  <option value="" disabled>Select category</option>
                  {taxonomyCategoryGroups.map((group) => (
                    <optgroup key={group.name} label={group.name}>
                      {group.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </optgroup>
                  ))}
                  {additionalCategories.length > 0 && (
                    <optgroup label="Additional categories">
                      {additionalCategories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
                    </optgroup>
                  )}
                </UiverseSelect>
              </label>
              <label className="block text-sm font-medium">Price
                <input name="price" type="number" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} min="0" max="1000000" step="0.01" required className="mt-2 h-11 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" placeholder="49.00" />
              </label>
            </div>
            <label className="block text-sm font-medium">Compare-at price <span className="font-normal text-[#777]">(must be higher than current price)</span>
              <input name="compareAtPrice" type="number" value={productForm.compareAtPrice} onChange={(event) => setProductForm((current) => ({ ...current, compareAtPrice: event.target.value }))} min="0" max="1000000" step="0.01" className="mt-2 h-11 w-full border border-[#cccccc] px-3 text-sm outline-none focus:border-black" placeholder="Original price" />
            </label>
            <ProductImageFields key={imageFormVersion} form={productForm} setForm={setProductForm} uploads={imageUploads} setUploads={setImageUploads} onBusyChange={setIsReadingImages} onError={setMessage} />
            <label className="block text-sm font-medium">Description
              <textarea name="description" value={productForm.description} onChange={(event) => setProductForm((current) => ({ ...current, description: event.target.value }))} maxLength={100000} rows={3} className="mt-2 w-full border border-[#cccccc] px-3 py-2 text-sm outline-none focus:border-black" placeholder="A few details about this product" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPublished" checked={productForm.isPublished} onChange={(event) => setProductForm((current) => ({ ...current, isPublished: event.target.checked }))} className="accent-black" /> Publish on the storefront
            </label>
            <button disabled={isSaving || isReadingImages} type="submit" className="w-full bg-black px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{isSaving ? 'Saving product…' : editingProduct ? 'Save changes' : 'Add product'}</button>
            {editingProduct && <button type="button" onClick={cancelEdit} className="w-full border border-[#ccc] px-4 py-3 text-sm">Cancel editing</button>}
          </form>

          <details className="mt-4 bg-white p-5 sm:p-6">
            <summary className="cursor-pointer text-sm font-semibold">Manage categories ({categories.length})</summary>
            <form className="mt-4 flex gap-2" onSubmit={addCategory}>
              <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} maxLength={60} required className="h-10 min-w-0 flex-1 border border-[#cccccc] px-3 text-sm outline-none focus:border-black" placeholder="New category name" />
              <button type="submit" className="bg-black px-4 text-xs font-semibold text-white">Add</button>
            </form>
            <ul className="mt-4 divide-y divide-[#eee]">
              {categories.map((category) => (
                <li key={category.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{category.name}</span>
                  <button type="button" onClick={() => deleteCategory(category.id, category.name)} className="text-xs underline underline-offset-2">Remove</button>
                </li>
              ))}
            </ul>
          </details>
        </details>

        <section id="seller-catalog" className="min-w-0">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#111111]">Your catalog</p><h2 className="mt-2 text-2xl font-semibold">Products</h2></div>
            <div className="flex flex-wrap gap-4 text-xs">{user.role==='seller'&&<Link to={`/stores/${user.id}`} className="underline underline-offset-4">View my store</Link>}<Link to="/" className="underline underline-offset-4">View homepage</Link></div>
          </div>

          {message && <p role="status" className="mb-4 border border-[#e5e5e5] bg-white px-4 py-3 text-sm">{message}</p>}

          <label className="portal-product-search"><span className="sr-only">Search store products</span><input type="search" value={catalogSearch} onChange={e=>{setCatalogSearch(e.target.value);setCatalogLimit(24)}} placeholder="Search product name or category"/></label>
          <div className="portal-catalog-shortcuts"><Link to="/seller/warehouse">Product warehouse →</Link><Link to="/seller/reviews">Product reviews →</Link></div>
          <div className="seller-catalog-list divide-y divide-[#eee] bg-white">
            {products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(catalogSearch.toLowerCase())).slice(0,catalogLimit).map((product) => (
              <article id={`seller-product-${product.id}`} key={product.id} className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
                <img src={product.imageUrl} alt="" className="size-16 shrink-0 bg-[#f7f7f7] object-cover" />
                <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-medium">{product.name}</h3><p className="mt-1 text-xs text-[#555555]">{product.category} · ${product.price.toFixed(2)}{product.compareAtPrice ? ` · Was $${product.compareAtPrice.toFixed(2)}` : ''}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-[#777]">{product.isPublished ? 'Published' : 'Draft'}</p></div>
                <div className="catalog-item-actions flex shrink-0 gap-2">
                  <button type="button" onClick={() => editProduct(product)} aria-label={`Edit ${product.name}`} className="border border-[#ddd] px-3 py-2 text-xs hover:border-black">Edit</button>
                  <button type="button" onClick={() => deleteProduct(product.id)} aria-label={`Delete ${product.name}`} className="border border-[#ddd] px-3 py-2 text-xs hover:border-black">Delete</button>
                </div>
              </article>
            ))}
            {products.filter(p=>`${p.name} ${p.category}`.toLowerCase().includes(catalogSearch.toLowerCase())).length>catalogLimit&&<button className="portal-load-more" onClick={()=>setCatalogLimit(n=>n+24)}>Show more products</button>}
            {!products.length && <p className="p-8 text-center text-sm text-[#555555]">No products yet. Add one using the form.</p>}
          </div>
        </section>
      </main>
    </div>
  )
}

export default SellerPage
