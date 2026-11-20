export const mergeBillingDefaults = (current, user, addresses, editedFields) => {
  const defaultAddress = addresses.find((address) => address.isDefault)
  const defaults = {
    fullName: defaultAddress?.fullName || user.fullName,
    email: user.email,
    address: defaultAddress?.address,
    city: defaultAddress?.city,
    region: defaultAddress?.region,
    country: defaultAddress?.country,
  }
  const next = { ...current }
  for (const [key, value] of Object.entries(defaults)) {
    if (!editedFields.has(key) && !next[key] && value) next[key] = value
  }
  return next
}

export const applyBillingAddress = (current, address) => {
  const fields = ['fullName', 'address', 'city', 'region', 'country']
  return { ...current, ...Object.fromEntries(fields.map((field) => [field, address[field] || ''])) }
}
