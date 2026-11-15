// Retain the background option for callers; requests never block the whole page.
export const trackedFetch = (path, options = {}) => fetch(path, options)

export const apiRequest = async (path, { background: _background, ...options } = {}) => {
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
    error.captchaRequired = Boolean(data.captchaRequired)
    error.priceChanged = Boolean(data.priceChanged)
    throw error
  }

  return data
}
