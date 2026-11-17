import SiteName from './SiteName.jsx'
import SellerAuthStory from './SellerAuthStory.jsx'
import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import '../styles/seller-signup.css'
import '../styles/auth-captcha.css'

export default function AuthLayout({children}){
 return <div className="seller-signup auth-page">
  <header className="signup-header"><Link to="/" className="signup-brand"><SiteName logo /></Link><nav className="signup-login"><Link to="/login">Log in</Link><Link to="/register"><strong>Create account <ArrowRight size={15}/></strong></Link></nav></header>
  <main className="signup-layout"><SellerAuthStory/><section className="signup-panel">{children}</section></main>
  <footer className="signup-footer">A place for independent stores. A thoughtful start for yours.</footer>
 </div>
}
