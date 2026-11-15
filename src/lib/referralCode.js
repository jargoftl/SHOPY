const key='shop-referral-code'
export function readReferralCode(){
 const supplied=new URLSearchParams(window.location.search).get('ref')
 if(supplied!==null){const code=supplied.trim().toUpperCase().slice(0,64);try{sessionStorage.setItem(key,code)}catch{}return code}
 try{return sessionStorage.getItem(key)||''}catch{return ''}
}
export function clearReferralCode(){try{sessionStorage.removeItem(key)}catch{}}
