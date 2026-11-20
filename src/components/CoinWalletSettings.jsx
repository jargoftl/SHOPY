import { useEffect, useState } from 'react'
import { apiRequest, trackedFetch } from '../lib/api.js'

const coins = ['USDT', 'BTC', 'ETH', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC']
const walletApi = '/api/admin/payment-wallets'
const inputClass = 'mt-2 block w-full border p-3 text-sm'

function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the screenshot.'))
    reader.readAsDataURL(file)
  })
}

async function readScreenshot(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error('Choose a PNG or JPEG screenshot up to 2 MB.')
  }
  const url = await readDataUrl(file)
  return { type: file.type, data: url.split(',')[1] }
}

function WalletQr({ coin }) {
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    trackedFetch(`${walletApi}/${coin}/qr`, { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error('Could not load the saved QR screenshot.')
        return response.blob()
      })
      .then(readDataUrl)
      .then(url => {
        if (!controller.signal.aborted) setPreview(url)
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Could not load the saved QR screenshot.')
      })
    return () => controller.abort()
  }, [coin])

  return preview ? <img src={preview} alt={`${coin} wallet QR screenshot`} className="mt-3 max-h-44 max-w-full object-contain" /> :
    <p className="mt-3 text-sm">{error || 'Loading saved QR screenshot…'}</p>
}

export default function CoinWalletSettings() {
  const [wallets, setWallets] = useState(null)
  const [coin, setCoin] = useState('USDT')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    apiRequest(walletApi).then(data => setWallets(data.wallets)).catch(error => setError(error.message))
  }, [])

  const wallet = wallets?.find(wallet => wallet.coin === coin)
  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('qr')
    form.delete('qr')
    const body = Object.fromEntries(form)
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (file.size) body.qr = await readScreenshot(file)
      if (!body.qr && (body.network.trim() !== wallet?.network || body.address.trim() !== wallet?.address)) {
        throw new Error('Upload the QR screenshot for this network and receiving address.')
      }
      const { wallet: saved } = await apiRequest(`${walletApi}/${coin}`, { method: 'PUT', body: JSON.stringify(body) })
      setWallets(previous => [...previous.filter(wallet => wallet.coin !== coin), saved])
      setRevision(value => value + 1)
      setNotice(`${coin} wallet saved.`)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="border bg-white p-5">
    <p className="text-sm text-gray-600">Configure receiving wallets for buyer deposits. Each coin has its own network, receiving address and QR screenshot.</p>
    {wallets && <form key={`${coin}:${revision}`} className="mt-4" onSubmit={save}>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">Wallet type
          <select className={inputClass} value={coin} onChange={event => {
            setCoin(event.target.value)
            setError('')
            setNotice('')
          }}>
            {coins.map(type => <option key={type} value={type}>{type}{wallets.some(wallet => wallet.coin === type) ? ' (saved)' : ''}</option>)}
          </select>
        </label>
        <label className="text-sm">Network
          <input className={inputClass} name="network" defaultValue={wallet?.network ?? ''} required maxLength={100} />
        </label>
        <label className="text-sm">Receiving wallet address
          <input className={inputClass} name="address" defaultValue={wallet?.address ?? ''} required maxLength={500} />
        </label>
        <label className="text-sm">USD per coin
          <input className={inputClass} name="usdRate" defaultValue={wallet?.usdRate ?? ''} required inputMode="decimal" maxLength={30} />
        </label>
        <div className="sm:col-span-2">
          <label className="text-sm">QR code screenshot (PNG or JPEG, up to 2 MB)
            <input className={inputClass} name="qr" type="file" accept="image/png,image/jpeg" required={!wallet?.hasQr} />
          </label>
          {wallet?.hasQr && <WalletQr coin={coin} />}
        </div>
        <button className="w-fit bg-black px-5 py-3 text-sm text-white disabled:opacity-50" type="submit">
          {busy ? 'Saving…' : 'Save wallet'}
        </button>
      </fieldset>
    </form>}
    {!wallets && !error && <p role="status" className="mt-4 text-sm">Loading wallets…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
  </section>
}
