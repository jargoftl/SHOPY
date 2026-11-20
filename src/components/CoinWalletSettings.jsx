import { Plus, QrCode, Wallet } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiRequest, trackedFetch } from '../lib/api.js'
import CryptoWalletIcon, { coinNetworks } from './CryptoWalletIcon.jsx'

const coins = Object.keys(coinNetworks)
const buyerCoins = new Set(['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'DOGE', 'LTC'])
const walletApi = '/api/admin/payment-wallets'
const inputClass = 'mt-2 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm'

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

function WalletQr({ coin, network }) {
  const [preview, setPreview] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    trackedFetch(`${walletApi}/${coin}/qr${network ? `?${new URLSearchParams({network})}` : ''}`, { signal: controller.signal })
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
  }, [coin, network])

  return preview ? <img src={preview} alt={`${coin} wallet QR screenshot`} className="mt-3 max-h-44 max-w-full object-contain" /> :
    <p className="mt-3 text-sm">{error || 'Loading saved QR screenshot…'}</p>
}

export default function CoinWalletSettings() {
  const [wallets, setWallets] = useState(null)
  const [coin, setCoin] = useState('USDT')
  const [extraWallets, setExtraWallets] = useState([])
  const [network, setNetwork] = useState('')
  const [custom, setCustom] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    apiRequest(walletApi).then(data => { setWallets(data.wallets); setExtraWallets(data.networkWallets ?? []) }).catch(error => setError(error.message))
  }, [])

  const primary = wallets?.find(wallet => wallet.coin === coin)
  const additional = extraWallets.filter(wallet => wallet.coin === coin)
  const savedForCoin = [...(primary ? [primary] : []), ...additional]
  const networks = [...new Map([...coinNetworks[coin], ...savedForCoin.map(wallet => wallet.network)]
    .map(name => [name.toLowerCase(), name])).values()]
  const wallet = savedForCoin.find(wallet => wallet.network.toLowerCase() === network.toLowerCase())
  const isPrimary = buyerCoins.has(coin) && (!primary || wallet === primary)

  function chooseNetwork(name) {
    setCustom(false)
    setNetwork(name)
    setError('')
    setNotice('')
  }

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
      const current = savedForCoin.find(wallet => wallet.network.toLowerCase() === body.network.trim().toLowerCase())
      if (!body.qr && (!current?.hasQr || body.address.trim() !== current.address)) {
        throw new Error('Upload the QR screenshot for this network and receiving address.')
      }
      const savePrimary = buyerCoins.has(coin) && (!primary || current === primary)
      body.sellerNetwork = !savePrimary
      const { wallet: saved } = await apiRequest(`${walletApi}/${coin}`, { method: 'PUT', body: JSON.stringify(body) })
      if (savePrimary) setWallets(previous => [...previous.filter(wallet => wallet.coin !== coin), saved])
      else {
        setExtraWallets(previous => [...previous.filter(wallet => wallet.coin !== coin || wallet.network.toLowerCase() !== saved.network.toLowerCase()), saved])
      }
      setNetwork(saved.network)
      setCustom(false)
      setRevision(value => value + 1)
      setNotice(`${coin} on ${saved.network} saved.`)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-sm text-gray-600">Choose a coin and network, then add the receiving address and QR code.</p>
    {wallets && <fieldset disabled={busy} className="mt-4 grid gap-4">
      <div role="group" aria-label="Coin" className="flex flex-wrap gap-2">
        {coins.map(type => <button key={type} type="button" aria-pressed={coin === type} onClick={() => {
          if (coin === type) return
          setCoin(type)
          chooseNetwork('')
        }} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm font-semibold ${coin === type ? 'border-blue-500 bg-blue-50 text-blue-950' : 'border-slate-200 hover:bg-slate-50'}`}>
          <CryptoWalletIcon coin={type}/>{type}
        </button>)}
      </div>
      <div role="group" aria-label={`${coin} networks`} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {networks.map(name => {
          const saved = savedForCoin.find(wallet => wallet.network.toLowerCase() === name.toLowerCase())
          return <button key={name} type="button" aria-pressed={!custom && network === name} onClick={() => chooseNetwork(name)}
            className={`flex min-h-12 items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm ${!custom && network === name ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
            <CryptoWalletIcon network={name}/><span className="flex-1 font-medium">{name}</span>
            {saved && <span className="text-xs text-slate-600">{saved === primary ? 'Primary' : 'Saved'}</span>}
          </button>
        })}
        <button type="button" aria-pressed={custom} onClick={() => { chooseNetwork(''); setCustom(true) }}
          className="flex min-h-12 items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-left text-sm text-blue-800 hover:bg-blue-50">
          <Plus size={18} aria-hidden="true"/>Custom network
        </button>
      </div>
      {(network || custom) && <form key={`${coin}:${network}:${custom}:${revision}`} className="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2" onSubmit={save}>
        {custom ? <label className="text-sm font-medium">Network name
          <input className={inputClass} name="network" required maxLength={100}/>
        </label> : <input type="hidden" name="network" value={network}/>}
        <label className="text-sm font-medium"><span className="flex items-center gap-2"><Wallet size={17} aria-hidden="true"/>Receiving wallet address</span>
          <input className={inputClass} name="address" defaultValue={wallet?.address ?? ''} required maxLength={500}/>
        </label>
        <div className="sm:col-span-2">
          <label className="text-sm font-medium"><span className="flex items-center gap-2"><QrCode size={17} aria-hidden="true"/>QR code screenshot (PNG or JPEG, up to 2 MB)</span>
            <input className={inputClass} name="qr" type="file" accept="image/png,image/jpeg" required={!wallet?.hasQr} />
          </label>
          {wallet?.hasQr && <WalletQr coin={coin} network={isPrimary?undefined:wallet.network} />}
        </div>
        <button className="w-fit bg-black px-5 py-3 text-sm text-white disabled:opacity-50" type="submit">
          {busy ? 'Saving…' : 'Save wallet'}
        </button>
      </form>}
    </fieldset>}
    {!wallets && !error && <p role="status" className="mt-4 text-sm">Loading wallets…</p>}
    {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="mt-4 text-sm">{notice}</p>}
  </section>
}
