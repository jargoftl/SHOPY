import { CircleCheck, CircleHelp, CircleX, Clock3, Truck } from 'lucide-react'

const OrderStatusBadge = ({ status, label }) => {
  const pending = ['pending', 'awaiting_quote', 'awaiting_receipt', 'awaiting_review', 'hold', 'stalled'].includes(status)
  const success = ['paid', 'approved', 'confirmed', 'delivered', 'completed'].includes(status)
  const failed = ['rejected', 'declined', 'cancelled', 'canceled'].includes(status)
  const transit = ['about_to_send', 'sent', 'on_the_way'].includes(status)
  const Icon = failed ? CircleX : success ? CircleCheck : pending ? Clock3 : transit ? Truck : CircleHelp
  const colors = failed ? 'border-[#cccccc] bg-[#f7f7f7] text-[#9b2720]' : success ? 'border-[#cccccc] bg-[#f7f7f7] text-[#111111]' : pending ? 'border-[#cccccc] bg-[#f7f7f7] text-[#111111]' : transit ? 'border-[#cccccc] bg-[#f7f7f7] text-[#111111]' : 'border-[#e5e5e5] bg-[#f7f7f7] text-[#111111]'
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${colors}`}><Icon size={14} className="shrink-0" aria-hidden="true" />{label}</span>
}

export default OrderStatusBadge