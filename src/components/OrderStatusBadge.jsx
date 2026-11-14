import { CircleCheck, CircleHelp, CircleX, Clock3, Truck } from 'lucide-react'

const OrderStatusBadge = ({ status, label }) => {
  const pending = ['pending', 'awaiting_quote', 'awaiting_receipt', 'awaiting_review', 'hold', 'stalled'].includes(status)
  const success = ['paid', 'approved', 'confirmed', 'delivered', 'completed'].includes(status)
  const failed = ['rejected', 'declined', 'cancelled', 'canceled'].includes(status)
  const transit = ['about_to_send', 'sent', 'on_the_way'].includes(status)
  const Icon = failed ? CircleX : success ? CircleCheck : pending ? Clock3 : transit ? Truck : CircleHelp
  const colors = failed ? 'border-[#f2b8b2] bg-[#fff0ee] text-[#9b2720]' : success ? 'border-[#a7d6b3] bg-[#e8f7ed] text-[#176331]' : pending ? 'border-[#ead28a] bg-[#fff5d5] text-[#775200]' : transit ? 'border-[#a9c8e4] bg-[#edf6ff] text-[#245b85]' : 'border-[#dce4da] bg-[#f3f5f2] text-[#526055]'
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${colors}`}><Icon size={14} className="shrink-0" aria-hidden="true" />{label}</span>
}

export default OrderStatusBadge