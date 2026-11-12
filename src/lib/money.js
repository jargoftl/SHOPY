export const formatMoney = (cents) => cents === null ? 'Amount not provided' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

export const formatAmountInput = (value) => {
  const raw = value.replace(/,/g, '')
  if (!/^\d*(?:\.\d{0,2})?$/.test(raw)) return null
  const [whole, fraction] = raw.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fraction === undefined ? grouped : `${grouped}.${fraction}`
}

export const parseAmountCents = (value) => {
  const raw = value.replace(/,/g, '')
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null
  const [whole, fraction = ''] = raw.split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) && cents <= 100000000 ? cents : null
}
