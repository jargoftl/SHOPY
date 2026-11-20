import { ShoppingBag, Star, Users } from 'lucide-react'

export default function StoreStats({ store }) {
  const count = value => Number(value ?? 0).toLocaleString()
  const rating = store.reviewCount ? `${Number(store.averageRating).toFixed(1)} / 5` : 'No ratings yet'

  return <ul className="flex flex-wrap gap-x-3 gap-y-2 text-xs">
    <li className="inline-flex items-center gap-1.5"><Users size={14} aria-hidden="true"/>{count(store.followerCount)} followers</li>
    <li className="inline-flex items-center gap-1.5"><ShoppingBag size={14} aria-hidden="true"/>{count(store.itemsSold)} sold</li>
    <li className="inline-flex items-center gap-1.5"><Star size={14} aria-hidden="true"/>{rating}</li>
  </ul>
}
