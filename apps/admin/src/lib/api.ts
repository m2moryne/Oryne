/**
 * Client for the Oryne admin API (/v1/admin on the Oryne API). The admin
 * token is kept in sessionStorage: it lasts for this tab and is gone when
 * the browser closes.
 */

export const API_URL = ((import.meta.env.VITE_ORYNE_API_URL as string | undefined) ?? 'https://oryne.onrender.com').replace(/\/$/, '')

const TOKEN_KEY = 'oryne.admin.token'

export function loadToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function saveToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage blocked: the token lasts until reload.
  }
}

export class AdminError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function adminGet<T>(path: string, token: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/v1/admin${path}`, { headers: { authorization: `Bearer ${token}` } })
  } catch {
    throw new AdminError(`Can't reach the API at ${API_URL}. It may be waking up, or this site's address isn't in its CORS_ORIGINS.`, 0)
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string }
  if (response.status === 404) throw new AdminError('The admin API is off. Set ADMIN_TOKEN on the API server.', 404)
  if (!response.ok) throw new AdminError(data.error ?? `API error ${response.status}`, response.status)
  return data
}
