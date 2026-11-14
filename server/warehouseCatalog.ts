import type { Database } from './database.ts'

export interface SourceCategory { id: string, name: string, subList?: SourceCategory[] | null }
interface SourceAttribute { attrName?: string, attrValueName?: string }
interface SourceSku { attrs?: SourceAttribute[], hidden?: boolean, [key: string]: unknown }
export interface SourceProduct {
  id: string, goodsId?: string, name: string, categoryId: string, secondaryCategoryId?: string,
  sellingPrice: number, discountPrice?: number | null, des?: string | null, imgDes?: string | null,
  canSelectAttributes?: { skus?: SourceSku[], [key: string]: unknown } | null,
  [key: string]: unknown
}
const host = 'https://shopyggful.shop'
const marker = 'shopyggful_catalog_2026_11_14_v1'

export function categoryPaths(categories: SourceCategory[], parent: string[] = [], paths = new Map<string, string>()) {
  for (const category of categories) {
    const path = [...parent, category.name]
    paths.set(category.id, path.join(' / '))
    categoryPaths(category.subList || [], path, paths)
  }
  return paths
}

// Preserve the original HTML in sourceDetails; render only inert plain text.
export function catalogPlainText(value: string | null | undefined) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }
  return (value || '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|li|br|div|h[1-6]|tr)\b[^>]*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
      if (!entity.startsWith('#')) return entities[entity.toLowerCase()] || match
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }).replace(/\n\s*\n+/g, '\n\n').trim()
}

export function normalizeCatalogProduct(product: SourceProduct, paths: Map<string, string>) {
  const category = paths.get(product.secondaryCategoryId || '') || paths.get(product.categoryId)
  if (!category) throw new Error(`Unknown category for source listing ${product.id}.`)
  const skus = product.canSelectAttributes?.skus || []
  const options = (names: string[]) => [...new Set(skus.filter(sku => !sku.hidden).flatMap(sku =>
    (sku.attrs || []).filter(attr => names.includes((attr.attrName || '').toLowerCase())).map(attr => attr.attrValueName?.trim()).filter((value): value is string => Boolean(value))))]
  const colors = options(['color', 'colour', '颜色'])
  const sizes = options(['size', '尺寸', '尺码'])
  const requestedImages = Array.from({ length: 10 }, (_, i) => product[`imgUrl${i + 1}`])
  const descriptionImages = [...(product.imgDes || '').matchAll(/<img[^>]+src=["']([^"']+)/gi)].map(match => match[1])
  const imageUrls = [...new Set([...requestedImages, ...descriptionImages].filter((url): url is string => typeof url === 'string' && /^https?:\/\//.test(url)))]
  const price = product.discountPrice !== null && product.discountPrice !== undefined && product.discountPrice >= 0 && product.discountPrice < product.sellingPrice ? product.discountPrice : product.sellingPrice
  const description = [catalogPlainText(product.des), catalogPlainText(product.imgDes)].filter(Boolean).join('\n\n')
  if (!product.id || !product.name?.trim() || product.name.length > 500 || category.length > 200 || !imageUrls.length || imageUrls.length > 50 || colors.length > 300 || sizes.length > 200 || description.length > 100000 || !Number.isFinite(price) || price < 0 || price > 1000000 || [...colors, ...sizes].some(value => value.length > 200)) {
    throw new Error(`Source listing ${product.id} does not fit the product fields; import paused without truncating it.`)
  }
  const sourceDetails: Record<string, unknown> = {}
  for (const key of ['goodsId', 'categoryId', 'secondaryCategoryId', 'sellingPrice', 'discountPrice', 'systemPrice', 'freightAmount', 'goodsTax', 'unit', 'buyMin', 'isShelf', 'attributes', 'des', 'imgDes']) sourceDetails[key] = product[key]
  sourceDetails.canSelectAttributes = product.canSelectAttributes ? { ...product.canSelectAttributes, skus: undefined } : null
  sourceDetails.skus = skus
  return {
    name: product.name.trim(), category, price, compareAtPrice: price < product.sellingPrice ? product.sellingPrice : null,
    description, imageUrl: imageUrls[0], imageUrls, colors, sizes, rating: 0, isPublished: true, isStorePublished: true,
    source: { host: 'shopyggful.shop', listingId: product.id, goodsId: product.goodsId, capturedAt: new Date().toISOString().slice(0, 10) }, sourceDetails,
  }
}

async function sourceRequest<T>(endpoint: string, params: Record<string, string>, method = 'POST'): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`${host}/wap/api/${endpoint}?${new URLSearchParams({ lang: 'en', ...params })}`, { method, signal: AbortSignal.timeout(30000) })
      if (!response.ok) throw new Error(`Source catalog HTTP ${response.status}.`)
      const result = await response.json() as { code: string, data: T }
      if (String(result.code) !== '0' || !result.data) throw new Error('Source catalog response was not usable.')
      return result.data
    } catch (error) {
      if (attempt === 2) throw error
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)))
    }
  }
  throw new Error('Source catalog request failed.')
}

// Source product data goes directly into the private database, never into GitHub.
// Each completed page commits once. Unique source IDs make interrupted/reordered pages safe to retry.
export async function seedImportedWarehouse(db: Database) {
  if (process.env.SKIP_IMPORTED_CATALOG === 'true') return
  if (await db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(marker)) return
  const paths = categoryPaths(await sourceRequest<SourceCategory[]>('category!tree.action', {}, 'GET'))
  let page = 1
  while (true) {
    const result = await sourceRequest<{ pageList: SourceProduct[], pageInfo: { lastPage: boolean, totalElements: number } }>('sellerGoods!list.action', { pageNum: String(page), pageSize: '25' })
    if (!Array.isArray(result.pageList) || (!result.pageList.length && !result.pageInfo.lastPage)) throw new Error('Incomplete source catalog page.')
    const pageMarker = `${marker}_page_${page}`
    if (!(await db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(pageMarker))) {
      const products: ReturnType<typeof normalizeCatalogProduct>[] = []
      // Small concurrent read batches keep the source and free Render instance responsive.
      for (let i = 0; i < result.pageList.length; i += 4) {
        const batch = await Promise.all(result.pageList.slice(i, i + 4).map(async (listing) => {
          const detail = await sourceRequest<SourceProduct>('sellerGoods!info.action', { sellerGoodsId: listing.id })
          if (detail.id !== listing.id) throw new Error('Source listing ID mismatch.')
          return normalizeCatalogProduct(detail, paths)
        }))
        products.push(...batch)
      }
      await db.transaction(async () => {
        if (await db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(pageMarker)) return
        await db.query('INSERT INTO warehouse_products(product_json) SELECT value::text FROM jsonb_array_elements($1::jsonb) ON CONFLICT DO NOTHING', [JSON.stringify(products)])
        await db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run(pageMarker)
      })()
      console.log(`Warehouse source import: page ${page}, ${products.length} listings stored; source reports ${result.pageInfo.totalElements} listings.`)
    }
    if (result.pageInfo.lastPage) break
    page++
    if (page > 10000) throw new Error('Source catalog pagination did not finish.')
  }
  await db.prepare('INSERT INTO schema_migrations(name) VALUES (?) ON CONFLICT DO NOTHING').run(marker)
  console.log('Warehouse source import complete. Products remain unpublished until sellers add them.')
}
