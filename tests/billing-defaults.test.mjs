import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyBillingAddress, mergeBillingDefaults } from '../src/lib/billingDefaults.js'

test('billing uses account details and the default address without overwriting edits', () => {
  const user = { fullName: 'Buyer Name', email: 'account@example.test', phone: '555' }
  const address = { isDefault: 1, fullName: 'Delivery Name', phone: '123', address: '1 Main St', city: 'Town', region: 'State', postalCode: '123', country: 'Canada' }
  assert.deepEqual(mergeBillingDefaults({}, user, [address], new Set()), {
    fullName: 'Delivery Name', email: 'account@example.test', phone: '123', address: '1 Main St', city: 'Town', region: 'State', postalCode: '123', country: 'Canada',
  })
  const edited = mergeBillingDefaults({ fullName: '', email: 'other@example.test' }, user, [address], new Set(['fullName']))
  assert.equal(edited.fullName, '')
  assert.equal(edited.email, 'other@example.test')
  assert.equal(edited.address, '1 Main St')
  assert.equal(mergeBillingDefaults({}, user, [], new Set()).fullName, 'Buyer Name')
  assert.equal(applyBillingAddress({ email: 'other@example.test' }, address).email, 'other@example.test')
})
