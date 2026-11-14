export const fulfillmentOptions = [
  ['pending', 'Pending'],
  ['about_to_send', 'About to be shipped'],
  ['sent', 'Dispatched'],
  ['on_the_way', 'On the way'],
  ['delivered', 'Delivered'],
  ['confirmed', 'Confirmed for fulfillment'],
  ['hold', 'On hold'],
  ['stalled', 'Delayed'],
]

export const fulfillmentLabel = (status) => fulfillmentOptions.find(([value]) => value === status)?.[1] || status.replaceAll('_', ' ')

const paymentLabels = {
  awaiting_quote: 'Awaiting payment details',
  awaiting_receipt: 'Awaiting receipt',
  awaiting_review: 'Payment under review',
  paid: 'Payment confirmed',
  rejected: 'Payment rejected',
  declined: 'Payment declined',
  cancelled: 'Order cancelled',
  canceled: 'Order cancelled',
}

export const paymentStatusLabel = (status) => paymentLabels[status] || status.replaceAll('_', ' ')
