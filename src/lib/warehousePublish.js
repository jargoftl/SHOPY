import { apiRequest } from './api.js'
import { notifyCatalogUpdated } from './catalogEvents.js'
export async function publishWarehouseProduct(product,pricing){
 const {product:published}=await apiRequest(`/api/seller/warehouse/${product.id}/import`,{method:'POST',body:JSON.stringify({publish:true,expectedRetailCents:pricing.retailCents,pricingVersion:pricing.version})})
 notifyCatalogUpdated()
 return published
}
