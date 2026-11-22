import {useEffect,useRef,useState} from 'react'
import {Palette,Check,X} from 'lucide-react'
import {siteThemes,readSiteTheme,applySiteTheme} from '../lib/siteTheme.js'
import '../styles/seller-theme.css'
const sellerThemes=[
 {id:'dark',name:'Dark',accent:'#272b33',soft:'#e6e8ed'},
 {id:'red',name:'Red',accent:'#af253d',soft:'#fff0f2'},
 {id:'green',name:'Green',accent:'#18704e',soft:'#e8f5ee'},
 {id:'orange',name:'Orange',accent:'#a94b08',soft:'#fff3e7'},
]
function readSellerTheme(){
 try{
  const saved=localStorage.getItem('shopy-seller-theme')
  return sellerThemes.some(item=>item.id===saved)?saved:'orange'
 }catch{return 'orange'}
}
export default function ThemeToggle({seller=false}){
 const [theme,setTheme]=useState(readSiteTheme),[open,setOpen]=useState(false),[storageError,setStorageError]=useState(false)
 const [sellerTheme,setSellerTheme]=useState(readSellerTheme)
 const selected=seller?sellerTheme:theme
 const control=useRef(null)
 useEffect(()=>{applySiteTheme(theme)},[theme])
 useEffect(()=>{
  if(!seller)return
  document.documentElement.dataset.sellerTheme=sellerTheme
  return()=>{delete document.documentElement.dataset.sellerTheme}
 },[seller,sellerTheme])
 useEffect(()=>{if(!open)return;const outside=e=>{if(!control.current?.contains(e.target))setOpen(false)},escape=e=>{if(e.key==='Escape'){setOpen(false);control.current?.querySelector('button')?.focus()}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape)}},[open])
 const choose=value=>{if(seller)setSellerTheme(value);else setTheme(applySiteTheme(value));try{localStorage.setItem(seller?'shopy-seller-theme':'shopfy-theme',value);setStorageError(false)}catch{setStorageError(true)}}
 return <div className="theme-control" ref={control}><button type="button" className="theme-trigger" aria-label={seller?'Choose seller workspace colors':'Choose website colors'} aria-expanded={open} aria-controls="website-theme-picker" onClick={()=>setOpen(v=>!v)}><Palette size={20}/></button>{open&&<section id="website-theme-picker" className="theme-panel" aria-label="Website colors"><div className="theme-panel-heading"><div><h2>Your colors</h2></div><button type="button" className="theme-close" aria-label="Close color selector" onClick={()=>setOpen(false)}><X size={17}/></button></div><fieldset><legend className="sr-only">Choose a color theme</legend>{(seller?sellerThemes:siteThemes).map(item=><label key={item.id} className={`theme-option ${selected===item.id?'theme-option-selected':''}`} style={{'--swatch':item.accent,'--swatch-soft':item.soft}}><input type="radio" name="website-theme" value={item.id} checked={selected===item.id} onChange={()=>choose(item.id)}/><span className="theme-swatch" aria-hidden="true"/><span className="theme-option-name">{item.name}</span>{selected===item.id&&<Check size={17} aria-hidden="true"/>}</label>)}</fieldset>{storageError&&<p role="status" className="theme-storage-note">Colors apply now but cannot be saved in this browser.</p>}</section>}</div>
}
