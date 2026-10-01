import { TriangleAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { cn } from '../../lib/cn'
import { id } from '../seed'
import { useStore } from '../store'
import { Dialog, Field, inputClasses } from '../ui'
import { randomToken, scopes, type Mode } from './devData'
import { CopyButton } from './devUi'

/** Name a key, pick what it may do, then see the secret exactly once. */
export function CreateKeyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, dispatch } = useStore()
  const [name, setName] = useState('')
  const [mode, setMode] = useState<Mode>(state.dev.mode)
  const [granted, setGranted] = useState(() => scopes.map((scope) => scope.id))
  const [secret, setSecret] = useState('')

  const close = () => {
    onClose()
    setName('')
    setSecret('')
    setMode(state.dev.mode)
    setGranted(scopes.map((scope) => scope.id))
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    // Placeholder secret. A real one would be issued, and stored hashed, by the API.
    const value = `oryne_${mode}_sk_${randomToken(28)}`
    dispatch({
      type: 'createKey',
      key: {
        id: id('key'),
        name: name.trim(),
        mode,
        last4: value.slice(-4),
        scopes: granted,
        createdAt: new Date().toISOString(),
      },
    })
    setSecret(value)
  }

  const toggle = (scope: string) =>
    setGranted((current) =>
      current.includes(scope) ? current.filter((entry) => entry !== scope) : [...current, scope],
    )

  return (
    <Dialog
      open={open}
      onClose={close}
      title={secret ? 'Save your key' : 'Create an API key'}
      description={
        secret
          ? undefined
          : 'Keys authenticate your server with the Oryne API. Give each service its own.'
      }
    >
      {secret ? (
        <div className="space-y-6">
          <p className="flex gap-3 border border-burgundy/40 px-4 py-3 text-sm leading-relaxed">
            <Icon icon={TriangleAlert} size={18} className="mt-0.5 shrink-0 text-burgundy" />
            This is the only time the full key is shown. Copy it into your secret manager now.
          </p>
          <div className="flex items-center gap-2 border border-taupe/70 bg-cream/60 py-1.5 pl-4 pr-1.5">
            <code className="min-w-0 flex-1 truncate font-mono text-sm">{secret}</code>
            <CopyButton value={secret} className="hover:bg-white" />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-6">
          <Field label="Name" hint="Where this key will be used.">
            {(fieldId) => (
              <input
                id={fieldId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Staging server"
                required
                autoFocus
                className={inputClasses}
              />
            )}
          </Field>

          <fieldset>
            <legend className="text-sm font-medium">Environment</legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ['test', 'Sandbox. No real money moves.'],
                  ['live', 'Real agents, real funds.'],
                ] as const
              ).map(([value, note]) => (
                <label
                  key={value}
                  className={cn(
                    'cursor-pointer border p-3 transition-colors duration-200 has-focus-visible:ring-2 has-focus-visible:ring-burgundy',
                    mode === value ? 'border-charcoal' : 'border-taupe/60 hover:border-charcoal/50',
                  )}
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="sr-only"
                  />
                  <span className="block text-sm font-medium capitalize">{value}</span>
                  <span className="block text-xs text-muted">{note}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium">Permissions</legend>
            <ul className="mt-2 divide-y divide-taupe/30 border border-taupe/60">
              {scopes.map((scope) => (
                <li key={scope.id}>
                  <label className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2.5 sm:flex-nowrap">
                    <input
                      type="checkbox"
                      checked={granted.includes(scope.id)}
                      onChange={() => toggle(scope.id)}
                      className="size-4 accent-charcoal"
                    />
                    <code className="w-36 shrink-0 font-mono text-[0.8125rem]">{scope.id}</code>
                    <span className="text-sm text-muted max-sm:basis-full max-sm:pl-7">{scope.note}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="flex justify-between gap-3">
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={granted.length === 0}>
              Create key
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}
