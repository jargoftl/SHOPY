import { test } from 'node:test'
import assert from 'node:assert/strict'
import { walletDetailsKey, walletToShow } from '../src/lib/walletModal.js'

test('wallet modal only opens for the active pending deposit with new wallet details', () => {
  const first = { id: 1, kind: 'deposit', status: 'pending', walletAddress: 'wallet-a', paymentCoin: 'BTC', network: 'Bitcoin' }
  const second = { ...first, id: 2, walletAddress: 'wallet-b' }
  const seen = new Set()
  assert.equal(walletToShow([first, second], null, seen), null)
  assert.equal(walletToShow([first, second], 2, seen), second)
  assert.equal(walletToShow([first], 2, seen), null)
  assert.equal(walletToShow([{ ...first, status: 'confirmed' }], 1, seen), null)
  assert.equal(walletToShow([{ ...first, kind: 'withdrawal' }], 1, seen), null)
  assert.equal(walletToShow([{ ...first, walletAddress: '' }], 1, seen), null)
  seen.add(walletDetailsKey(first))
  assert.equal(walletToShow([first], 1, seen), null)
  const updated = { ...first, network: 'Updated network' }
  assert.equal(walletToShow([updated], 1, seen), updated)
})
