# Source catalog import

On startup, the backend imports the public catalog from https://shopyggful.shop/ directly into the private Supabase warehouse. Product data is not committed to GitHub. Source code: https://github.com/edc2021/shop_client.

The observed catalog on November 14, 2026 contained 4,022 listings, 2,590 distinct goods IDs, 193,780 source SKU records, and 125 category paths. The importer reads current public category, listing and detail endpoints. Counts can change at the source.

Each page of 25 listings commits transactionally. Completed-page markers and a unique (source host, listing ID) index prevent duplicates after a restart or page reorder. Failed pages do not commit partial data. A later restart resumes incomplete pages. After the final completion marker, restarts do not reimport removed items. No source accounts, customers or payment instructions are imported. Existing warehouse items, users, orders and seller listings remain.

Products are shared with admins and all sellers, but are not automatically published. A seller browses a category/subcategory and clicks Add to my store. The category path, title, description, image gallery, product price, colors and sizes copy automatically.

Original HTML is retained privately for preservation and displayed only as inert plain text. Original SKU options/prices/images remain in sourceDetails and can be viewed in the warehouse. The app still uses a single price per product: a lower discountPrice becomes the price; sellingPrice becomes compare-at price. Source SKU prices are reference data, not a new per-variant checkout pricing system. Missing source options are not invented. Source sales, reviews and inventory are not presented as your store's own.

Images keep their original external URLs; image bytes are not bulk-copied to Supabase. Their availability depends on the original image hosts. No paid services are enabled. The import runs in the background, with four detail reads at a time, so storefront requests remain available. On free Render, sleeping or restarting can delay completion; the next start resumes saved progress. Logs report page progress and completion, never credentials or full product payloads.

Set SKIP_IMPORTED_CATALOG=true only for isolated tests or to pause imports. No new production secret/environment variable is required. The default imports into the existing configured Supabase database.

Run npm test and node --test tests/warehouse-catalog.test.mjs to verify normalized product preservation, paging, atomic retries and duplicate prevention with synthetic fixtures and a local PostgreSQL-compatible test database.
