import UiverseSelect from './UiverseSelect.jsx'
import '../styles/admin-wallet-editor.css'
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
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    apiRequest(walletApi).then(data => { setWallets(data.wallets); setExtraWallets(data.networkWallets ?? []) }).catch(error => setError(error.message))
  }, [])

  const primary = wallets?.find(wallet => wallet.coin === coin)
  const savedForCoin = [...(primary ? [primary] : []), ...extraWallets.filter(wallet => wallet.coin === coin)]
  const networks = [...new Set([...coinNetworks[coin], ...(editing ? [editing.network] : [])])]
  const isOccupied = name => savedForCoin.some(wallet => wallet !== editing && wallet.network.toLowerCase() === name.toLowerCase())

  function openWallet(wallet = null) {
    setEditing(wallet)
    if (wallet) setCoin(wallet.coin)
    setNetwork(wallet?.network ?? '')
    setError('')
    setNotice('')
    setRevision(value => value + 1)
  }

  async function save(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const file = form.get('qr')
    form.delete('qr')
    const body = Object.fromEntries(form)
    body.removeQr = form.has('removeQr')
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (file?.size && body.removeQr) throw new Error('Choose either a replacement image or removal.')
      if (file?.size) body.qr = await readScreenshot(file)
      if(!network||isOccupied(network))throw new Error('Choose an available network.')
      const savePrimary = editing ? editing === primary : buyerCoins.has(coin) && !primary
      if(editing)body.originalNetwork=editing.network
      body.sellerNetwork = !savePrimary
      const { wallet: saved } = await apiRequest(`${walletApi}/${coin}`, { method: 'PUT', body: JSON.stringify(body) })
      if (savePrimary) setWallets(previous => [...previous.filter(wallet => wallet.coin !== coin), saved])
      else {
        setExtraWallets(previous => [...previous.filter(wallet => wallet.coin !== coin || wallet.network.toLowerCase() !== (editing?.network??saved.network).toLowerCase()), saved])
      }
      setNetwork(saved.network)
      setEditing(saved)
      setRevision(value => value + 1)
      setNotice(`${coin} on ${saved.network} saved.`)
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-wallet-editor">
    <header className="admin-wallet-heading">
      <div><h2>Receiving wallets</h2><p>Manage the address and QR image for each network.</p></div>
      <button type="button" disabled={busy||!wallets} onClick={()=>openWallet()}><Plus size={17} aria-hidden="true"/> Add wallet</button>
    </header>
    {wallets&&<div className="admin-wallet-layout">
      <div className="admin-wallet-list" aria-label="Saved wallets">
        {[...wallets,...extraWallets].map(saved=><button key={`${saved.coin}:${saved.network}`} type="button" disabled={busy}
          aria-pressed={editing===saved} onClick={()=>openWallet(saved)}>
          <CryptoWalletIcon coin={saved.coin}/><span><strong>{saved.coin}</strong><small>{saved.network}</small></span>
          <span className="admin-wallet-qr-state">{saved.hasQr?'QR saved':'No QR'}</span>
        </button>)}
        {!wallets.length&&!extraWallets.length&&<p className="text-sm">No wallets saved yet.</p>}
      </div>
      <form key={revision} className="admin-wallet-form" onSubmit={save}>
        <h3>{editing?'Edit wallet':'Add wallet'}</h3>
        <fieldset disabled={busy} className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Coin
              <UiverseSelect className="mt-1 w-full" value={coin} renderOption={option=><span className="admin-wallet-option"><CryptoWalletIcon coin={option.value}/>{option.label}</span>} disabled={Boolean(editing)||busy} onChange={event=>{setCoin(event.target.value);setNetwork('')}}>
                {coins.map(type=><option key={type} value={type}>{type}</option>)}
              </UiverseSelect>
            </label>
            <label className="text-sm font-medium">Network
              <UiverseSelect className="mt-1 w-full" name="network" required value={network} renderOption={option=><span className="admin-wallet-option">{option.value&&<CryptoWalletIcon network={option.value}/>}<span>{option.label}</span></span>} onChange={event=>setNetwork(event.target.value)}>
                <option value="" disabled>Choose network</option>
                {networks.map(name=><option key={name} value={name} disabled={isOccupied(name)}>{name}{isOccupied(name)?' · Already saved':''}</option>)}
              </UiverseSelect>
            </label>
          </div>
          <label className="text-sm font-medium"><span className="flex items-center gap-2"><Wallet size={17} aria-hidden="true"/>Receiving wallet address</span>
            <input className={inputClass} name="address" defaultValue={editing?.address ?? ''} required maxLength={500} spellCheck={false} autoComplete="off"/>
          </label>
          <div>
            <label className="text-sm font-medium"><span className="flex items-center gap-2"><QrCode size={17} aria-hidden="true"/>QR image</span>
              <input className={inputClass} name="qr" type="file" accept="image/png,image/jpeg"/>
            </label>
            {editing?.hasQr&&<>
              <WalletQr coin={coin} network={editing===primary?undefined:editing.network}/>
              <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" name="removeQr"/> Remove saved QR image</label>
            </>}
            <p className="mt-2 text-xs text-slate-600">PNG or JPEG, up to 2 MB. Changing the address or network clears the old QR unless you upload a replacement.</p>
          </div>
          <button className="admin-wallet-save" type="submit">{busy?'Saving…':'Save wallet'}</button>
        </fieldset>
      </form>
    </div>}
    {!wallets&&!error&&<p role="status" className="mt-4 text-sm">Loading wallets…</p>}
    {error&&<p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="mt-4 text-sm">{notice}</p>}
  </section>
}
