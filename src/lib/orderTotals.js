export const calculateOrderTotals = (subtotal) => {
  const shipping = subtotal === 0 || subtotal >= 75 ? 0 : 7.95
  const tax = Math.round((subtotal + shipping) * 0.08 * 100) / 100
  return { shipping, tax, total: Math.round((subtotal + shipping + tax) * 100) / 100 }
}
