import {createContext,useCallback,useContext,useMemo,useState} from 'react'
import {sellerLanguages,sellerTranslations} from '../i18n/sellerLanguage.js'
const Context=createContext(null),storageKey='shopfy-seller-language'
function initialLanguage(){try{const saved=localStorage.getItem(storageKey);return sellerLanguages.some(l=>l.code===saved)?saved:'en'}catch{return 'en'}}
export function SellerLanguageProvider({children}){
 const [language,setSelected]=useState(initialLanguage)
 const setLanguage=useCallback(code=>{if(!sellerLanguages.some(l=>l.code===code))return;setSelected(code);try{localStorage.setItem(storageKey,code)}catch{/* The selection still works when browser storage is disabled. */}},[])
 const t=useCallback(text=>sellerTranslations[language]?.[text]||text,[language])
 const value=useMemo(()=>({language,setLanguage,t}),[language,setLanguage,t])
 return <Context.Provider value={value}>{children}</Context.Provider>
}
export const useSellerLanguage=()=>useContext(Context)||{language:'en',setLanguage:()=>{},t:text=>text}
