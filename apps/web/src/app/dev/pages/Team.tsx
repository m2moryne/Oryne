import { UserPlus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { initials, timeAgo } from '../../format'
import { id } from '../../seed'
import { useStore } from '../../store'
import { Dialog, Field, Panel, inputClasses } from '../../ui'
import { roles, type Member, type Role } from '../devData'

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dispatch } = useStore()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Developer')

  const close = () => {
    onClose()
    setEmail('')
    setRole('Developer')
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const address = email.trim()
    dispatch({
      type: 'inviteMember',
      member: { id: id('mem'), name: address.split('@')[0], email: address, role, status: 'invited' },
    })
    close()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Invite a teammate"
      description="They get an email with a link to join this organization."
    >
      <form onSubmit={submit} className="space-y-6">
        <Field label="Work email">
          {(fieldId) => (
            <input
              id={fieldId}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
              required
              autoFocus
              className={inputClasses}
            />
          )}
        </Field>
        <Field label="Role">
          {(fieldId) => (
            <select
              id={fieldId}
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              className={inputClasses}
            >
              {roles
                .filter((entry) => entry.role !== 'Owner')
                .map((entry) => (
                  <option key={entry.role}>{entry.role}</option>
                ))}
            </select>
          )}
        </Field>
        <div className="flex justify-between gap-3">
          <Button variant="outline" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" size="sm">
            Send invite
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Team() {
  const { state, dispatch } = useStore()
  const [inviting, setInviting] = useState(false)

  // The signed-in person owns the organization; everyone else comes from the store.
  const owner: Member = {
    id: 'mem_owner',
    name: state.user!.name,
    email: state.user!.email,
    role: 'Owner',
    status: 'active',
    lastActiveAt: new Date().toISOString(),
  }
  const members = [owner, ...state.dev.team]

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Team</h1>

      <Panel
        title={`${state.dev.org.name} · ${members.length} members`}
        flush
        action={
          <Button size="sm" leadingIcon={UserPlus} onClick={() => setInviting(true)}>
            Invite
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead>
              <tr className="type-label border-b border-taupe/40 text-muted">
                <th scope="col" className="px-6 py-3 font-medium">Member</th>
                <th scope="col" className="px-4 py-3 font-medium">Role</th>
                <th scope="col" className="px-4 py-3 font-medium">Last active</th>
                <th scope="col" className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-taupe/30">
              {members.map((member) => (
                <tr key={member.id}>
                  <td className="px-6 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-cream text-xs font-semibold">
                        {initials(member.name)}
                      </span>
                      <span>
                        <span className="block font-medium">
                          {member.name}
                          {member.id === 'mem_owner' && <span className="font-normal text-muted"> (you)</span>}
                        </span>
                        <span className="block text-muted">{member.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">{member.role}</td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-muted">
                    {member.status === 'invited'
                      ? 'Invite pending'
                      : member.lastActiveAt
                        ? timeAgo(member.lastActiveAt)
                        : '—'}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    {member.role !== 'Owner' && (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: 'removeMember', id: member.id })}
                        className="text-sm font-medium text-burgundy underline-offset-4 hover:underline"
                      >
                        {member.status === 'invited' ? 'Cancel invite' : 'Remove'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Roles" flush>
        <ul className="grid divide-taupe/30 max-md:divide-y md:grid-cols-2 xl:grid-cols-4 xl:divide-x">
          {roles.map((entry) => (
            <li key={entry.role} className="px-5 py-5 md:px-6">
              <h3 className="text-sm font-medium">{entry.role}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{entry.note}</p>
            </li>
          ))}
        </ul>
      </Panel>

      <InviteDialog open={inviting} onClose={() => setInviting(false)} />
    </div>
  )
}
