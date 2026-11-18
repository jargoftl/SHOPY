import {applySiteTheme,readSiteTheme} from './lib/siteTheme.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/mobile-usability.css'
import './styles/themes.css'
import App from './App.jsx'
import ProgressToast from './components/ProgressToast.jsx'
import { SiteSettingsProvider } from './context/SiteSettingsContext.jsx'

applySiteTheme(readSiteTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SiteSettingsProvider><App /><ProgressToast /></SiteSettingsProvider>
  </StrictMode>,
)
