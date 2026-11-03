import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'

/**
 * Email: one layout for everything Oryne sends, and delivery through Resend.
 *
 * The layout is table-based with inline styles, because that's what email
 * clients render reliably (Gmail strips <style> in places, Outlook ignores
 * most modern CSS). The logo is a PNG on the website, since SVG doesn't show
 * in Gmail or Outlook.
 */

/** The public website, where the logo and links live. Always the real site, so emails sent from local runs look right too. */
const SITE = 'https://oryne.org'
const LOGO = `${SITE}/brand/email-logo.png`

const color = {
  page: '#f4f1ec',
  card: '#ffffff',
  border: '#e6e0d6',
  ink: '#0a101a',
  text: '#3d3a36',
  muted: '#8a837a',
  well: '#f7f5f1',
  button: '#202020',
}
const font = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`

/** Escapes text for the HTML part of an email. */
export const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

/** A run of text in a paragraph: plain, or bold. Kept structured so the HTML is always escaped. */
export type Inline = string | { strong: string }
const inlineHtml = (parts: Inline[]) =>
  parts
    .map((part) => (typeof part === 'string' ? escapeHtml(part) : `<strong style="color:${color.ink};font-weight:600">${escapeHtml(part.strong)}</strong>`))
    .join('')
const inlineText = (parts: Inline[]) => parts.map((part) => (typeof part === 'string' ? part : part.strong)).join('')

export type EmailContent = {
  /** The subject line. */
  subject: string
  /** The grey line inbox lists show after the subject. */
  preview: string
  heading: string
  paragraphs: Inline[][]
  /** A one-time code, shown large in its own panel. */
  code?: string
  /** The main action, as a button. */
  button?: { label: string; url: string }
  /** Small print under a divider: why they got it, what to do if they didn't expect it. */
  note?: string
}

/** Builds the HTML and plain-text versions of an email. */
export function renderEmail(content: EmailContent) {
  const paragraphs = content.paragraphs
    .map(
      (parts) =>
        `<p style="margin:0 0 16px;font-family:${font};font-size:15px;line-height:24px;color:${color.text}">${inlineHtml(parts)}</p>`,
    )
    .join('')

  const code = content.code
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td align="center" style="background:${color.well};border:1px solid ${color.border};border-radius:12px;padding:22px 16px">
<div style="font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:34px;line-height:40px;letter-spacing:10px;font-weight:600;color:${color.ink};padding-left:10px">${escapeHtml(content.code)}</div>
</td></tr></table>`
    : ''

  const button = content.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px">
<tr><td align="center" bgcolor="${color.button}" style="border-radius:999px">
<a href="${escapeHtml(content.button.url)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:12px;line-height:16px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:#ffffff;text-decoration:none;border-radius:999px">${escapeHtml(content.button.label)}</a>
</td></tr></table>
<p style="margin:0 0 16px;font-family:${font};font-size:12px;line-height:18px;color:${color.muted}">Or open this link: <a href="${escapeHtml(content.button.url)}" style="color:${color.muted};word-break:break-all">${escapeHtml(content.button.url)}</a></p>`
    : ''

  const note = content.note
    ? `<tr><td style="padding:0 40px"><div style="border-top:1px solid ${color.border};height:1px;line-height:1px;font-size:1px">&nbsp;</div></td></tr>
<tr><td style="padding:20px 40px 36px;font-family:${font};font-size:13px;line-height:20px;color:${color.muted}">${escapeHtml(content.note)}</td></tr>`
    : `<tr><td style="padding:0 0 20px"></td></tr>`

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${color.page};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${escapeHtml(content.preview)}&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;&#8203;&#160;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${color.page}" style="background:${color.page}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
<tr><td style="padding:0 4px 24px">
<a href="${SITE}" target="_blank" style="text-decoration:none"><img src="${LOGO}" width="120" height="32" alt="Oryne" style="display:block;border:0;outline:none;width:120px;height:32px"></a>
</td></tr>
<tr><td bgcolor="${color.card}" style="background:${color.card};border:1px solid ${color.border};border-radius:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:40px 40px 8px">
<h1 style="margin:0 0 20px;font-family:${font};font-size:24px;line-height:30px;font-weight:600;letter-spacing:-0.4px;color:${color.ink}">${escapeHtml(content.heading)}</h1>
${paragraphs}${code}${button}
</td></tr>
${note}
</table>
</td></tr>
<tr><td style="padding:24px 4px 0;font-family:${font};font-size:12px;line-height:19px;color:${color.muted}">
Oryne · Wallets for AI agents, with limits enforced on Stellar.<br>
<a href="${SITE}" target="_blank" style="color:${color.muted};text-decoration:underline">oryne.org</a> &nbsp;·&nbsp; <a href="${SITE}/security" target="_blank" style="color:${color.muted};text-decoration:underline">Security</a> &nbsp;·&nbsp; <a href="mailto:info@oryne.org" style="color:${color.muted};text-decoration:underline">info@oryne.org</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

  const text = [
    content.heading,
    '',
    ...content.paragraphs.map(inlineText).flatMap((line) => [line, '']),
    ...(content.code ? [content.code, ''] : []),
    ...(content.button ? [`${content.button.label}: ${content.button.url}`, ''] : []),
    ...(content.note ? [content.note, ''] : []),
    '—',
    'Oryne · oryne.org · info@oryne.org',
  ].join('\n')

  return { subject: content.subject, html, text }
}

/**
 * Sends one email with Resend from EMAIL_FROM. Without a Resend key, the email
 * is printed to the log instead, so local runs still work.
 */
export async function sendEmail(config: Config, to: string, content: EmailContent) {
  const email = renderEmail(content)
  if (!config.email.resendApiKey) {
    console.log(`email to ${to}: ${email.subject}\n${email.text}`)
    return
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${config.email.resendApiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: config.email.from, to: [to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    console.error('resend', response.status, await response.text().catch(() => ''))
    throw new HTTPException(502, { message: "Couldn't send the email. Try again in a minute." })
  }
}
