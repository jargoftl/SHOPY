export const BUYER_STORES_UPDATED='buyer:stores-updated'
export function notifyFollowedStoresUpdated(){
 window.dispatchEvent(new Event(BUYER_STORES_UPDATED))
 try{localStorage.setItem(BUYER_STORES_UPDATED,String(Date.now()))}catch{/* Other tabs can still refresh on focus. */}
}
