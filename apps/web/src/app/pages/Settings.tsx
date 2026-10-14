import { Check, LogOut, RotateCcw, Terminal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useStore } from '../store'
import type { Prefs } from '../types'
import { Field, Panel, Toggle, inputClasses } from '../ui'

const notifications: Array<{ pref: keyof Prefs; label: string; note: string }> = [
  { pref: 'approvals', label: 'An agent needs my approval', note: 'Sent straight away, so the agent is not left waiting.' },
  { pref: 'declined', label: 'A purchase is declined', note: 'With the reason, and which limit stopped it.' },
  { pref: 'budgetNearlyUsed', label: 'An agent has used 80% of its budget', note: 'Once per agent, per period.' },
  { pref: 'lowBalance', label: 'My balance is running low', note: 'When it can no longer cover what the agents may spend.' },
  { pref: 'weeklySummary', label: 'Weekly summary', note: 'Every Monday: what each agent bought and what it cost.' },
]

export default function Settings() {
  const { state, dispatch } = useStore()
  const navigate = useNavigate()
  const user = state.user!
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'updateUser', user: { name: name.trim(), email: email.trim() } })
    setSaved(true)
  }

  return (
    // The two columns stretch to fill the page; the cards inside fill their column.
    <div className="grid gap-4 lg:min-h-[calc(100svh-2rem)] xl:grid-cols-3">
      <h1 className="sr-only">Settings</h1>

      <div className="flex flex-col gap-4 xl:col-span-2">
      <Panel title="Profile">
        <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Name">
              {(fieldId) => (
                <input
                  id={fieldId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  required
                  className={inputClasses}
                />
              )}
            </Field>
            <Field label="Email">
              {(fieldId) => (
                <input
                  id={fieldId}
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                  className={inputClasses}
                />
              )}
            </Field>
          </div>
          <div className="flex items-center gap-4">
            <Button type="submit" size="sm">
              Save profile
            </Button>
            <p role="status" className="flex items-center gap-1.5 text-sm text-muted">
              {saved && (
                <>
                  <Icon icon={Check} size={15} /> Saved
                </>
              )}
            </p>
          </div>
        </form>
      </Panel>

      <Panel title="Email me when" flush className="flex-1">
        <ul className="divide-y divide-taupe/30">
          {notifications.map((entry) => (
            <li key={entry.pref} className="px-5 py-4 md:px-6">
              <Toggle
                label={entry.label}
                note={entry.note}
                checked={state.prefs[entry.pref]}
                onChange={(value) => dispatch({ type: 'setPref', pref: entry.pref, value })}
              />
            </li>
          ))}
        </ul>
      </Panel>
      </div>

      <div className="flex flex-col gap-4">
        <Panel title="Building your own agent?">
          <p className="text-sm leading-relaxed text-muted">
            The developer console has API keys, webhooks, request logs and SDKs for building on Oryne.
          </p>
          <Link
            to="/dev"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
          >
            <Icon icon={Terminal} size={16} /> Open the developer console
          </Link>
        </Panel>

        <Panel title="Sample data">
          <p className="text-sm leading-relaxed text-muted">
            This dashboard is a preview. The agents, purchases and balance are sample data kept in
            this browser, and new purchases are simulated. Nothing here moves real money.
          </p>
          <Button
            variant="outline"
            size="sm"
            leadingIcon={RotateCcw}
            onClick={() => dispatch({ type: 'reset' })}
            className="mt-5"
          >
            Reset sample data
          </Button>
        </Panel>

        <Panel title="Session" className="flex-1">
          <Button
            variant="outline"
            size="sm"
            leadingIcon={LogOut}
            onClick={() => {
              dispatch({ type: 'signOut' })
              navigate('/')
            }}
          >
            Sign out
          </Button>
        </Panel>
      </div>
    </div>
  )
}
