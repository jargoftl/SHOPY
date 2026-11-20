export async function testStoreDates({req,check,db,cookie,buyer,seller,sellerId}){
 const path=`/api/admin/sellers/${sellerId}/dates`
 const post=(body,who=cookie)=>req(path,{method:'PATCH',body:JSON.stringify(body)},who)
 const original=(await db.query('SELECT u.created_at AS account,p.created_at AS store FROM shop.users u JOIN shop.seller_profiles p ON p.user_id=u.id WHERE u.id=$1',[sellerId])).rows[0]
 const beforeRecords=(await db.query('SELECT id,created_at FROM shop.seller_fund_records WHERE seller_id=$1 ORDER BY id',[sellerId])).rows
 check('anonymous cannot edit store dates',(await req(path,{method:'PATCH',body:JSON.stringify({})})).status===401)
 check('anonymous cannot inspect private date history',(await req(path)).status===401)
 check('buyer cannot change store date',(await post({},buyer)).status===403)
 check('seller cannot change own store date',(await post({},seller)).status===403)
 let r=await req(path,{},cookie);check('admin sees original creation timestamps',r.status===200&&r.data.dates.accountCreatedAt===original.account&&r.data.dates.storeCreatedAt===original.store)
 const initial=r.data.dates.establishedOn
 r=await post({establishedOn:'2021-02-30',expectedEstablishedOn:initial,reason:'Invalid date'});check('impossible business date is rejected',r.status===400)
 r=await post({establishedOn:initial,expectedEstablishedOn:initial});check('date edits work without a written reason',r.status===200)
 r=await post({establishedOn:'2020-01-01',expectedEstablishedOn:initial,reason:'Business started before platform registration'})
 check('admin can set historical business establishment date',r.status===200&&r.data.dates.establishedOn==='2020-01-01')
 check('business date edit is audited with actor and reason',r.data.history.some(h=>JSON.parse(h.details).to==='2020-01-01'&&h.adminName))
 r=await req(`/api/stores/${sellerId}`);check('public store shows business date separately from real creation',r.status===200&&r.data.store.establishedOn==='2020-01-01'&&r.data.store.storeCreatedAt===original.store)
 r=await req('/api/seller/analytics',{},seller);check('seller dashboard receives the same store dates',r.status===200&&r.data.dates.establishedOn==='2020-01-01')
 r=await post({establishedOn:'2022-01-01',expectedEstablishedOn:initial,reason:'Stale browser'});check('stale date updates are rejected',r.status===409)
 r=await post({establishedOn:'2090-01-01',expectedEstablishedOn:'2020-01-01',reason:'Planned opening date'});check('future planned opening date is accepted',r.status===200&&r.data.dates.establishedOn==='2090-01-01')
 r=await post({establishedOn:null,expectedEstablishedOn:'2090-01-01',reason:'Remove business-date override'});check('admin can restore original-only date display',r.status===200&&r.data.dates.establishedOn===null)
 const after=(await db.query('SELECT u.created_at AS account,p.created_at AS store FROM shop.users u JOIN shop.seller_profiles p ON p.user_id=u.id WHERE u.id=$1',[sellerId])).rows[0]
 check('actual account and store creation timestamps remain unchanged',JSON.stringify(after)===JSON.stringify(original))
 const afterRecords=(await db.query('SELECT id,created_at FROM shop.seller_fund_records WHERE seller_id=$1 ORDER BY id',[sellerId])).rows
 check('business-date edits never change financial timestamps',JSON.stringify(afterRecords)===JSON.stringify(beforeRecords))
 const baseline=(await req(path,{},cookie)).data.historical
 const before=(await req(`/api/stores/${sellerId}`)).data.store
 const beforeReviews=(await req(`/api/reviews/store/${sellerId}`)).data
 const historical={followers:baseline.followers+42,itemsSold:125,ratingCount:10,ratingAverage:4.2}
 const request={establishedOn:'2019-06-05',expectedEstablishedOn:null,historical,expectedHistorical:baseline}
 r=await post({...request,historical:{...historical,ratingAverage:null}});check('historical rating count requires an average',r.status===400,r)
 r=await post(request);check('admin saves original date and historical figures',r.status===200&&r.data.historical.itemsSold===125&&r.data.historical.ratingAverage===4.2,r)
 r=await post({...request,expectedEstablishedOn:request.establishedOn});check('stale historical figures cannot overwrite saved details',r.status===409,r)
 const store=(await req(`/api/stores/${sellerId}`)).data.store
 const landing=(await req('/api/stores')).data.stores.find(store=>store.id===sellerId)
 const onlineCount=Number(beforeReviews.summary.count)
 const weighted=(Number(beforeReviews.summary.average)*onlineCount+42)/(onlineCount+10)
 for(const [label,result] of [['storefront',store],['landing cards',landing]]){
  check(label+' adds historical figures to live totals',result.followerCount===before.followerCount+42&&result.itemsSold===before.itemsSold+125&&result.reviewCount===onlineCount+10&&Math.abs(result.averageRating-weighted)<0.00001,result)
 }
 const afterReviews=(await req(`/api/reviews/store/${sellerId}`)).data
 check('historical rating changes summary without creating reviews',Number(afterReviews.summary.count)===onlineCount+10&&Math.abs(Number(afterReviews.summary.average)-weighted)<0.00001&&afterReviews.reviews.length===beforeReviews.reviews.length,afterReviews)
 check('storefront shows original opening date',store.establishedOn===request.establishedOn,store)
 const finalRecords=(await db.query('SELECT id,created_at FROM shop.seller_fund_records WHERE seller_id=$1 ORDER BY id',[sellerId])).rows
 check('historical store figures never create wallet entries',JSON.stringify(finalRecords)===JSON.stringify(beforeRecords))
 await post({establishedOn:null,expectedEstablishedOn:request.establishedOn,historical:baseline,expectedHistorical:historical})

}
