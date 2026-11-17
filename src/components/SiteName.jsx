import { useSiteSettings } from '../context/siteSettings.js'

const SiteName = ({ logo = false }) => {
 const {siteName}=useSiteSettings()
 return logo ? <span className="inline-flex items-center gap-2 align-middle"><img src="/brand-logo.svg" alt="" aria-hidden="true" width="32" height="36" className="h-9 w-8 shrink-0 bg-white object-contain p-1"/><span>{siteName}</span></span> : siteName
}
export default SiteName
