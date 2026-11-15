import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import ProductCard from './ProductCard.jsx'
import { apiRequest } from '../../lib/api.js'
export default function PromotedProducts(){
 const [products,setProducts]=useState([])
 useEffect(()=>{let active=true;apiRequest('/api/promoted-products',{background:true}).then(data=>{if(active)setProducts(data.products)}).catch(()=>{});return()=>{active=false}},[])
 if(!products.length)return null
 return <section className="mx-auto max-w-[1440px] px-5 py-12 md:px-10"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[#555555]"><Sparkles size={14}/> In the spotlight · promoted</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Meet your next favorite.</h2><div className="mt-7 grid grid-cols-2 gap-5 md:grid-cols-4">{products.map(product=><ProductCard key={product.id} product={product}/>)}</div></section>
}
