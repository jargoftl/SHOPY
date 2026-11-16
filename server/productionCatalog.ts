import type {Database} from './database.ts'
// Archive only catalog entries with the exact fingerprints of the original bootstrap data.
// No records are deleted, and purchase/financial snapshots remain intact.
export async function archiveBootstrapCatalog(db:Database,starters:ReadonlyArray<readonly [string,string,number,string,string]>) {
 await db.transaction(async()=>{
  if(await db.prepare("SELECT 1 FROM schema_migrations WHERE name='archive_bootstrap_catalog_v1'").get())return
  const description='Sample product for testing. Image is illustrative and may not depict the item.'
  await db.prepare("UPDATE warehouse_products SET archived=1 WHERE source_host IS NULL AND product_name LIKE 'Sample: %' AND product_json::jsonb->>'description'=?").run(description)
  await db.prepare("UPDATE products SET archived=1,is_published=0,is_store_published=0 WHERE name LIKE 'Sample: %' AND description=?").run(description)
  for(const [name,,price,description,image] of starters)await db.prepare('UPDATE products SET archived=1,is_published=0,is_store_published=0 WHERE seller_id IS NULL AND name=? AND price=? AND description=? AND image_url=?').run(name,price,description,image)
  for(const email of ['demo.partner@ggu.local','demo.northstar@ggu.local','demo.petal@ggu.local']){
   await db.prepare('UPDATE products SET archived=1,is_published=0,is_store_published=0 WHERE seller_id IN (SELECT id FROM users WHERE email=?)').run(email)
   await db.prepare('UPDATE users SET suspended=1 WHERE email=?').run(email)
  }
  await db.prepare("INSERT INTO schema_migrations(name) VALUES('archive_bootstrap_catalog_v1')").run()
 })()
}
