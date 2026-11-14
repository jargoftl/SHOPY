export const calculateOrderTotals = (subtotal) => {
  const subtotalCents = Math.round(subtotal * 100)
  const taxCents = Math.floor(subtotalCents * 3 / 100)
  return { shipping: 0, tax: taxCents / 100, total: (subtotalCents + taxCents) / 100 }
}
