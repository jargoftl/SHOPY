export const mergeBillingDefaults = (current, user, addresses, editedFields) => {
  const defaultAddress = addresses.find((address) => address.isDefault)
  const defaults = {
    fullName: defaultAddress?.fullName || user.fullName,
    phone: defaultAddress?.phone || user.phone || '',
    email: user.email,
    address: defaultAddress?.address,
    city: defaultAddress?.city,
    region: defaultAddress?.region,
    postalCode: defaultAddress?.postalCode,
    country: defaultAddress?.country,
  }
  const next = { ...current }
  for (const [key, value] of Object.entries(defaults)) {
    if (!editedFields.has(key) && !next[key] && value) next[key] = value
  }
  return next
}

export const applyBillingAddress = (current, address) => {
  const fields = ['fullName', 'phone', 'address', 'city', 'region', 'postalCode', 'country']
  return { ...current, ...Object.fromEntries(fields.map((field) => [field, address[field] || ''])) }
}
