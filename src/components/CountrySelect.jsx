import {useEffect,useId,useRef,useState} from 'react'
import {Check,ChevronDown,Globe,Search} from 'lucide-react'
import '../styles/country-select.css'

const countries=[
 {name:'United States',code:'us',search:'USA US America'},
 {name:'Canada',code:'ca',search:'CA'},
 {name:'United Kingdom',code:'gb',search:'UK GB Britain England'},
 {name:'Nigeria',code:'ng',search:'NG'},
 {name:'Germany',code:'de',search:'DE Deutschland'},
 {name:'Japan',code:'jp',search:'JP'},
 {name:'Other',code:null,search:''},
]
function Flag({code}){
 return code?<img src={`/flags/${code}.svg`} alt="" width="24" height="18" className="country-picker-flag"/>:<Globe size={20} aria-hidden="true"/>
}

export default function CountrySelect({name='country',value,onChange,required=false}){
 const id=useId(),root=useRef(null),trigger=useRef(null),search=useRef(null)
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0)
 const current=countries.find(country=>country.name===value)
 const options=countries.filter(country=>`${country.name} ${country.search}`.toLowerCase().includes(query.trim().toLowerCase()))
 useEffect(()=>{
  if(!open)return
  search.current?.focus()
  const outside=event=>{if(!root.current?.contains(event.target))setOpen(false)}
  document.addEventListener('pointerdown',outside)
  return()=>document.removeEventListener('pointerdown',outside)
 },[open])
 useEffect(()=>{if(open)document.getElementById(`${id}-${active}`)?.scrollIntoView({block:'nearest'})},[active,open,id])
 const show=()=>{setQuery('');setActive(Math.max(0,countries.findIndex(country=>country.name===value)));setOpen(true)}
 const close=()=>{setOpen(false);trigger.current?.focus()}
 const choose=country=>{onChange?.({target:{name,value:country.name}});close()}
 const navigate=event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close()}
  else if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault()
   setActive(index=>options.length?(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length:0)
  }else if(event.key==='Enter'){event.preventDefault();if(options[active])choose(options[active])}
 }
 return <div ref={root} className="country-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false)}}>
  <input type="hidden" name={name} value={value}/>
  <button ref={trigger} type="button" className="country-picker-trigger" aria-label={`Country: ${value||'Select country'}`} aria-required={required} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} onClick={()=>open?close():show()} onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();show()}}}>
   <span className="country-picker-value"><Flag code={current?.code}/><span>{current?.name||'Select country'}</span></span><ChevronDown size={18} aria-hidden="true" className={open?'country-picker-chevron-open':''}/>
  </button>
  {open&&<div className="country-picker-panel">
   <div className="country-picker-search"><Search size={17} aria-hidden="true"/><input ref={search} role="combobox" aria-label="Search countries" aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={options[active]?`${id}-${active}`:undefined} placeholder="Search countries…" value={query} onChange={event=>{setQuery(event.target.value);setActive(0)}} onKeyDown={navigate} autoComplete="off"/></div>
   <ul id={`${id}-list`} role="listbox" aria-label="Countries" className="country-picker-list">{options.map((country,index)=><li key={country.name} id={`${id}-${index}`} role="option" aria-selected={country.name===value} className={`country-picker-option ${index===active?'is-active':''}`} onPointerMove={()=>setActive(index)} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(country)}><span className="country-picker-value"><Flag code={country.code}/><span>{country.name}</span></span>{country.name===value&&<Check size={17} aria-hidden="true"/>}</li>)}</ul>
   {!options.length&&<p role="status" className="country-picker-empty">No countries found. Try another search or select Other.</p>}
  </div>}
 </div>
}
