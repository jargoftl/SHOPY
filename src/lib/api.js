export const apiRequest = async (path, options = {}) => {
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
}
