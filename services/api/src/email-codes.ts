import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { now, type Db } from './db.ts'
import { createSession } from './oauth.ts'

/**
 * Sign-in with an email code: the API emails a 6-digit code, the person types
 * it in, and gets a session for the subject "email:<address>". Only a hash of
 * the code is stored; it lasts 10 minutes and allows 5 tries.
 */

const CODE_TTL = 600
const MAX_TRIES = 5
/** Seconds before the same address can be sent another code. */
const RESEND_AFTER = 30
/** Codes one IP address may ask for per hour. */
const PER_IP_HOUR = 10

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/

const hashOf = (email: string, code: string) => createHash('sha256').update(`${email}:${code}`).digest()

export function createEmailCodes(config: Config, db: Db) {
  const enabled = !!config.email.resendApiKey || config.devLogin
  const sentByIp = new Map<string, number[]>()

  async function deliver(email: string, code: string) {
    if (!config.email.resendApiKey) {
      // DEV_LOGIN without Resend: local and test runs read the code from the log.
      console.log(`sign-in code for ${email}: ${code}`)
      return
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.email.from,
        to: [email],
        subject: `${code} is your Oryne sign-in code`,
        text: `Your Oryne sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, you can ignore this email.`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#222">
<p>Your Oryne sign-in code is</p>
<p style="font-size:28px;letter-spacing:6px;font-weight:600;margin:16px 0">${code}</p>
<p style="color:#777">It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p></div>`,
      }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      console.error('resend', response.status, await response.text().catch(() => ''))
      throw new HTTPException(502, { message: "Couldn't send the email. Try again in a minute." })
    }
  }

  return {
    enabled,
    async start(rawEmail: unknown, ip: string) {
      if (!enabled) throw new HTTPException(404, { message: 'Email sign-in is not set up on this server' })
      const email = String(rawEmail ?? '').trim().toLowerCase()
      if (!EMAIL.test(email)) throw new HTTPException(400, { message: 'Enter a valid email address' })

      const hourAgo = Date.now() - 3_600_000
      const recent = (sentByIp.get(ip) ?? []).filter((at) => at > hourAgo)
      if (recent.length >= PER_IP_HOUR) throw new HTTPException(429, { message: 'Too many codes asked for. Try again later.' })

      const existing = await db.prepare('select sent_at from email_codes where email = ?').get<{ sent_at: number }>(email)
      if (existing && now() - Number(existing.sent_at) < RESEND_AFTER) {
        throw new HTTPException(429, { message: 'A code was just sent. Wait a few seconds before asking again.' })
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await db.prepare('delete from email_codes where email = ?').run(email)
      await db
        .prepare('insert into email_codes (email, code_hash, expires_at, tries, sent_at) values (?, ?, ?, 0, ?)')
        .run(email, hashOf(email, code).toString('hex'), now() + CODE_TTL, now())
      recent.push(Date.now())
      sentByIp.set(ip, recent)
      await deliver(email, code)
      return { sent: true }
    },

    async verify(rawEmail: unknown, rawCode: unknown) {
      if (!enabled) throw new HTTPException(404, { message: 'Email sign-in is not set up on this server' })
      const email = String(rawEmail ?? '').trim().toLowerCase()
      const code = String(rawCode ?? '').replace(/\s/g, '')
      const row = await db
        .prepare('select code_hash, expires_at, tries from email_codes where email = ?')
        .get<{ code_hash: string; expires_at: number; tries: number }>(email)
      if (!row || Number(row.expires_at) < now()) throw new HTTPException(401, { message: 'That code has expired. Ask for a new one.' })
      if (Number(row.tries) >= MAX_TRIES) throw new HTTPException(429, { message: 'Too many wrong codes. Ask for a new one.' })

      const matches = /^\d{6}$/.test(code) && timingSafeEqual(hashOf(email, code), Buffer.from(row.code_hash, 'hex'))
      if (!matches) {
        await db.prepare('update email_codes set tries = tries + 1 where email = ?').run(email)
        throw new HTTPException(401, { message: 'That code is not right' })
      }
      await db.prepare('delete from email_codes where email = ?').run(email)
      return createSession(db, `email:${email}`, 'email', { email })
    },
  }
}
