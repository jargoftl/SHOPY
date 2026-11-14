import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export default function ThemeToggle() {
  const [preference, setPreference] = useState(() => {
    try { return { theme: window.localStorage.getItem('shopfy-theme') === 'dark' ? 'dark' : 'light', storageError: false } }
    catch { return { theme: 'light', storageError: true } }
  })
  const { theme, storageError } = preference
  useEffect(() => { document.documentElement.dataset.theme = theme }, [theme])
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    try { window.localStorage.setItem('shopfy-theme', next); setPreference({ theme: next, storageError: false }) }
    catch { setPreference({ theme: next, storageError: true }) }
  }
  return <div className="theme-control">
    <button type="button" onClick={toggle} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>{theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}</button>
    {storageError && <span role="status">Theme cannot be saved in this browser.</span>}
  </div>
}
