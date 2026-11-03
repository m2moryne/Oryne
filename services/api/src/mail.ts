import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'

/**
 * Sends one email with Resend from EMAIL_FROM. Without a Resend key, the email
 * is printed to the log instead, so local runs still work.
 */
export async function sendEmail(config: Config, email: { to: string; subject: string; text: string; html: string }) {
  if (!config.email.resendApiKey) {
    console.log(`email to ${email.to}: ${email.subject}\n${email.text}`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [email.to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error('resend', response.status, await response.text().catch(() => ''))
    throw new HTTPException(502, { message: "Couldn't send the email. Try again in a minute." })
  }
}

/** Escapes text for the HTML part of an email. */
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
