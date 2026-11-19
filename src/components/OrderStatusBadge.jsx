import '../styles/order-status.css'
import { CircleCheck, CircleHelp, CircleX, Clock3, Truck } from 'lucide-react'

const OrderStatusBadge = ({ status, label }) => {
  const pending = ['pending', 'awaiting_quote', 'awaiting_receipt', 'awaiting_review', 'hold', 'stalled', 'requested', 'awaiting_transfer', 'awaiting_payment', 'proof_submitted'].includes(status)
  const success = ['paid', 'approved', 'confirmed', 'delivered', 'completed', 'released'].includes(status)
  const failed = ['rejected', 'declined', 'cancelled', 'canceled', 'returned'].includes(status)
  const transit = ['about_to_send', 'sent', 'on_the_way'].includes(status)
  const Icon = failed ? CircleX : success ? CircleCheck : pending ? Clock3 : transit ? Truck : CircleHelp
  const colors = failed ? 'status-failed' : success ? 'status-success' : pending ? 'status-pending' : transit ? 'status-transit' : 'status-neutral'
  return <span className={`order-status-badge inline-flex max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold ${colors}`}><Icon size={14} className="shrink-0" aria-hidden="true" />{label}</span>
}

export default OrderStatusBadge