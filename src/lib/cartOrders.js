export const reconcilePaidOrder = (items, snapshot, orderId) => {
  const amounts = new Map(snapshot.map((item) => [item.lineId, item.quantity]))
  return items.flatMap((item) => {
    const purchased = amounts.get(item.lineId) || 0
    if (!purchased) return [item]
    const remaining = item.quantity - purchased
    return remaining > 0 ? [{ ...item, quantity: remaining, lineId: `${item.lineId}:paid:${orderId}` }] : []
  })
}
