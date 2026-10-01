import { Check } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../../components/Button'
import { Icon } from '../../../components/Icon'
import { useStore } from '../../store'
import { Field, Panel, Toggle, inputClasses } from '../../ui'
import { API } from '../devData'
import { CodeBlock, Mono } from '../devUi'

export default function DevSettings() {
  const { state, dispatch } = useStore()
  const { org } = state.dev
  const [name, setName] = useState(org.name)
  const [supportEmail, setSupportEmail] = useState(org.supportEmail)
  const [saved, setSaved] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    dispatch({ type: 'updateOrg', patch: { name: name.trim(), supportEmail: supportEmail.trim() } })
    setSaved(true)
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Organization settings</h1>

      <div className="grid items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Organization">
            <form onSubmit={submit} onChange={() => setSaved(false)} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Name" hint="Shown to people when your agents ask them to approve a purchase.">
                  {(fieldId) => (
                    <input
                      id={fieldId}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      className={inputClasses}
                    />
                  )}
                </Field>
                <Field label="Support email" hint="Where we send incident and billing notices.">
                  {(fieldId) => (
                    <input
                      id={fieldId}
                      type="email"
                      value={supportEmail}
                      onChange={(event) => setSupportEmail(event.target.value)}
                      required
                      className={inputClasses}
                    />
                  )}
                </Field>
              </div>
              <div className="flex items-center gap-4">
                <Button type="submit" size="sm">
                  Save
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

          <Panel title="Security" flush>
            <ul className="divide-y divide-taupe/30">
              <li className="px-5 py-4 md:px-6">
                <Toggle
                  label="Require two-factor authentication"
                  note="Everyone in the organization must set up 2FA before they can sign in."
                  checked={org.requireTwoFactor}
                  onChange={(value) => dispatch({ type: 'updateOrg', patch: { requireTwoFactor: value } })}
                />
              </li>
              <li className="px-5 py-4 md:px-6">
                <Toggle
                  label="Restrict live keys to known IP addresses"
                  note="Live requests from anywhere else are refused with 403."
                  checked={org.ipAllowlist}
                  onChange={(value) => dispatch({ type: 'updateOrg', patch: { ipAllowlist: value } })}
                />
              </li>
            </ul>
          </Panel>

          <Panel title="Danger zone">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-lg text-sm leading-relaxed text-muted">
                Rolling every key replaces all secrets at once. Deleting the organization removes its
                agents, keys and history for good. Both are switched off in the preview.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" size="sm" disabled>
                  Roll all keys
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Delete organization
                </Button>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="API version">
            <p className="text-3xl tracking-[-0.03em] tabular-nums">{API.version}</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Your organization is pinned to this version. Newer versions never change behaviour
              under you; send the header below to try one on a single request first.
            </p>
            <div className="mt-4">
              <CodeBlock code={`Oryne-Version: ${API.version}`} label="Header" />
            </div>
          </Panel>

          <Panel title="Identifiers">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="text-muted">Organization ID</dt>
                <dd className="mt-1">
                  <Mono>org_7tq2m9xk4d</Mono>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Signed in with</dt>
                <dd className="mt-1">{state.user?.provider ?? 'Email'}</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  )
}
