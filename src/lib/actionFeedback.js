const actions = [
 ['POST', /^\/api\/admin\/(?:buyer|seller)-funding$/, 'Adding funds…', 'Funds added.'],
 ['PATCH', /^\/api\/admin\/users\/\d+\/rewards$/, 'Updating balance…', 'Balance updated.'],
 ['POST', /^\/api\/admin\/sellers\/\d+\/wallet-records$/, 'Recording wallet transaction…', 'Wallet transaction recorded.'],
 ['PATCH', /^\/api\/admin\/seller-applications\/\d+\/review$/, 'Saving application decision…', 'Application decision saved.'],
 ['DELETE', /^\/api\/(?:seller|admin)\/products\/\d+$/, 'Deleting product…', 'Product deleted.'],
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
 const endpoint=path.split('?')[0]
 const action=actions.find(([verb,pattern])=>verb===method&&pattern.test(endpoint))
 const excluded=/^\/api\/(?:notifications|messages)(?:\/|$)|\/(?:ssn|captcha|follow|favorites)(?:\/|$)/
 const isManagementWrite=/^\/api\/(?:admin|seller|buyer|account|purchase-sellers)(?:\/|$)/.test(endpoint)&&
  ['POST','PUT','PATCH','DELETE'].includes(method)&&!excluded.test(endpoint)
 const generic=method==='DELETE'?['Deleting…','Deleted.']:method==='POST'?['Submitting…','Submitted successfully.']:['Saving changes…','Changes saved.']
 const [processing,success]=action?action.slice(2):isManagementWrite?generic:[]

 if(!processing||typeof window==='undefined'||typeof CustomEvent==='undefined')return operation()
 const id=Symbol()
 const announce=feedback=>window.dispatchEvent(new CustomEvent('site-action-feedback',{detail:{id,...feedback}}))
 announce({stage:'processing',message:processing})
 try{
  const result=await operation()
  const succeeded=result?.ok!==false
  // A new seller deposit is followed by a separate receipt upload.
  const preparingDeposit=path==='/api/seller/finance/requests'&&result?.status==='awaiting_receipt'
  let message=success
  if(succeeded&&/^\/api\/admin\/seller-applications\/\d+\/review$/.test(endpoint)){
   const status=result?.application?.status
   if(status==='approved')message='Seller approved.'
   else if(status==='rejected')message='Seller application rejected.'
   else if(status==='needs_changes')message='Changes requested.'
  }
  announce(succeeded&&message&&!preparingDeposit?{stage:'success',message}:{stage:'complete'})
  return result
 }catch(error){
  announce({stage:'complete'})
  throw error
 }
}
