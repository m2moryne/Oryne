import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { HTTPException } from 'hono/http-exception'
import { sendEmail } from './mail.ts'
import type { Config } from './config.ts'
import { now, type Db } from './db.ts'
import { createSession } from './oauth.ts'

/**
 * Sign-in with an email code: the API emails a 6-digit code, the person types
 * it in, and gets a session for the subject "email:<address>". Only a hash of
 * the code is stored; it lasts 10 minutes and allows 5 tries.
 *
 * The same codes confirm a sensitive action for someone already signed in
 * (purpose 'confirm', such as replacing an agent's key). Those are kept under
 * their own key, so they never sign anyone in.
 */

type Purpose = 'sign-in' | 'confirm'
const keyOf = (email: string, purpose: Purpose) => (purpose === 'confirm' ? `confirm:${email}` : email)

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

  async function deliver(email: string, code: string, purpose: Purpose, action?: string) {
    if (!config.email.resendApiKey) {
      // DEV_LOGIN without Resend: local and test runs read the code from the log.
      console.log(`${purpose} code for ${email}: ${code}`)
      return
    }
    if (purpose === 'confirm') {
      await sendEmail(config, email, {
        subject: `${code} is your Oryne confirmation code`,
        preview: 'It expires in 10 minutes.',
        heading: 'Confirm it’s you',
        paragraphs: [[`Enter this code in the Oryne dashboard to ${action ?? 'continue'}.`]],
        code,
        note: 'The code expires in 10 minutes and works once. If you didn’t ask for it, someone may be signed in to your account: sign out everywhere and tell us.',
      })
      return
    }
    await sendEmail(config, email, {
      subject: `${code} is your Oryne sign-in code`,
      preview: 'It expires in 10 minutes.',
      heading: 'Your sign-in code',
      paragraphs: [['Enter this code on the Oryne sign-in page to continue as ', { strong: email }, '.']],
      code,
      note: 'The code expires in 10 minutes and works once. If you didn’t try to sign in, you can ignore this email; nobody can get in without it.',
    })
  }

  return {
    enabled,
    async start(rawEmail: unknown, ip: string, purpose: Purpose = 'sign-in', action?: string) {
      if (!enabled) throw new HTTPException(404, { message: 'Email sign-in is not set up on this server' })
      const email = String(rawEmail ?? '').trim().toLowerCase()
      if (!EMAIL.test(email)) throw new HTTPException(400, { message: 'Enter a valid email address' })
      const key = keyOf(email, purpose)

      const hourAgo = Date.now() - 3_600_000
      const recent = (sentByIp.get(ip) ?? []).filter((at) => at > hourAgo)
      if (recent.length >= PER_IP_HOUR) throw new HTTPException(429, { message: 'Too many codes asked for. Try again later.' })

      const existing = await db.prepare('select sent_at from email_codes where email = ?').get<{ sent_at: number }>(key)
      if (existing && now() - Number(existing.sent_at) < RESEND_AFTER) {
        throw new HTTPException(429, { message: 'A code was just sent. Wait a few seconds before asking again.' })
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
      await db.prepare('delete from email_codes where email = ?').run(key)
      await db
        .prepare('insert into email_codes (email, code_hash, expires_at, tries, sent_at) values (?, ?, ?, 0, ?)')
        .run(key, hashOf(key, code).toString('hex'), now() + CODE_TTL, now())
      recent.push(Date.now())
      sentByIp.set(ip, recent)
      await deliver(email, code, purpose, action)
      return { sent: true }
    },

    /** Checks a confirmation code (sent with purpose 'confirm'); it works once. Throws when wrong. */
    async confirm(rawEmail: unknown, rawCode: unknown) {
      await check(rawEmail, rawCode, 'confirm')
    },

    async verify(rawEmail: unknown, rawCode: unknown) {
      const email = await check(rawEmail, rawCode, 'sign-in')
      return createSession(db, `email:${email}`, 'email', { email })
    },
  }

  async function check(rawEmail: unknown, rawCode: unknown, purpose: Purpose) {
    if (!enabled) throw new HTTPException(404, { message: 'Email codes are not set up on this server' })
    const email = String(rawEmail ?? '').trim().toLowerCase()
    const key = keyOf(email, purpose)
    const code = String(rawCode ?? '').replace(/\s/g, '')
    const row = await db
      .prepare('select code_hash, expires_at, tries from email_codes where email = ?')
      .get<{ code_hash: string; expires_at: number; tries: number }>(key)
    if (!row || Number(row.expires_at) < now()) throw new HTTPException(401, { message: 'That code has expired. Ask for a new one.' })
    if (Number(row.tries) >= MAX_TRIES) throw new HTTPException(429, { message: 'Too many wrong codes. Ask for a new one.' })

    const matches = /^\d{6}$/.test(code) && timingSafeEqual(hashOf(key, code), Buffer.from(row.code_hash, 'hex'))
    if (!matches) {
      await db.prepare('update email_codes set tries = tries + 1 where email = ?').run(key)
      throw new HTTPException(401, { message: 'That code is not right' })
    }
    await db.prepare('delete from email_codes where email = ?').run(key)
    return email
  }
}
