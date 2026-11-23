import {useEffect,useRef,useState} from 'react'
import {AnimatePresence,motion,useReducedMotion} from 'framer-motion'
import {BadgeCheck,Send} from 'lucide-react'
import '../styles/action-feedback.css'

export function ActionFeedbackIcon({processing=false}){
 const Icon=processing?Send:BadgeCheck
 return <span aria-hidden="true" className={`action-feedback-icon${processing?' is-processing':''}`}><Icon size={40} strokeWidth={1.8}/></span>
}

export default function ActionFeedback(){
 const dialog=useRef(null)
 const reducedMotion=useReducedMotion()
 const [feedback,setFeedback]=useState(null)
 useEffect(()=>{
  const update=event=>{
   const next=event.detail
   setFeedback(current=>next.stage==='processing'?next:current?.id!==next.id?current:next.stage==='success'?next:null)
  }
  window.addEventListener('site-action-feedback',update)
  return()=>window.removeEventListener('site-action-feedback',update)
 },[])
 useEffect(()=>{
  const node=dialog.current
  if(feedback&&!node.open)node.showModal()

 },[feedback])
 const processing=feedback?.stage==='processing'
 return <dialog ref={dialog} className="action-feedback-sheet" aria-label={processing?'Processing':'Action complete'}
  onCancel={event=>{event.preventDefault();if(!processing)setFeedback(null)}}>
  <AnimatePresence onExitComplete={()=>{if(!feedback)dialog.current?.close()}}>
   {feedback&&<motion.div key="feedback" className="action-feedback-body"
    initial={reducedMotion?false:{y:100,opacity:0}}
    animate={{y:0,opacity:1}}
    exit={reducedMotion?{opacity:0}:{y:100,opacity:0}}
    transition={{duration:reducedMotion?0:.24,ease:'easeOut'}}>
    <ActionFeedbackIcon processing={processing}/>
    <div role="status"><h2>{processing?'Processing…':'Done'}</h2><p>{feedback.message}</p></div>
    {!processing&&<button type="button" onClick={()=>setFeedback(null)}>Continue</button>}
   </motion.div>}
  </AnimatePresence>
 </dialog>
}
