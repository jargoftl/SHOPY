export async function testReviewsMobile({req,check,db,cookie,buyer,seller,sellerId,sellerForm}){
 const post=(path,body,who=buyer,method='POST')=>req(path,{method,body:JSON.stringify(body)},who)
 const product=(await db.query('SELECT id FROM shop.products WHERE seller_id=$1 AND is_published=1 AND is_store_published=1 LIMIT 1',[sellerId])).rows[0]
 const path='/api/reviews/product/'+product.id
 let r=await post(path,{rating:4,comment:'Useful product. Synthetic review.'});check('buyer can publish product review',r.status===201,r)
 r=await req(path);check('public reviews include score and safe author fields',r.status===200&&Number(r.data.summary.average)===4&&r.data.reviews.some(v=>v.authorRole==='customer')&&!JSON.stringify(r.data).includes('password'),r)
 await post(path,{rating:5,comment:'Updated synthetic review'});r=await req(path);check('one review per buyer updates rather than duplicates',Number(r.data.summary.count)===1&&Number(r.data.summary.average)===5)
 r=await post('/api/reviews/store/'+sellerId,{rating:5,comment:'Synthetic store review'});check('buyer can review store',r.status===201,r)
 r=await post('/api/reviews/store/'+sellerId,{rating:1,comment:'Internal fixture'},cookie)
 const listing=(await req('/api/stores')).data.stores.find(store=>store.id===sellerId)
 const storefront=(await req('/api/stores/'+sellerId)).data.store
 for(const [label,store] of [['landing',listing],['storefront',storefront]]){
  check(label+' shows paid items sold, followers and public rating',store.itemsSold>0&&Number.isInteger(store.followerCount)&&store.reviewCount===1&&store.averageRating===5,store)
 }
 r=await post('/api/reviews/store/'+sellerId,{rating:5,comment:'Own store'},seller);check('seller cannot rate own store',r.status===403)
 r=await post(path,{rating:9,comment:'Invalid'});check('ratings enforce valid score',r.status===400)
 r=await post(path,{rating:3,comment:'<script>alert(1)</script>'},cookie);check('admin can add labeled feedback',r.status===201,r)
 r=await req(path);check('administrator comments are labeled and excluded from buyer average',Number(r.data.summary.average)===5&&Number(r.data.summary.count)===1&&r.data.reviews.some(v=>v.authorRole==='admin'))
 const review=r.data.reviews.find(v=>v.authorRole==='customer')
 r=await req('/api/admin/reviews/'+review.id,{method:'DELETE'},buyer);check('buyer cannot moderate reviews',r.status===403)
 r=await req('/api/admin/reviews/'+review.id,{method:'DELETE'},cookie);check('administrator can delete review',r.status===200)
 r=await req(path);check('deleted review is hidden and score recalculated',!r.data.reviews.some(v=>v.id===review.id)&&Number(r.data.summary.count)===0)
 check('deleted review keeps moderator audit',(await db.query('SELECT deleted_by,deleted_at FROM shop.marketplace_reviews WHERE id=$1',[review.id])).rows[0].deleted_at!==null)
 r=await post('/api/auth/register-seller',{...sellerForm,email:'pin-required@example.test',transactionPin:undefined,confirmTransactionPin:undefined},null);check('seller signup does not require transaction PIN',r.status===201)
 const applicant=(await db.query('SELECT id FROM shop.users WHERE email=$1',[sellerForm.email])).rows[0]
 const security=(await db.query('SELECT pin_hash FROM shop.transaction_security WHERE user_id=$1',[applicant.id])).rows[0]
 check('seller signup does not create or expose a wallet PIN',!security)
 const list='/api/warehouse?available=1&seed=stable-fixture'
 r=await req(list,{},seller);check('available warehouse omits already imported products',r.status===200&&r.data.products.every(p=>!p.storeProductId),r)
 const ids=r.data.products.map(p=>p.id);const again=await req(list,{},seller);check('seeded warehouse pages are stable during selection',JSON.stringify(ids)===JSON.stringify(again.data.products.map(p=>p.id)))
 r=await req('/api/warehouse?available=1&seed=another-fixture',{},seller);check('new warehouse seed shuffles recommendations',r.status===200&&ids.length>1&&JSON.stringify(ids)!==JSON.stringify(r.data.products.map(p=>p.id)))
 const unauthed=await req(path);check('reviews are visible without login',unauthed.status===200)
}
