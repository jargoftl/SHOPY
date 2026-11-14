let activeRequests = 0
const reportActivity = () => window.dispatchEvent(new CustomEvent('app:request-activity', { detail: activeRequests }))
export const getActiveRequests = () => activeRequests

const track = async (operation, background) => {
  if (!background) { activeRequests += 1; reportActivity() }
  try { return await operation() }
  finally { if (!background) { activeRequests -= 1; reportActivity() } }
}

export const trackedFetch = (path, options = {}, background = false) => track(() => fetch(path, options), background)

export const apiRequest = (path, { background = false, ...options } = {}) => track(async () => {
  const headers = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...options.headers,
  }
  let response
  try {
    response = await fetch(path, {
      ...options,
      credentials: 'include',
      headers,
    })
  } catch {
    throw new Error('Cannot connect to the server. Check your connection and make sure the app server is running.')
  }
  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const error = new Error(data.error || 'The server is unavailable. Please try again later.')
    error.status = response.status
    throw error
  }

  return data
}, background)
