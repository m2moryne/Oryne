import { Check, LogOut, RotateCcw, Terminal } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { useStore } from '../store'
import { Field, Panel, inputClasses } from '../ui'

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

      <Panel title="Profile" className="xl:col-span-2">
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

      <div className="flex flex-col gap-4">
        <Panel title="Building your own agent?">
          <p className="text-sm leading-relaxed text-muted">
            A separate developer dashboard, with SDKs and keys for building on Oryne, is on its way.
          </p>
          <Link
            to="/developers"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium underline underline-offset-4"
          >
            <Icon icon={Terminal} size={16} /> Developer dashboard
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
