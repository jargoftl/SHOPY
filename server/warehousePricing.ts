// User-selected display model: a 15% estimated gross margin, before fulfillment costs.
// These values do not create a wallet debit, payout, or realized earnings.
export function warehousePricing(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) return null
  const retailCents = Math.round((value + Number.EPSILON) * 100)
  const profitCents = Math.round(retailCents * 15 / 100)
  return { retailCents, wholesaleCents: retailCents - profitCents, profitCents, marginPercent: 15, currency: 'USD', version: 'warehouse-15-v1' }
}
