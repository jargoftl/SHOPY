import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { reconcilePaidOrder } from '../lib/cartOrders.js'

const CartContext = createContext(null)
const storageKey = 'ggu-cart'
const pendingKey = 'ggu-pending-cart-orders'
const getCartKey = (item) => item.cartKey ?? (
  item.selectedColor || item.selectedSize
    ? `${item.id}::${item.selectedColor || ''}::${item.selectedSize || ''}`
    : item.id
)

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [isHydrated, setIsHydrated] = useState(false)
  const [pendingOrders, setPendingOrders] = useState([])
  const [syncError, setSyncError] = useState('')
  const [cartNotice, setCartNotice] = useState(null)
  const dismissCartNotice = useCallback(() => setCartNotice(null), [])

  useEffect(() => {
    try {
      const savedItems = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(savedItems)) setItems(savedItems.map((item) => ({ ...item, lineId: item.lineId || crypto.randomUUID() })))
      const savedPending = JSON.parse(localStorage.getItem(pendingKey) || '[]')
      if (Array.isArray(savedPending)) setPendingOrders(savedPending)
    } catch {
      localStorage.removeItem(storageKey)
    }
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (isHydrated) localStorage.setItem(storageKey, JSON.stringify(items))
  }, [items, isHydrated])

  useEffect(() => {
    if (isHydrated) localStorage.setItem(pendingKey, JSON.stringify(pendingOrders))
  }, [pendingOrders, isHydrated])

  useEffect(() => {
    if (!isHydrated || !pendingOrders.length) return
    let active = true
    const sync = async () => {
      try {
        const { user } = await apiRequest('/api/auth/me', { background: true })
        const ownPending = pendingOrders.filter((order) => order.buyerId === user.id)
        if (!ownPending.length) return
        const { orders } = await apiRequest('/api/purchases', { background: true })
        if (!active) return
        const completed = ownPending.filter((pending) => orders.some((order) => order.id === pending.id && order.status === 'paid'))
        const rejected = ownPending.filter((pending) => orders.some((order) => order.id === pending.id && order.status === 'rejected'))
        if (completed.length) setItems((current) => completed.reduce((cart, order) => reconcilePaidOrder(cart, order.items, order.id), current))
        if (completed.length || rejected.length) {
          const finished = new Set([...completed, ...rejected].map((order) => order.id))
          setPendingOrders((current) => current.filter((order) => order.buyerId !== user.id || !finished.has(order.id)))
        }
        setSyncError('')
      } catch (error) {
        if (active && error.status !== 401) setSyncError(`Cart payment updates unavailable: ${error.message}`)
      }
    }
    sync()
    const timer = window.setInterval(sync, 15000)
    window.addEventListener('focus', sync)
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', sync) }
  }, [isHydrated, pendingOrders])

  const addItem = (product) => {
    setCartNotice({ id: crypto.randomUUID(), name: product.name })
    const cartKey = getCartKey(product)
    setItems((currentItems) => {
      const existing = currentItems.find((item) => getCartKey(item) === cartKey)
      return existing
        ? currentItems.map((item) => getCartKey(item) === cartKey ? { ...item, quantity: item.quantity + 1 } : item)
        : [...currentItems, { ...product, cartKey, quantity: 1, lineId: crypto.randomUUID() }]
    })
  }

  const setQuantity = (cartKey, quantity) => {
    if (quantity < 1) return
    setItems((currentItems) => currentItems.map((item) => getCartKey(item) === cartKey ? { ...item, quantity } : item))
  }

  const removeItem = (cartKey) => setItems((currentItems) => currentItems.filter((item) => getCartKey(item) !== cartKey))
  const clearCart = () => setItems([])
  const trackOrder = (id, buyerId, orderedItems) => {
    setPendingOrders((current) => current.some((order) => order.id === id && order.buyerId === buyerId)
      ? current
      : [...current, { id, buyerId, items: orderedItems.map(({ lineId, quantity }) => ({ lineId, quantity })) }])
  }
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{ cartNotice, dismissCartNotice, items, addItem, setQuantity, removeItem, clearCart, trackOrder, itemCount, subtotal }}>
      {syncError && <p role="alert" className="bg-red-50 p-2 text-center text-sm text-red-800">{syncError}</p>}
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart must be used inside CartProvider')
  return cart
}
