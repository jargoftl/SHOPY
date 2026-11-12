import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAmountInput, parseAmountCents } from '../src/lib/money.js'

test('amount entry groups thousands and parses exact cents', () => {
  assert.equal(formatAmountInput('10000.25'), '10,000.25')
  assert.equal(formatAmountInput('10,000.'), '10,000.')
  assert.equal(formatAmountInput('10,000.123'), null)
  assert.equal(formatAmountInput('12abc'), null)
  assert.equal(parseAmountCents('10,000.25'), 1000025)
  assert.equal(parseAmountCents('0.01'), 1)
  assert.equal(parseAmountCents('1,000,000.00'), 100000000)
  assert.equal(parseAmountCents('1,000,000.01'), null)
  assert.equal(parseAmountCents('10.'), null)
})
