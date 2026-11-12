import { useCallback, useEffect, useRef, useState } from 'react'
import { apiRequest } from '../lib/api.js'
import { SiteSettingsContext } from './siteSettings.js'

export function SiteSettingsProvider({ children }) {
  const [siteName, setSiteName] = useState('GGU')
  const [error, setError] = useState('')
  const version = useRef(0)

  const refresh = useCallback(async () => {
    const requestVersion = version.current
    try {
      const settings = await apiRequest('/api/site-settings', { cache: 'no-store' })
      if (requestVersion === version.current) {
        setSiteName(settings.siteName)
        setError('')
      }
    } catch (requestError) {
      if (requestVersion === version.current) setError(`Website name updates unavailable: ${requestError.message}`)
    }
  }, [])

  const saveSiteName = useCallback(async (name) => {
    version.current += 1
    try {
      const settings = await apiRequest('/api/admin/site-settings', {
        method: 'PUT',
        body: JSON.stringify({ siteName: name }),
      })
      setSiteName(settings.siteName)
      setError('')
      return settings.siteName
    } finally {
      version.current += 1
    }
  }, [])

  useEffect(() => {
    Promise.resolve().then(refresh)
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  useEffect(() => {
    document.title = `${siteName} | Everyday style`
    document.querySelector('meta[name="description"]')?.setAttribute('content', `${siteName}: considered pieces for everyday style.`)
  }, [siteName])

  return (
    <SiteSettingsContext.Provider value={{ siteName, saveSiteName }}>
      {error && <p role="alert" className="bg-[#fff3df] px-4 py-2 text-center text-sm text-[#704522]">{error}</p>}
      {children}
    </SiteSettingsContext.Provider>
  )
}
