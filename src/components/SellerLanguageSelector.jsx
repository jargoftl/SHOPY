import {Languages} from 'lucide-react'
import {useSellerLanguage} from '../context/SellerLanguageContext.jsx'
import {sellerLanguages} from '../i18n/sellerLanguage.js'
export default function SellerLanguageSelector(){
 const {language,setLanguage,t}=useSellerLanguage()
 return <label className="seller-language-selector"><span><Languages size={18} aria-hidden="true"/>{t('Language')}</span><select aria-label="Seller dashboard language" value={language} onChange={e=>setLanguage(e.target.value)}>{sellerLanguages.map(l=><option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}</select></label>
}
