import SiteName from '../components/SiteName.jsx'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check, ChevronRight, CreditCard, Headphones, Heart, Minus, PackageCheck, Plus, Search, ShoppingBag, ShoppingCart, UserRound, X } from 'lucide-react'
import { useCart } from '../context/CartContext.jsx'
import { calculateOrderTotals } from '../lib/orderTotals.js'
import '../styles/cart.css'

const money = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
const Brand = ({ footer = false }) => <Link to="/" className={`cart-brand${footer ? ' cart-brand-footer' : ''}`}><span><SiteName logo /><span className="cart-brand-dot">.</span></span></Link>

export default function CartPage() {
  const { items, itemCount, setQuantity, removeItem, clearCart, subtotal } = useCart()
  const totals = calculateOrderTotals(subtotal)
  return <div className="shopping-cart-page">
    <div className="cart-announcement"><div className="cart-container"><span>Thoughtful finds. Independent stores.</span><span>Your next favorite is waiting. <Link to="/products">Shop now <ArrowRight size={13} /></Link></span><Link to="/messages" className="cart-announcement-contact">Let’s talk <Headphones size={14} /></Link></div></div>
    <header className="cart-site-header"><div className="cart-container cart-header-inner">
      <Brand />
      <nav className="cart-header-nav" aria-label="Main navigation"><Link to="/">Home</Link><Link to="/products">Shop</Link><Link to="/discounts">Offers</Link><Link to="/seller/register">Become a seller</Link><Link to="/messages">Contact us</Link></nav>
      <div className="cart-header-actions"><Link to="/products" aria-label="Search products"><Search size={20} /></Link><Link to="/profile/favorites" aria-label="Favorite products"><Heart size={20} /></Link><Link to="/cart" aria-label={`Shopping cart, ${itemCount} items`} className="cart-header-bag"><ShoppingCart size={20} />{itemCount > 0 && <span>{itemCount}</span>}</Link><Link to="/profile" aria-label="My account"><UserRound size={20} /></Link></div>
    </div></header>
    <section className="cart-title-banner" aria-labelledby="cart-title"><span className="cart-banner-dots cart-banner-dots-left" aria-hidden="true" /><span className="cart-banner-dots cart-banner-dots-right" aria-hidden="true" /><h1 id="cart-title">Shopping Cart</h1><nav aria-label="Breadcrumb"><Link to="/">Home</Link><ChevronRight size={13} /><span aria-current="page">Shopping Cart</span></nav></section>

    <main className="cart-container cart-main">
      {!items.length ? <section className="cart-empty"><span className="cart-empty-icon"><ShoppingBag size={36} strokeWidth={1.4} /></span><p className="cart-eyebrow">A little room for something lovely</p><h2>Your cart is waiting for you.</h2><p>Discover thoughtful finds and make them your own.</p><Link to="/products" className="cart-primary-button">Explore products <ArrowRight size={17} /></Link></section> : <div className="cart-layout">
        <section className="cart-items" aria-label="Cart items">
          <table className="cart-table"><caption className="cart-sr-only">Products in your shopping cart</caption><thead><tr><th scope="col">Product</th><th scope="col">Price</th><th scope="col">Quantity</th><th scope="col">Subtotal</th></tr></thead><tbody>
            {items.map((item) => <tr key={item.cartKey || item.id}>
              <td><div className="cart-product"><button type="button" aria-label={`Remove ${item.name}`} onClick={() => removeItem(item.cartKey || item.id)} className="cart-remove-button"><X size={17} strokeWidth={1.7} /></button><Link to={`/products/${item.id}`} className="cart-product-photo"><img src={item.imageUrl} alt={item.name} /></Link><div className="cart-product-details"><Link to={`/products/${item.id}`} className="cart-product-name">{item.name}</Link><p>{item.selectedColor ? `Color: ${item.selectedColor}` : item.category}{item.selectedSize && <span> · Size: {item.selectedSize}</span>}</p></div></div></td>
              <td className="cart-unit-price" data-label="Price">{money(item.price)}</td>
              <td className="cart-quantity-cell"><div className="cart-quantity"><button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => item.quantity === 1 ? removeItem(item.cartKey || item.id) : setQuantity(item.cartKey || item.id, item.quantity - 1)}><Minus size={16} /></button><span aria-label={`${item.name} quantity`}>{item.quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => setQuantity(item.cartKey || item.id, item.quantity + 1)}><Plus size={16} /></button></div></td>
              <td className="cart-line-total" data-label="Subtotal">{money(item.price * item.quantity)}</td>
            </tr>)}
          </tbody></table>
          <div className="cart-table-actions"><Link to="/products" className="cart-continue-link"><ArrowLeft size={16} /> Continue shopping</Link><button type="button" onClick={clearCart} className="cart-clear-button">Clear Shopping Cart</button></div>
          <div className="cart-reassurance"><Check size={14} /><span>Your selection is saved in this browser.</span></div>
        </section>
        <aside className="cart-summary" aria-label="Order summary"><h2>Order Summary</h2><dl><div><dt>Items</dt><dd>{itemCount}</dd></div><div><dt>Sub Total</dt><dd>{money(subtotal)}</dd></div><div><dt>Shipping</dt><dd>{money(totals.shipping)}</dd></div><div><dt>Taxes <span>(3%)</span></dt><dd>{money(totals.tax)}</dd></div><div className="cart-summary-total"><dt>Total</dt><dd aria-live="polite">{money(totals.total)}</dd></div></dl><Link to="/billing" className="cart-primary-button">Proceed to Checkout <ArrowRight size={16} /></Link><p className="cart-summary-note">Final prices are confirmed when you place your order.</p></aside>
      </div>}
      <section className="cart-benefits" aria-label="Shopping benefits"><div><span><PackageCheck size={33} strokeWidth={1.5} /></span><div><h2>Free Shipping</h2><p>No shipping charge on your order.</p></div></div><div><span><CreditCard size={33} strokeWidth={1.5} /></span><div><h2>Flexible Payment</h2><p>Choose the payment option that suits you.</p></div></div><div><span><Headphones size={33} strokeWidth={1.5} /></span><div><h2>Here to Help</h2><p><Link to="/messages">Reach us through the message center.</Link></p></div></div></section>
    </main>
    <footer className="cart-footer"><div className="cart-container cart-footer-grid"><section><Brand footer /><p>Thoughtful finds for everyday living.<br />Discover something you’ll love.</p><Link to="/products" className="cart-footer-shop-link">Find your next favorite <ArrowRight size={15} /></Link></section><nav aria-label="Explore"><h2>Explore</h2><Link to="/">Home</Link><Link to="/products">Shop all products</Link><Link to="/discounts">Latest offers</Link><Link to="/seller/register">Become a seller</Link></nav><nav aria-label="Customer services"><h2>Customer Services</h2><Link to="/profile">My account</Link><Link to="/profile/orders">My orders</Link><Link to="/profile/favorites">My favorites</Link><Link to="/messages">Contact us</Link></nav><section><h2>A little help?</h2><p>Have a question about a product<br />or your order? We’re here to help.</p><Link to="/messages" className="cart-footer-message">Send a message <ArrowRight size={15} /></Link></section></div><div className="cart-footer-bottom"><div className="cart-container"><p>© {new Date().getFullYear()} <SiteName />. All rights reserved.</p><span>Prices in USD <span aria-hidden="true">·</span> Made for your everyday</span></div></div></footer>
  </div>
}
