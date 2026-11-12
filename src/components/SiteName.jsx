import { useSiteSettings } from '../context/siteSettings.js'

const SiteName = () => useSiteSettings().siteName
export default SiteName
