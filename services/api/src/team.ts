import { HTTPException } from 'hono/http-exception'
import type { Config } from './config.ts'
import { newId, now, type Db } from './db.ts'
import { escapeHtml, sendEmail } from './mail.ts'

/**
 * Teams: an account owner invites people by email to work in their account.
 *
 *   admin      everything a developer can do, and manages the team
 *   developer  API keys, webhooks, service listings, the AI debugger; reads everything
 *   viewer     reads everything, changes nothing
 *
 * Nobody but the owner can change the wallet: those changes are signed with
 * the owner's passkey or Freighter account, which never leave the owner.
 *
 * A teammate signs in as themselves (email code, Google or GitHub with the
 * invited address), accepts, and then sends `X-Oryne-Account: <owner>` to act
 * in that account. ownerAuth checks the membership and the role on every call.
 */

export const roles = ['admin', 'developer', 'viewer'] as const
export type Role = (typeof roles)[number]

export type MemberRow = {
  id: string
  account: string
  email: string
  role: Role
  status: 'invited' | 'active'
  subject: string | null
  invited_by: string
  created_at: number
  accepted_at: number | null
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/
const MAX_MEMBERS = 25

/** What a member may change. Reads are open to every role; sessions belong to each person. */
export function checkMemberAccess(role: Role, method: string, path: string) {
  const route = path.replace(/^\/v1/, '')
  if (route.startsWith('/sessions')) {
    throw new HTTPException(403, { message: 'Sign-in sessions belong to each person. Manage yours from your own account.' })
  }
  if (method === 'GET') return
  if (role === 'viewer') throw new HTTPException(403, { message: 'Viewers can see this account but not change it.' })
  if (/^\/(keys|webhooks|services)(\/|$)/.test(route) || /^\/wallets\/[^/]+\/debug$/.test(route)) return
  if (role === 'admin' && /^\/members(\/|$)/.test(route)) return
  throw new HTTPException(403, {
    message: 'Only the account owner can do this. Changes to the wallet are signed with the owner’s passkey or Freighter.',
  })
}

export function createTeam(config: Config, db: Db) {
  /** The email a sign-in subject proves: email-code subjects carry it, OAuth users have it on file. */
  async function emailOf(subject: string) {
    if (subject.startsWith('email:')) return subject.slice(6).toLowerCase()
    const user = await db.prepare('select email from users where subject = ?').get<{ email: string | null }>(subject)
    return user?.email?.toLowerCase() ?? null
  }

  /** How an account is shown to its teammates: its first wallet's name and the owner's email or address. */
  async function accountLabel(account: string) {
    const wallet = await db.prepare('select name from wallets where owner = ? order by created_at limit 1').get<{ name: string }>(account)
    const email = await emailOf(account)
    const who = email ?? (/^G[A-Z2-7]{55}$/.test(account) ? `${account.slice(0, 6)}…${account.slice(-4)}` : account)
    return { name: wallet?.name ?? 'Oryne account', owner: who }
  }

  const memberView = (row: MemberRow) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: Number(row.created_at),
    acceptedAt: row.accepted_at === null ? null : Number(row.accepted_at),
  })

  async function list(account: string) {
    const rows = await db.prepare('select * from members where account = ? order by created_at').all(account) as MemberRow[]
    return { owner: { email: await emailOf(account), account }, members: rows.map(memberView) }
  }

  const roleOf = (value: unknown): Role => {
    if (!roles.includes(value as Role)) throw new HTTPException(400, { message: `role must be one of: ${roles.join(', ')}` })
    return value as Role
  }

  async function invite(account: string, actor: string, input: { email?: unknown; role?: unknown }) {
    const email = String(input.email ?? '').trim().toLowerCase()
    if (!EMAIL.test(email)) throw new HTTPException(400, { message: 'Enter a valid email address' })
    const role = roleOf(input.role ?? 'developer')
    if (email === (await emailOf(account))) throw new HTTPException(400, { message: 'That’s the account owner’s own email' })

    const existing = await db.prepare('select * from members where account = ? and email = ?').get<MemberRow>(account, email)
    if (existing) {
      await db.prepare('update members set role = ? where id = ?').run(role, existing.id)
    } else {
      const count = await db.prepare('select count(*) as n from members where account = ?').get<{ n: number }>(account)
      if (Number(count?.n ?? 0) >= MAX_MEMBERS) throw new HTTPException(429, { message: `At most ${MAX_MEMBERS} teammates per account` })
      await db.prepare(
        "insert into members (id, account, email, role, status, invited_by, created_at) values (?, ?, ?, ?, 'invited', ?, ?)",
      ).run(newId('mem'), account, email, role, actor, now())
    }
    const row = (await db.prepare('select * from members where account = ? and email = ?').get<MemberRow>(account, email))!

    if (row.status === 'invited') {
      const label = await accountLabel(account)
      const link = `${config.webUrl}/app`
      await sendEmail(config, {
        to: email,
        subject: `You’re invited to ${label.name} on Oryne`,
        text: `${label.owner} invited you to their Oryne account "${label.name}" as ${role}.\n\nSign in at ${link} with this email address (${email}) to accept.\n\nIf you weren't expecting this, you can ignore it.`,
        html: `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#222;line-height:1.5">
<p>${escapeHtml(label.owner)} invited you to their Oryne account <strong>${escapeHtml(label.name)}</strong> as ${role}.</p>
<p><a href="${link}" style="display:inline-block;background:#202020;color:#fff;padding:10px 18px;text-decoration:none">Sign in to accept</a></p>
<p style="color:#777">Sign in with this email address (${escapeHtml(email)}). If you weren't expecting this, you can ignore it.</p></div>`,
      })
    }
    return memberView(row)
  }

  async function ownedMember(account: string, id: string) {
    const row = await db.prepare('select * from members where id = ? and account = ?').get<MemberRow>(id, account)
    if (!row) throw new HTTPException(404, { message: 'No such teammate' })
    return row
  }

  async function setRole(account: string, id: string, role: unknown) {
    const row = await ownedMember(account, id)
    await db.prepare('update members set role = ? where id = ?').run(roleOf(role), row.id)
    return memberView((await db.prepare('select * from members where id = ?').get<MemberRow>(row.id))!)
  }

  async function remove(account: string, id: string) {
    const row = await ownedMember(account, id)
    await db.prepare('delete from members where id = ?').run(row.id)
  }

  /** Invitations to this person and the accounts they belong to. */
  async function memberships(actor: string) {
    const email = await emailOf(actor)
    const rows = await db
      .prepare("select * from members where subject = ? or (status = 'invited' and email = ?) order by created_at")
      .all(actor, email ?? '') as MemberRow[]
    return {
      email,
      memberships: await Promise.all(
        rows.map(async (row) => ({ ...memberView(row), account: row.account, label: await accountLabel(row.account) })),
      ),
    }
  }

  async function accept(actor: string, id: string) {
    const email = await emailOf(actor)
    const row = await db.prepare('select * from members where id = ?').get<MemberRow>(id)
    if (!row || row.status !== 'invited' || !email || row.email !== email) throw new HTTPException(404, { message: 'No such invitation' })
    if (row.account === actor) throw new HTTPException(400, { message: 'That’s your own account' })
    await db.prepare("update members set status = 'active', subject = ?, accepted_at = ? where id = ?").run(actor, now(), row.id)
  }

  /** Declines an invitation, or leaves a team. */
  async function leave(actor: string, id: string) {
    const email = await emailOf(actor)
    const row = await db.prepare('select * from members where id = ?').get<MemberRow>(id)
    const mine = row && (row.subject === actor || (row.status === 'invited' && email && row.email === email))
    if (!mine) throw new HTTPException(404, { message: 'No such invitation' })
    await db.prepare('delete from members where id = ?').run(row.id)
  }

  return { list, invite, setRole, remove, memberships, accept, leave }
}
