const loaders = {
 SuperAdminPage:()=>import('../pages/SuperAdminPage.jsx'),
 AdminPage:()=>import('../pages/AdminPage.jsx'),
 AdminUserDetailsPage:()=>import('../pages/AdminUserDetailsPage.jsx'),
 AdminSellerMetricsPage:()=>import('../pages/AdminSellerMetricsPage.jsx'),
 BuyerProfilePage:()=>import('../pages/BuyerProfilePage.jsx'),
 MessageCenterPage:()=>import('../pages/MessageCenterPage.jsx'),
 SellerDashboardPage:()=>import('../pages/SellerDashboardPage.jsx'),
 SellerFinancePage:()=>import('../pages/SellerFinancePage.jsx'),
 SellerMarketingPage:()=>import('../pages/SellerMarketingPage.jsx'),
 SellerPage:()=>import('../pages/SellerPage.jsx'),
}
const pages = new Map()
export function loadPage(name) {
 if(!pages.has(name)) {
  const promise=loaders[name]()
  pages.set(name,promise)
  promise.catch(()=>{if(pages.get(name)===promise)pages.delete(name)})
 }
 return pages.get(name)
}
export function pageForPath(path) {
 if(/^\/admin\/users\/[^/]+\/?$/.test(path))return 'AdminUserDetailsPage'
 if(path==='/admin/seller-metrics')return 'AdminSellerMetricsPage'
 if(path==='/super-admin')return 'SuperAdminPage'
 if(path==='/admin')return 'AdminPage'
 if(/^\/profile(?:\/[^/]+)?\/?$/.test(path))return 'BuyerProfilePage'
 if(path==='/messages')return 'MessageCenterPage'
 if(path==='/seller')return 'SellerDashboardPage'
 if(['/seller/wallet','/seller/financial-statement','/seller/fund-record'].includes(path))return 'SellerFinancePage'
 if(/^\/seller\/marketing\/(upgrade|history|levels)$/.test(path))return 'SellerMarketingPage'
 if(path==='/seller/products')return 'SellerPage'
 return null
}
export function preloadLink(event) {
 if(globalThis.navigator?.connection?.saveData)return
 const link=event.target?.closest?.('a[href]')
 if(!link||link.hasAttribute('download')||link.target==='_blank')return
 const url=new URL(link.href,window.location.href)
 if(url.origin!==window.location.origin)return
 const page=pageForPath(url.pathname)
 if(page)loadPage(page).catch(()=>{})
}
