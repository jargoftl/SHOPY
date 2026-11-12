import { createContext, useContext, useEffect, useState } from 'react'

const CartContext = createContext(null)
const storageKey = 'ggu-cart'
const getCartKey = (item) => item.cartKey ?? (
  item.selectedColor || item.selectedSize
    ? `${item.id}::${item.selectedColor || ''}::${item.selectedSize || ''}`
    : item.id
)

export const CartProvider = ({ children }) => {
  const [items, setItems] = useState([])
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    try {
      const savedItems = JSON.parse(localStorage.getItem(storageKey) || '[]')
      if (Array.isArray(savedItems)) setItems(savedItems)
    } catch {
      localStorage.removeItem(storageKey)
    }
    setIsHydrated(true)
  }, [])

  useEffect(() => {
    if (isHydrated) localStorage.setItem(storageKey, JSON.stringify(items))
  }, [items, isHydrated])

  const addItem = (product) => {
    const cartKey = getCartKey(product)
    setItems((currentItems) => {
      const existing = currentItems.find((item) => getCartKey(item) === cartKey)
      return existing
        ? currentItems.map((item) => getCartKey(item) === cartKey ? { ...item, quantity: item.quantity + 1 } : item)
        : [...currentItems, { ...product, cartKey, quantity: 1 }]
    })
  }

  const setQuantity = (cartKey, quantity) => {
    if (quantity < 1) return
    setItems((currentItems) => currentItems.map((item) => getCartKey(item) === cartKey ? { ...item, quantity } : item))
  }

  const removeItem = (cartKey) => setItems((currentItems) => currentItems.filter((item) => getCartKey(item) !== cartKey))
  const clearCart = () => setItems([])
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0)

  return (
    <CartContext.Provider value={{ items, addItem, setQuantity, removeItem, clearCart, itemCount, subtotal }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart must be used inside CartProvider')
  return cart
}
