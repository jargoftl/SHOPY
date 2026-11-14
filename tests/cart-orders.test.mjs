import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconcilePaidOrder } from '../src/lib/cartOrders.js'

test('confirmed orders remove purchased quantities without removing later additions or other items', () => {
  const items = [{ lineId: 'original', quantity: 3 }, { lineId: 'other', quantity: 2 }]
  const pending = [{ lineId: 'original', quantity: 2 }]
  const result = reconcilePaidOrder(items, pending, 15)
  assert.equal(result.length, 2)
  assert.equal(result[0].quantity, 1)
  assert.notEqual(result[0].lineId, 'original')
  assert.deepEqual(result[1], items[1])
  assert.deepEqual(reconcilePaidOrder(result, pending, 15), result)
  assert.deepEqual(reconcilePaidOrder([{ lineId: 'original', quantity: 1 }], pending, 15), [])
  assert.deepEqual(reconcilePaidOrder([{ lineId: 'new-line', quantity: 1 }], pending, 15), [{ lineId: 'new-line', quantity: 1 }])
})
