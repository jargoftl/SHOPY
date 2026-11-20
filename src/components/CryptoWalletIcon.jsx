import { Bitcoin, Coins, Diamond, Link2, Network, Zap } from 'lucide-react'

export const coinNetworks = {
  BTC: ['Bitcoin'], ETH: ['Ethereum (ERC20)', 'Arbitrum One', 'Base', 'Optimism'],
  USDT: ['TRON (TRC20)', 'BNB Smart Chain (BEP20)', 'Ethereum (ERC20)', 'Solana', 'Polygon PoS', 'Arbitrum One', 'Optimism', 'Avalanche C-Chain', 'TON', 'Aptos', 'Plasma', 'Mantle'],
  USDC: ['Ethereum (ERC20)', 'Base', 'Solana', 'Polygon PoS', 'Arbitrum One', 'Avalanche C-Chain'],
  BNB: ['BNB Smart Chain (BEP20)'], SOL: ['Solana'], XRP: ['XRP Ledger'], DOGE: ['Dogecoin'],
  LTC: ['Litecoin'], TRX: ['TRON (TRC20)'], TON: ['TON'], POL: ['Polygon PoS'],
  AVAX: ['Avalanche C-Chain'], ADA: ['Cardano'],
}

const coinIcons = {
  BTC: [Bitcoin, 'bg-amber-100 text-amber-800'],
  ETH: [Diamond, 'bg-indigo-100 text-indigo-800'],
  USDT: [Coins, 'bg-emerald-100 text-emerald-800'],
  USDC: [Coins, 'bg-blue-100 text-blue-800'],
  SOL: [Zap, 'bg-violet-100 text-violet-800'],
  BNB: [Diamond, 'bg-yellow-100 text-yellow-900'],
}

export default function CryptoWalletIcon({ coin, network }) {
  let [Icon, color] = coinIcons[coin] || [Coins, 'bg-slate-100 text-slate-700']
  if (network) {
    const label = network.toLowerCase()
    if (/tron|trc20|avax|avalanche|optimism/.test(label)) [Icon, color] = [Network, 'bg-rose-100 text-rose-800']
    else if (/bep20|bnb|bsc/.test(label)) [Icon, color] = [Diamond, 'bg-yellow-100 text-yellow-900']
    else if (/sol|poly|erc20|eth/.test(label)) [Icon, color] = [Link2, 'bg-violet-100 text-violet-800']
    else [Icon, color] = [Network, 'bg-blue-100 text-blue-800']
  }
  return <span aria-hidden="true" className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}><Icon size={16}/></span>
}
