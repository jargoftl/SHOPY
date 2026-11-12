export const walletDetailsKey = (request) => JSON.stringify([request.id, request.walletAddress, request.paymentCoin, request.network])

export const walletToShow = (requests, activeRequestId, seenWallets) => {
  if (activeRequestId == null) return null
  return requests.find((request) =>
    request.id === activeRequestId &&
    request.kind === 'deposit' &&
    request.status === 'pending' &&
    request.walletAddress &&
    !seenWallets.has(walletDetailsKey(request)),
  ) || null
}
