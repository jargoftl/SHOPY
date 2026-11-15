export const CATALOG_UPDATED = 'catalog:updated'
export function notifyCatalogUpdated() {
  window.dispatchEvent(new Event(CATALOG_UPDATED))
  try { localStorage.setItem(CATALOG_UPDATED, String(Date.now())) } catch { /* Updates in this tab still work. */ }
}
