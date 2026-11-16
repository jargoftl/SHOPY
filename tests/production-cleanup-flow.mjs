import {Database} from '../dist-server/database.js'
import {archiveBootstrapCatalog} from '../dist-server/productionCatalog.js'
export async function testProductionCleanup({req,check,db,cookie,buyer,sellerId}){
 const description='Sample product for testing. Image is illustrative and may not depict the item.'
 const sample={name:'Sample: Cleanup fixture',category:'Cleanup',price:10,description,imageUrl:'https://example.test/image.jpg'}
 const warehouse=(await db.query('INSERT INTO shop.warehouse_products(product_json) VALUES($1) RETURNING id',[JSON.stringify(sample)])).rows[0].id
 const real=(await db.query('INSERT INTO shop.warehouse_products(product_json) VALUES($1) RETURNING id',[JSON.stringify({...sample,name:'Real listing',description:'A seller provided description'})])).rows[0].id
 const starter=['Bootstrap fixture','Cleanup',10,'Exact starter description','https://example.test/starter.jpg']
 const insert=async(seller,price=10)=>(await db.query('INSERT INTO shop.products(name,category,price,description,image_url,seller_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[starter[0],starter[1],price,starter[3],starter[4],seller])).rows[0].id
 const bootstrap=await insert(null),merchant=await insert(sellerId),different=await insert(null,11)
 const before=(await db.query('SELECT COUNT(*) AS n FROM shop.purchase_orders')).rows[0].n
 await db.query("DELETE FROM shop.schema_migrations WHERE name='archive_bootstrap_catalog_v1'")
 const database=new Database()
 await archiveBootstrapCatalog(database,[starter])
 check('exact bootstrap listing is archived rather than deleted',(await db.query('SELECT archived,is_published FROM shop.products WHERE id=$1',[bootstrap])).rows[0].archived===1)
 check('merchant listing and edited bootstrap are preserved',(await db.query('SELECT archived FROM shop.products WHERE id=ANY($1::bigint[])',[[merchant,different]])).rows.every(r=>r.archived===0))
 check('only exact sample warehouse fixture is archived',(await db.query('SELECT archived FROM shop.warehouse_products WHERE id=$1',[warehouse])).rows[0].archived===1&&(await db.query('SELECT archived FROM shop.warehouse_products WHERE id=$1',[real])).rows[0].archived===0)
 let r=await req('/api/warehouse?q=Cleanup',{},cookie);check('archived samples disappear from warehouse browse',r.status===200&&!r.data.products.some(p=>p.id===warehouse),r)
 r=await req('/api/warehouse/'+warehouse+'/quote',{},cookie);check('archived sample cannot receive publish quote',r.status===404)
 r=await req('/api/seller/warehouse/'+warehouse+'/import',{method:'POST',body:JSON.stringify({publish:true})},cookie);check('archived sample cannot be republished',r.status===404)
 await archiveBootstrapCatalog(database,[starter]);check('cleanup keeps actual purchase history unchanged',(await db.query('SELECT COUNT(*) AS n FROM shop.purchase_orders')).rows[0].n===before)
 r=await req('/api/buyer/orders',{method:'POST',body:JSON.stringify({})},buyer);check('production rejects legacy simulated checkout',r.status===410)
 r=await req('/api/admin/demo-orders/1',{method:'PATCH',body:JSON.stringify({status:'delivered'})},cookie);check('production rejects legacy simulated fulfillment',r.status===410)
}
