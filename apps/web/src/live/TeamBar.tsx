import { Mail, Users } from 'lucide-react'
import { useState } from 'react'
import { Icon } from '../components/Icon'
import { cn } from '../lib/cn'
import { api, loadAccount, type Membership, type Role } from './api'
import { useLive } from './LiveContext'

const roleLabel: Record<Role, string> = { admin: 'Admin', developer: 'Developer', viewer: 'Viewer' }

/** Accept or decline an invitation. Accepting switches straight into that account. */
function useInvitation() {
  const live = useLive()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const act = async (invite: Membership, action: 'accept' | 'leave') => {
    if (!live.session) return
    setBusy(invite.id)
    setError(null)
    try {
      await api(`/v1/memberships/${invite.id}/${action}`, { token: live.session.token, body: {} })
      if (action === 'accept') live.switchAccount(invite.account)
      else await live.reloadMemberships()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return { busy, error, act }
}

/** Pick which account to work in: your own, or a team you belong to. For the dark sidebar. */
export function AccountSwitcher() {
  const live = useLive()
  const teams = live.memberships.filter((m) => m.status === 'active')
  if (teams.length === 0) return null
  const current = loadAccount() ?? ''
  return (
    <label className="block border border-cream/15 px-4 py-3">
      <span className="type-label flex items-center gap-1.5 text-cream/60">
        <Icon icon={Users} size={12} /> Account
      </span>
      <select
        value={current}
        onChange={(event) => live.switchAccount(event.target.value || null)}
        className="mt-2 block w-full cursor-pointer truncate bg-transparent text-sm text-cream outline-none [&>option]:text-ink"
      >
        <option value="">Your account</option>
        {teams.map((team) => (
          <option key={team.id} value={team.account}>
            {team.label.name} · {roleLabel[team.role]}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Shown above every dashboard page: whose account this is, and invitations waiting. */
export function TeamNotice({ className }: { className?: string }) {
  const live = useLive()
  const { busy, error, act } = useInvitation()
  const invites = live.memberships.filter((m) => m.status === 'invited')
  const current = live.member ? live.memberships.find((m) => m.account === loadAccount()) : undefined
  if (!live.member && invites.length === 0) return null

  return (
    <div className={cn('space-y-2', className)}>
      {live.member && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-taupe/60 px-4 py-2.5 text-sm">
          <Icon icon={Users} size={16} className="shrink-0 text-muted" />
          <p className="min-w-0 flex-1">
            You’re in <span className="font-medium">{current?.label.name ?? 'a team account'}</span>
            {current && <span className="text-muted"> ({current.label.owner})</span>} as {roleLabel[live.member.role]}. Changes
            to the wallet are signed by the owner.
          </p>
          <button type="button" onClick={() => live.switchAccount(null)} className="text-xs underline underline-offset-4">
            Back to your account
          </button>
        </div>
      )}
      {invites.map((invite) => (
        <div key={invite.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 border border-burgundy/40 px-4 py-2.5 text-sm">
          <Icon icon={Mail} size={16} className="shrink-0 text-burgundy" />
          <p className="min-w-0 flex-1">
            {invite.label.owner} invited you to <span className="font-medium">{invite.label.name}</span> as{' '}
            {roleLabel[invite.role]}.
          </p>
          <span className="flex items-center gap-4 text-xs">
            <button type="button" disabled={!!busy} onClick={() => act(invite, 'accept')} className="font-medium underline underline-offset-4">
              {busy === invite.id ? 'Joining…' : 'Accept'}
            </button>
            <button type="button" disabled={!!busy} onClick={() => act(invite, 'leave')} className="text-muted underline underline-offset-4">
              Decline
            </button>
          </span>
        </div>
      ))}
      {error && <p className="text-sm text-burgundy">{error}</p>}
    </div>
  )
}

/** On the create-wallet screen: join a team instead of, or before, making a wallet. */
export function GateTeams() {
  const live = useLive()
  const { busy, error, act } = useInvitation()
  const invites = live.memberships.filter((m) => m.status === 'invited')
  const teams = live.memberships.filter((m) => m.status === 'active')
  if (invites.length === 0 && teams.length === 0) return null

  return (
    <div className="mb-8 border-b border-taupe/50 pb-8">
      <h2 className="text-lg">{invites.length ? 'You’re invited' : 'Your teams'}</h2>
      <ul className="mt-3 space-y-2">
        {invites.map((invite) => (
          <li key={invite.id} className="rounded-lg border border-taupe/60 px-4 py-3 text-sm">
            <p>
              <span className="font-medium">{invite.label.name}</span> as {roleLabel[invite.role]}
            </p>
            <p className="mt-0.5 break-all text-muted">From {invite.label.owner}</p>
            <div className="mt-3 flex gap-4 text-xs">
              <button type="button" disabled={!!busy} onClick={() => act(invite, 'accept')} className="font-medium underline underline-offset-4">
                {busy === invite.id ? 'Joining…' : 'Accept and open'}
              </button>
              <button type="button" disabled={!!busy} onClick={() => act(invite, 'leave')} className="text-muted underline underline-offset-4">
                Decline
              </button>
            </div>
          </li>
        ))}
        {teams.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => live.switchAccount(team.account)}
              className="w-full rounded-lg border border-taupe/60 px-4 py-3 text-left text-sm hover:border-charcoal/50"
            >
              <span className="font-medium">{team.label.name}</span> as {roleLabel[team.role]}
              <span className="mt-0.5 block break-all text-muted">{team.label.owner}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="mt-3 text-sm text-burgundy">{error}</p>}
    </div>
  )
}
