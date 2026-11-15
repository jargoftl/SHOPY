export async function testBuyerFollowedStores({req,check,db,buyer,buyerId,sellerId}){
 await db.query('DELETE FROM shop.store_follows WHERE user_id=$1',[buyerId])
 let r=await req('/api/buyer/profile',{},buyer);check('buyer followed count is initially empty',r.status===200&&r.data.follows.length===0)
 const existing=await req(`/api/stores/${sellerId}`);const previousCount=existing.data.products.length
 await db.query('UPDATE shop.seller_profiles SET store_name=$1,store_description=$2,logo_url=$3 WHERE user_id=$4',['Followed fixture store','Hand-picked furniture','https://example.test/store-logo.jpg',sellerId])
 for(let i=0;i<6;i++)await db.query("INSERT INTO shop.products(name,category,price,image_url,seller_id,is_published,is_store_published) VALUES ($1,'Home / Chairs',25,'https://example.test/chair.jpg',$2,1,1)",['Followed fixture product '+i,sellerId])
 const hidden=(await db.query("INSERT INTO shop.products(name,category,price,image_url,seller_id,is_published,is_store_published) VALUES ('Private draft fixture','Home',25,'https://example.test/chair.jpg',$1,0,0) RETURNING id",[sellerId])).rows[0].id
 r=await req(`/api/stores/${sellerId}/follow`,{method:'POST',body:'{}'},buyer);check('buyer can follow a public store',r.status===200&&r.data.isFollowing)
 r=await req('/api/buyer/profile',{},buyer);let followed=r.data.follows.find(store=>store.sellerId===sellerId)
 check('buyer profile provides store card name, real logo and description',r.status===200&&followed?.storeName==='Followed fixture store'&&followed.logoUrl==='https://example.test/store-logo.jpg'&&followed.storeDescription==='Hand-picked furniture')
 check('followed-store card counts only publicly store-published products',followed?.productCount===previousCount+6)
 check('followed-store card includes its real follower total',followed?.followerCount>=1)
 const store=await req(`/api/stores/${sellerId}`,{},buyer);check('visiting a followed store returns all purchasable products',store.status===200&&store.data.products.length===followed.productCount&&store.data.products.length>4&&!store.data.products.some(item=>item.id===hidden))
 const product=store.data.products.find(item=>item.name==='Followed fixture product 0');r=await req(`/api/products/${product.id}`);check('a followed-store product opens its public purchase details',r.status===200&&r.data.product.id===product.id&&r.data.product.sellerId===sellerId)
 r=await req('/api/buyer/profile');check('followed store collection requires buyer authentication',r.status===401)
 await db.query('UPDATE shop.users SET suspended=1 WHERE id=$1',[sellerId]);r=await req('/api/buyer/profile',{},buyer);check('suspended stores are excluded from buyer collection',!r.data.follows.some(item=>item.sellerId===sellerId));await db.query('UPDATE shop.users SET suspended=0 WHERE id=$1',[sellerId])
 r=await req(`/api/stores/${sellerId}/follow`,{method:'POST',body:'{}'},buyer);check('buyer can unfollow the store',r.status===200&&r.data.isFollowing===false)
 r=await req('/api/buyer/profile',{},buyer);check('followed-store count and list update after unfollow',r.data.follows.length===0)
}
