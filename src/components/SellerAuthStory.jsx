import { ShieldCheck, Store } from 'lucide-react'
export default function SellerAuthStory(){
  return <aside className="signup-story">
          <span className="signup-eyebrow"><span/> THE SELLER COLLECTIVE</span>
          <h2>A little ambition. <br/>A store of <em>your own.</em></h2>
          <p>Bring your products, your perspective and your story. We’ll give them a place to call home.</p>
          <div className="signup-store-art" aria-hidden="true">
            <div className="signup-art-orbit"/>
            <span className="signup-art-spark">✳</span>
            <div className="signup-mini-store"><div className="signup-awning">{Array.from({length:6},(_,i)=><i key={i}/>)}</div><div className="signup-store-window"><Store size={38} strokeWidth={1.2}/><span>YOUR NEXT CHAPTER</span><strong>Your store.</strong></div><div className="signup-store-door"/></div>
            <div className="signup-art-label"><ShieldCheck size={20}/><span>Real people.<strong>Thoughtfully reviewed stores.</strong></span></div>
          </div>
          <div className="signup-story-bottom"><ShieldCheck size={20}/><p>Your identity stays private.</p></div>
        </aside>
}
