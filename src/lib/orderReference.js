export function formatOrderReference(order) {
  const number = order?.orderNumber
  if (number == null) return '…'

  const year = /^\d{4}(?=-\d{2}-\d{2})/.exec(order.createdAt ?? '')?.[0]
  return year ? `REF-${year}-${String(number).padStart(4, '0')}` : `#${number}`
}
