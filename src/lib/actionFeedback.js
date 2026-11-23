const actions = [
 ['POST', /^\/api\/purchases$/, 'Placing your order…'],
 ['POST', /^\/api\/purchases\/\d+\/receipt$/, 'Uploading payment proof…', 'Payment proof submitted for review.'],
 ['POST', /^\/api\/seller\/finance\/requests\/\d+\/receipt$/, 'Uploading payment proof…', 'Payment proof submitted for review.'],
 ['POST', /^\/api\/buyer\/requests\/\d+\/receipt$/, 'Uploading payment proof…', 'Payment proof submitted for review.'],
 ['POST', /^\/api\/(?:seller\/finance|buyer)\/requests$/, 'Submitting wallet request…', 'Wallet request submitted.'],
 ['POST', /^\/api\/seller\/finance\/(?:confirm-purchase|releases)$/, 'Confirming your order…', 'Order confirmed.'],
 ['POST', /^\/api\/admin\/seller-finance\/releases$/, 'Confirming sale…', 'Sale confirmed.'],
 ['PATCH', /^\/api\/admin\/purchases\/\d+\/payment$/, 'Saving payment review…', 'Payment review saved.'],
 ['PATCH', /^\/api\/admin\/seller-finance\/requests\/\d+$/, 'Saving wallet request…', 'Wallet request updated.'],
 ['PUT', /^\/api\/account\/transaction-pin$/, 'Saving your PIN…', 'Your four-digit transaction PIN has been confirmed.'],
 ['PUT', /^\/api\/buyer\/password$/, 'Updating your password…', 'Your password was changed.'],
 ['POST', /^\/api\/auth\/reset-password$/, 'Resetting your password…', 'Your password was reset.'],
 ['POST', /^\/api\/auth\/register(?:-seller)?$/, 'Creating your account…', 'Registration submitted.'],
]

export async function withActionFeedback(path, options, operation) {
 const method=(options.method||'GET').toUpperCase()
 const action=actions.find(([verb,pattern])=>verb===method&&pattern.test(path.split('?')[0]))
 if(!action||typeof window==='undefined'||typeof CustomEvent==='undefined')return operation()
 const id=Symbol()
 const announce=feedback=>window.dispatchEvent(new CustomEvent('site-action-feedback',{detail:{id,...feedback}}))
 announce({stage:'processing',message:action[2]})
 try{
  const result=await operation()
  const succeeded=result?.ok!==false
  // A new seller deposit is followed by a separate receipt upload.
  const preparingDeposit=path==='/api/seller/finance/requests'&&result?.status==='awaiting_receipt'
  announce(succeeded&&action[3]&&!preparingDeposit?{stage:'success',message:action[3]}:{stage:'complete'})
  return result
 }catch(error){
  announce({stage:'complete'})
  throw error
 }
}
