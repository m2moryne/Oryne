import { Plus, Users } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Dialog, EmptyState, Field, inputClasses, Panel } from '../../app/ui'
import { Button } from '../../components/Button'
import { cn } from '../../lib/cn'
import { api, type Role, type TeamMember } from '../api'
import { useLive } from '../LiveContext'
import { when } from '../shared'

type TeamData = { owner: { email: string | null; account: string }; members: TeamMember[]; you: Role | 'owner' }

export const roleInfo: Record<Role, { label: string; note: string }> = {
  admin: { label: 'Admin', note: 'Everything a developer can do, and invites and removes teammates.' },
  developer: { label: 'Developer', note: 'API keys, webhooks, service listings and the AI debugger. Sees everything.' },
  viewer: { label: 'Viewer', note: 'Sees agents, payments, funds and logs. Changes nothing.' },
}
const allRoles = Object.keys(roleInfo) as Role[]

const short = (account: string) => (/^G[A-Z2-7]{55}$/.test(account) ? `${account.slice(0, 6)}…${account.slice(-4)}` : account)

/** The people who can work in this account, and what each of them may do. */
export default function Team() {
  const live = useLive()
  const token = live.session?.token
  const [data, setData] = useState<TeamData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [inviting, setInviting] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!token) return
    try {
      setData(await api<TeamData>('/v1/members', { token }))
      setError(null)
    } catch (reason) {
      setError((reason as Error).message)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const manage = data?.you === 'owner' || data?.you === 'admin'

  const setRole = async (id: string, role: Role) => {
    if (!token) return
    try {
      await api(`/v1/members/${id}`, { token, method: 'PATCH', body: { role } })
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const remove = async (id: string) => {
    if (!token) return
    try {
      await api(`/v1/members/${id}`, { token, method: 'DELETE' })
      setRemoving(null)
      await load()
    } catch (reason) {
      setError((reason as Error).message)
    }
  }

  const ownerName = data ? (data.owner.email ?? short(data.owner.account)) : '—'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl tracking-[-0.02em]">Team</h1>
          <p className="mt-1 text-sm text-muted">People who can work in this account. Each signs in as themselves.</p>
        </div>
        {manage && (
          <Button size="sm" leadingIcon={Plus} onClick={() => setInviting(true)}>
            Invite
          </Button>
        )}
      </div>

      {error && <p className="border border-burgundy/40 px-4 py-2.5 text-sm text-burgundy">{error}</p>}

      <Panel flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-5 py-3 font-medium md:px-6">Person</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-5 py-3 text-right font-medium md:px-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              <tr>
                <td className="px-5 py-3 md:px-6">
                  <span className="break-all">{ownerName}</span>
                  {data?.you === 'owner' && <span className="ml-2 text-xs text-muted">You</span>}
                </td>
                <td className="px-4 py-3">Owner</td>
                <td className="px-4 py-3 text-muted">Signs wallet changes</td>
                <td />
              </tr>
              {data?.members.map((member) => (
                <tr key={member.id}>
                  <td className="px-5 py-3 md:px-6">
                    <span className="break-all">{member.email}</span>
                    {live.member?.email === member.email && <span className="ml-2 text-xs text-muted">You</span>}
                  </td>
                  <td className="px-4 py-3">
                    {manage ? (
                      <select
                        aria-label={`Role for ${member.email}`}
                        value={member.role}
                        onChange={(event) => setRole(member.id, event.target.value as Role)}
                        className="rounded-md border border-taupe/70 bg-white px-2 py-1 text-sm"
                      >
                        {allRoles.map((role) => (
                          <option key={role} value={role}>
                            {roleInfo[role].label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      roleInfo[member.role].label
                    )}
                  </td>
                  <td className={cn('whitespace-nowrap px-4 py-3', member.status === 'invited' && 'text-muted')}>
                    {member.status === 'active' ? `Joined ${when(member.acceptedAt ?? member.createdAt)}` : `Invited ${when(member.createdAt)}`}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right md:px-6">
                    {!manage ? null : removing === member.id ? (
                      <span className="inline-flex items-center gap-3 text-xs">
                        Remove?
                        <button type="button" onClick={() => remove(member.id)} className="font-medium text-burgundy underline underline-offset-4">
                          Remove
                        </button>
                        <button type="button" onClick={() => setRemoving(null)} className="text-muted underline underline-offset-4">
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setRemoving(member.id)} className="text-xs text-burgundy hover:underline">
                        {member.status === 'invited' ? 'Cancel invite' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.members.length === 0 && (
          <EmptyState icon={Users} title="Just you so far">
            Invite a teammate by email. They sign in with that address and accept.
          </EmptyState>
        )}
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Roles">
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="font-medium">Owner</dt>
              <dd className="mt-0.5 text-muted">Everything, including the wallet: agents, budgets, payees, withdrawals and approvals.</dd>
            </div>
            {allRoles.map((role) => (
              <div key={role}>
                <dt className="font-medium">{roleInfo[role].label}</dt>
                <dd className="mt-0.5 text-muted">{roleInfo[role].note}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <Panel title="Why only the owner changes the wallet">
          <p className="text-sm leading-relaxed text-muted">
            Changes to the wallet, such as adding an agent, raising a budget, approving a payment or withdrawing, are signed
            with the owner’s passkey or Freighter account. That key never leaves the owner, so no teammate, and not Oryne
            either, can move money or change the rules on their behalf.
          </p>
        </Panel>
      </div>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} onInvited={load} />
    </div>
  )
}

function InviteDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const live = useLive()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('developer')
  const [sent, setSent] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setEmail('')
    setRole('developer')
    setSent(null)
    setError(null)
    onClose()
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!live.session) return
    setBusy(true)
    setError(null)
    try {
      const member = await api<TeamMember>('/v1/members', { token: live.session.token, body: { email, role } })
      setSent(member.email)
      onInvited()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={close} title={sent ? 'Invitation sent' : 'Invite a teammate'}>
      {sent ? (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed">
            We emailed <span className="font-medium">{sent}</span>. They sign in to Oryne with that address and accept the
            invitation from their dashboard.
          </p>
          <Button className="w-full" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Email">
            {(id) => (
              <input
                id={id}
                type="email"
                required
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@company.com"
                className={inputClasses}
              />
            )}
          </Field>
          <fieldset>
            <legend className="text-sm font-medium">Role</legend>
            <div className="mt-2 space-y-2">
              {allRoles.map((option) => (
                <label
                  key={option}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-sm',
                    role === option ? 'border-charcoal' : 'border-taupe/60 hover:border-charcoal/50',
                  )}
                >
                  <input type="radio" name="role" value={option} checked={role === option} onChange={() => setRole(option)} className="mt-1 accent-charcoal" />
                  <span>
                    <span className="font-medium">{roleInfo[option].label}</span>
                    <span className="mt-0.5 block text-muted">{roleInfo[option].note}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {error && <p className="text-sm text-burgundy">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Sending…' : 'Send invitation'}
          </Button>
        </form>
      )}
    </Dialog>
  )
}
