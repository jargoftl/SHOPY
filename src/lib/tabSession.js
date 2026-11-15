// This random selector is not a credential. The session token stays in an HttpOnly cookie.
const key='shop-tab-session'
let memoryScope
export function tabScope(){
 if(memoryScope)return memoryScope
 try{memoryScope=sessionStorage.getItem(key)}catch{/* Keep this tab usable if storage is unavailable. */}
 if(!/^[a-f0-9]{32}$/.test(memoryScope||'')){memoryScope=newScope();try{sessionStorage.setItem(key,memoryScope)}catch{/* In-memory fallback. */}}
 return memoryScope
}
export const newScope=()=>crypto.randomUUID().replaceAll('-','')
export function setTabScope(scope){memoryScope=scope;try{sessionStorage.setItem(key,scope)}catch{/* In-memory fallback. */}window.dispatchEvent(new Event('account-session-changed'))}
export function sessionUrl(path){return `${path}${path.includes('?')?'&':'?'}sessionScope=${tabScope()}`}
