import { test } from 'node:test'
import assert from 'node:assert/strict'
import { calculateOrderTotals } from '../src/lib/orderTotals.js'

test('shipping is free and tax never exceeds three percent', () => {
  assert.deepEqual(calculateOrderTotals(20), { shipping: 0, tax: 0.6, total: 20.6 })
  assert.deepEqual(calculateOrderTotals(0.17), { shipping: 0, tax: 0, total: 0.17 })
  assert.deepEqual(calculateOrderTotals(1.99), { shipping: 0, tax: 0.05, total: 2.04 })
})
