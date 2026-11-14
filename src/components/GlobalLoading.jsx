import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import SiteName from './SiteName.jsx'
import { getActiveRequests } from '../lib/api.js'

export default function GlobalLoading() {
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(false)
  const dialog = useRef(null)
  const location = useLocation()

  useEffect(() => {
    const update = (event) => setActive(event.detail > 0)
    window.addEventListener('app:request-activity', update)
    const timer = window.setTimeout(() => setActive(getActiveRequests() > 0), 0)
    return () => { window.clearTimeout(timer); window.removeEventListener('app:request-activity', update) }
  }, [])
  useEffect(() => {
    if (!active) {
      const timer = window.setTimeout(() => setVisible(false), 0)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => setVisible(true), 250)
    return () => window.clearTimeout(timer)
  }, [active, location.pathname])
  useEffect(() => {
    if (active && visible && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [active, visible])

  if (!visible || !active) return null
  return <dialog ref={dialog} onCancel={(event) => event.preventDefault()} aria-label="Loading" data-preserve-theme className="app-loading">
    <div role="status" aria-live="polite" className="app-loading-content"><span className="app-loading-name"><SiteName /></span></div>
  </dialog>
}
