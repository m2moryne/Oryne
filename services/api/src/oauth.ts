import { randomBytes } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { now, type Db } from './db.ts'

/**
 * Sign-in with Google or GitHub. This only proves who someone is; it gives
 * Oryne no power over their money. Their wallet is owned by a passkey on
 * their own device, created right after the first sign-in.
 */

export type Provider = 'google' | 'github'
export const providers: Provider[] = ['google', 'github']

const labels: Record<Provider, string> = { google: 'Google', github: 'GitHub' }

const STATE_TTL = 10 * 60
const SESSION_TTL = 7 * 24 * 3600

type Profile = { id: string; email?: string; name?: string; avatar?: string }

const endpoints = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  github: {
    authorize: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
}

export const callbackUrl = (config: Config, provider: Provider) =>
  `${config.publicUrl}/v1/auth/oauth/${provider}/callback`

function credentials(config: Config, provider: Provider) {
  const app = config.oauth[provider]
  if (!app) throw new HTTPException(404, { message: `${labels[provider]} sign-in is not set up on this server` })
  return app
}

/** Where to send the browser to start signing in. */
export async function startUrl(config: Config, db: Db, provider: Provider) {
  const app = credentials(config, provider)
  const state = randomBytes(16).toString('hex')
  // Reuse the challenges table: nonce = state, address = provider.
  await db.prepare('insert into challenges (nonce, address, message, expires_at) values (?, ?, ?, ?)').run(
    state,
    provider,
    'oauth',
    now() + STATE_TTL,
  )
  const url = new URL(endpoints[provider].authorize)
  url.searchParams.set('client_id', app.clientId)
  url.searchParams.set('redirect_uri', callbackUrl(config, provider))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', endpoints[provider].scope)
  url.searchParams.set('state', state)
  if (provider === 'google') url.searchParams.set('prompt', 'select_account')
  return url.toString()
}

async function exchange(config: Config, provider: Provider, code: string): Promise<string> {
  const app = credentials(config, provider)
  const response = await fetch(endpoints[provider].token, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      code,
      redirect_uri: callbackUrl(config, provider),
      grant_type: 'authorization_code',
    }),
  })
  const data = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string }
  if (!data.access_token) {
    throw new HTTPException(401, { message: data.error_description ?? `${labels[provider]} did not sign you in` })
  }
  return data.access_token
}

async function profile(provider: Provider, token: string): Promise<Profile> {
  if (provider === 'google') {
    const user = (await (
      await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${token}` } })
    ).json()) as { sub: string; email?: string; name?: string; picture?: string }
    return { id: user.sub, email: user.email, name: user.name, avatar: user.picture }
  }
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'oryne' }
  const user = (await (await fetch('https://api.github.com/user', { headers })).json()) as {
    id: number
    login: string
    name?: string
    email?: string
    avatar_url?: string
  }
  let email = user.email ?? undefined
  if (!email) {
    const emails = (await (await fetch('https://api.github.com/user/emails', { headers })).json()) as Array<{
      email: string
      primary: boolean
      verified: boolean
    }>
    email = Array.isArray(emails) ? emails.find((entry) => entry.primary && entry.verified)?.email : undefined
  }
  return { id: String(user.id), email, name: user.name ?? user.login, avatar: user.avatar_url }
}

/** Creates (or refreshes) the user and a session for them. */
export async function createSession(db: Db, subject: string, provider: string, details: Omit<Profile, 'id'> = {}) {
  await db.prepare(
    `insert into users (subject, provider, email, name, avatar, created_at) values (?, ?, ?, ?, ?, ?)
     on conflict(subject) do update set email = excluded.email, name = excluded.name, avatar = excluded.avatar`,
  ).run(subject, provider, details.email ?? null, details.name ?? null, details.avatar ?? null, now())
  const token = randomBytes(32).toString('base64url')
  await db.prepare('insert into sessions (token, address, expires_at) values (?, ?, ?)').run(token, subject, now() + SESSION_TTL)
  return { token, address: subject, expiresAt: now() + SESSION_TTL }
}

/** Finishes sign-in and returns where to send the browser: the dashboard, with the session in the URL fragment. */
export async function finish(config: Config, db: Db, provider: Provider, code?: string, state?: string) {
  const back = (params: Record<string, string>) => `${config.webUrl}/app#${new URLSearchParams(params)}`
  const row = state
    ? (await db.prepare('select address, expires_at from challenges where nonce = ?').get(state) as
        | { address: string; expires_at: number }
        | undefined)
    : undefined
  if (state) await db.prepare('delete from challenges where nonce = ?').run(state)
  if (!code || !row || row.address !== provider || row.expires_at < now()) {
    return back({ error: 'Sign-in expired or was cancelled. Try again.' })
  }
  try {
    const user = await profile(provider, await exchange(config, provider, code))
    const session = await createSession(db, `${provider}:${user.id}`, provider, user)
    return back({ session: Buffer.from(JSON.stringify(session)).toString('base64url') })
  } catch (error) {
    return back({ error: (error as Error).message || 'Sign-in failed' })
  }
}
