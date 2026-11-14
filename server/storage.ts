import { createHash } from 'node:crypto'

// The bucket stays private. Existing API endpoints retain their authorization checks.
export class ObjectStorage {
  private config() {
    const url = process.env.SUPABASE_URL?.replace(/\/$/, '')
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'shop-uploads'
    if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the backend only.')
    if (new URL(url).protocol !== 'https:') throw new Error('SUPABASE_URL must use HTTPS.')
    return { url, key, bucket }
  }
  async verifyBucket(): Promise<void> {
    const { url, key, bucket } = this.config()
    const response = await fetch(`${url}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000),
    })
    if (!response.ok) throw new Error(`Storage bucket check failed (${response.status}). Create the private bucket and verify the backend service key.`)
    const info = await response.json() as { public?: boolean }
    if (info.public !== false) throw new Error('Storage bucket must be private to protect payment receipts.')
  }
  async put(bytes: Buffer, contentType: string): Promise<string> {
    const { url, key, bucket } = this.config()
    const path = 'images/' + createHash('sha256').update(bytes).digest('hex')
    const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`, {
      method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': contentType, 'x-upsert': 'false' },
      body: new Uint8Array(bytes), signal: AbortSignal.timeout(30000),
    })
    // An existing content-addressed object is immutable and safe to reuse.
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { statusCode?: string, error?: string }
      if (!(response.status === 409 || body.statusCode === '409' || body.error === 'Duplicate')) {
        throw new Error(`Storage upload failed (${response.status}). Check the private bucket, service key and storage quota.`)
      }
    }
    return path
  }
  async get(path: string): Promise<Buffer> {
    if (!/^images\/[a-f0-9]{64}$/.test(path)) throw new Error('Invalid storage object path.')
    const { url, key, bucket } = this.config()
    const response = await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${path}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) throw new Error(`Storage download failed (${response.status}).`)
    return Buffer.from(await response.arrayBuffer())
  }
}
