export const marketingCoins = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
export const marketingPlans = [
  { id: 'international', kind: 'package', name: 'International promotion', feeCents: 66666, rank: 3, durationDays: 30, productLimit: 10, details: { tagline: 'Your biggest collection, in the spotlight.' } },
  { id: 'overseas', kind: 'package', name: 'Overseas promotion', feeCents: 29999, rank: 2, durationDays: 30, productLimit: 5, details: { tagline: 'A focused showcase for your next favorites.' } },
  { id: 'standard', kind: 'package', name: 'Standard promotion', feeCents: 19999, rank: 1, durationDays: 30, productLimit: 2, details: { tagline: 'Start small. Put your best products forward.' } },
  ...[
    ['C', 6000, 3, '100–2,700', 1000, 1000, false],
    ['B', 10000, 10, '200–3,800', 2000, 5000, false],
    ['A', 50000, 30, '250–4,800', 10000, 7000, false],
    ['S', 100000, 20, '500–5,800', 20000, 10000, false],
    ['SS', 3000000, 60, '2,000–8,569', 58888, 30000, true],
    ['SSS', 5000000, 100, '5,000–28,000', 188888, 50000, true],
  ].map((row, index) => ({ id: `level-${row[0]}`, kind: 'level', name: `${row[0]}-Level Seller`, feeCents: 0, rank: index + 1, durationDays: null, productLimit: Number(row[5]), details: {
    level: row[0], operatingFunds: row[1], branches: row[2], dailyTraffic: row[3], upgradeBonus: row[4], salesProfitRatio: '15.00%–15.00%', deliveryDays: 15, purchaseDiscount: '0.00%', exclusiveService: true, homepageRecommendation: row[6], referenceSellingPrice: 0,
  } })),
]
export function validMarketingRate(rate: string) { return /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/.test(rate) && /[1-9]/.test(rate) }
export function marketingCoinAmount(cents: number, rate: string) {
  const [whole, fraction = ''] = rate.split('.')
  const scaled = BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0'))
  const units = (BigInt(cents) * 100000000000000n + scaled - 1n) / scaled
  const decimal = (units % 100000000n).toString().padStart(8, '0').replace(/0+$/, '')
  return decimal ? `${units / 100000000n}.${decimal}` : String(units / 100000000n)
}
