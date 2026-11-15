import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { categoryPaths, catalogPlainText, normalizeCatalogProduct, seedImportedWarehouse } from '../dist-server/warehouseCatalog.js'

const categories=[{id:'home',name:'Home',subList:[{id:'chairs',name:'Chairs'}]}]
const product=(id)=>({id,goodsId:'goods-'+id,name:'Complete product '+id,categoryId:'home',secondaryCategoryId:'chairs',sellingPrice:25,discountPrice:20,des:'<p>Complete &amp; useful description.</p>',imgDes:'<p><img src="https://example.test/detail.jpg"></p>',imgUrl1:'https://example.test/main.jpg',canSelectAttributes:{skus:[{skuId:'sku-'+id,sellingPrice:25,discountPrice:20,attrs:[{attrName:'color',attrValueName:'Blue'},{attrName:'size',attrValueName:'M'}],img:['https://example.test/sku.jpg']}]}})

test('normalizer preserves product, category, gallery, options and raw source SKU details without executing HTML',()=>{
 const p=normalizeCatalogProduct(product('one'),categoryPaths(categories))
 assert.equal(p.category,'Home / Chairs');assert.equal(p.price,20);assert.equal(p.compareAtPrice,25)
 assert.deepEqual(p.colors,['Blue']);assert.deepEqual(p.sizes,['M']);assert.equal(p.imageUrls.length,2)
 assert.equal(p.description,'Complete & useful description.');assert.equal(p.sourceDetails.skus[0].skuId,'sku-one')
 assert.equal(p.sourceDetails.des,product('one').des)
 assert.equal(catalogPlainText('<script>bad()</script><p>Hello &#x26; &#65;</p>'),'Hello & A')
 assert.throws(()=>normalizeCatalogProduct({...product('one'),categoryId:'missing',secondaryCategoryId:'missing'},new Map()),/Unknown category/)
 assert.throws(()=>normalizeCatalogProduct({...product('one'),name:'x'.repeat(501)},categoryPaths(categories)),/without truncating/)
 const plain=normalizeCatalogProduct({...product('one'),canSelectAttributes:null},categoryPaths(categories));assert.deepEqual(plain.sizes,[])
})

test('direct import saves pages atomically, resumes failures and deduplicates reordered listings',async()=>{
 const db=new PGlite();await db.waitReady
 await db.exec(`CREATE TABLE warehouse_products(id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,product_json TEXT NOT NULL,source_id TEXT GENERATED ALWAYS AS ((product_json::jsonb)->'source'->>'listingId') STORED UNIQUE);CREATE TABLE schema_migrations(name TEXT PRIMARY KEY)`)
 let active=db
 const query=async(sql,params=[])=>{const result=await active.query(sql,params);return{rows:result.rows,rowCount:result.affectedRows}}
 const adapter={query,prepare(sql){return{get:async(...params)=>(await query(sql.replaceAll('?','$1'),params)).rows[0],run:async(...params)=>query(sql.replaceAll('?','$1'),params)}},transaction(fn){return()=>db.transaction(async tx=>{active=tx;try{return await fn()}finally{active=db}})}}
 const originalFetch=globalThis.fetch;let failSecondPage=true;let calls=0
 globalThis.fetch=async(input)=>{
  calls++;const u=new URL(input);assert.equal(u.origin,'https://shopyggful.shop')
  let data
  if(u.pathname.includes('category!tree'))data=categories
  else if(u.pathname.includes('sellerGoods!list')){const page=Number(u.searchParams.get('pageNum'));data={pageList:(page===1?['a','b']:['b','c']).map(product),pageInfo:{lastPage:page===2,totalElements:4}}}
  else {const id=u.searchParams.get('sellerGoodsId');if(id==='c'&&failSecondPage)return Response.json({code:'1'});data=product(id)}
  return Response.json({code:'0',data})
 }
 try{
  await assert.rejects(seedImportedWarehouse(adapter),/not usable/)
  assert.equal(Number((await db.query('SELECT COUNT(*) AS count FROM warehouse_products')).rows[0].count),2)
  assert.equal(Number((await db.query('SELECT COUNT(*) AS count FROM schema_migrations')).rows[0].count),1)
  failSecondPage=false;await seedImportedWarehouse(adapter)
  assert.equal(Number((await db.query('SELECT COUNT(*) AS count FROM warehouse_products')).rows[0].count),3)
  const before=calls;await seedImportedWarehouse(adapter);assert.equal(calls,before)
 }finally{globalThis.fetch=originalFetch;await db.close()}
})

test('warehouse confirmation pricing uses the selected 15 percent margin and conserves cents',async()=>{
 const {warehousePricing}=await import('../dist-server/warehousePricing.js')
 assert.deepEqual(warehousePricing(386),{retailCents:38600,wholesaleCents:32810,profitCents:5790,marginPercent:15,currency:'USD',version:'warehouse-15-v1'})
 for(const price of [0,.01,.05,.99,1.005,25,1000000]){const quote=warehousePricing(price);assert.equal(quote.wholesaleCents+quote.profitCents,quote.retailCents);assert.equal(quote.profitCents,Math.round(quote.retailCents*.15))}
 for(const price of [-1,NaN,Infinity,'386',null,1000001])assert.equal(warehousePricing(price),null)
})
