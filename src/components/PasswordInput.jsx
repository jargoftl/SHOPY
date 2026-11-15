import {useState} from 'react'
import {Eye,EyeOff} from 'lucide-react'
export default function PasswordInput({className='',...props}) {
 const [visible,setVisible]=useState(false)
 return <span className="relative block"><input {...props} type={visible?'text':'password'} className={`${className} pr-12`}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(value=>!value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-gray-600 focus-visible:outline-2 focus-visible:outline-black">{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button></span>
}
