import {withActionFeedback} from './actionFeedback.js'
import {tabScope,newScope,setTabScope} from './tabSession.js'
const requestListeners = new Set()
let pendingRequests = 0
export const getPendingRequests = () => pendingRequests
export function subscribePendingRequests(listener) {
  requestListeners.add(listener)
  return () => requestListeners.delete(listener)
}
function updatePendingRequests(delta) {
  pendingRequests += delta
  for (const listener of requestListeners) listener()
}
async function trackRequest(operation, background) {
  if (background) return operation()
  updatePendingRequests(1)
  try { return await operation() }
  finally { updatePendingRequests(-1) }
}
export const trackedFetch = (path, {background, ...options} = {}) => trackRequest(
  () => withActionFeedback(path, options, () => fetch(path, {...options,headers:{'X-Session-Scope':tabScope(),...options.headers}})), background,
)
const performRequest = (path, {background, ...options} = {}) =>
  trackRequest(() => withActionFeedback(path, options, () => fetchData(path, options)), background)

const fetchData = async (path, options) => {
  const freshScope=options.method==='POST'&&['/api/auth/login','/api/auth/register','/api/auth/register-seller'].includes(path)?newScope():null
  const headers = {
    'X-Session-Scope':freshScope||tabScope(),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }
  let response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'include',
      headers,
    })
  } catch {
    throw new Error('Cannot connect to the server. Check your connection and make sure the app server is running.')
  }
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    if(response.status===401){identityCache.clear();identityEpoch++}
    const error = new Error(data.error || 'The server is unavailable. Please try again later.')
    error.status = response.status
    error.captchaRequired = Boolean(data.captchaRequired)
    error.priceChanged = Boolean(data.priceChanged)
    throw error
  }

  if((options.method||'GET').toUpperCase()!=='GET'){inFlight.clear();identityCache.clear();identityEpoch++}
  if(freshScope)setTabScope(freshScope)
  if(path==='/api/auth/logout')window.dispatchEvent(new Event('account-session-changed'))
  return data
}

// Share concurrent reads per tab/account. Cache only account identity for 10s; completed financial data is never cached.
const inFlight=new Map(),identityCache=new Map()
let identityEpoch=0
const IDENTITY_TTL=10000
export const apiRequest=(path,options={})=>{
 if((options.method||'GET').toUpperCase()!=='GET'||options.signal||options.headers)return performRequest(path,options)
 const key=tabScope()+':'+path
 const identity=path==='/api/auth/me'&&options.cache!=='no-store',epoch=identityEpoch
 const cached=identity?identityCache.get(key):null
 if(cached&&Date.now()-cached.time<IDENTITY_TTL)return Promise.resolve(structuredClone(cached.data))
 if(inFlight.has(key))return inFlight.get(key)
 const promise=performRequest(path,options)
 inFlight.set(key,promise)
 promise.then(data=>{if(identity&&data.user&&epoch===identityEpoch)identityCache.set(key,{data:structuredClone(data),time:Date.now()});if(inFlight.get(key)===promise)inFlight.delete(key)},()=>{if(inFlight.get(key)===promise)inFlight.delete(key)})
 return promise
}
