import { CheckCircle2, Clock } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { Icon } from '../components/Icon'
import { Loader } from '../components/Loader'
import { Field, inputClasses } from '../app/ui'
import { cn } from '../lib/cn'
import { api, isAccount, MODE, type AccountKind } from './api'
import { DEV_BASE } from './dev/LiveDevShell'
import { useLive } from './LiveContext'
import { createPasskey } from './passkey'
import { GateTeams } from './TeamBar'

const kindOptions: Array<{ kind: AccountKind; title: string; note: string }> = [
  { kind: 'owner', title: 'Give my AI agents a wallet', note: 'Set limits, approve payments and see what they spend.' },
  { kind: 'developer', title: 'Build with Oryne', note: 'API keys, SDKs, logs and webhooks for agents or a paid API.' },
]

type Access = {
  mode: 'open' | 'invite'
  status: 'approved' | 'requested' | 'declined' | 'none'
  /** False when the admin approved this account without the activation top-up. Missing on older API builds. */
  deposit?: boolean
}
type Activation = {
  reference: string
  status: 'pending' | 'completed' | 'failed' | 'review'
  paid: boolean
  amount: string
  charge: { amount: string; currency: string }
  walletId: string | null
  error: string | null
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The signed-in owner has no wallet yet: create one.
 *
 * On a server where live mode is invite-only, they first ask for access. Where
 * a first wallet must be activated, they pay a small top-up by card; the wallet
 * is deployed when Paystack confirms it, with that money already in it.
 */
export function CreateWallet() {
  const live = useLive()
  const token = live.session?.token
  const { pathname } = useLocation()
  const [params, setParams] = useSearchParams()
  const [name, setName] = useState(MODE === 'live' ? 'My live wallet' : 'My agent wallet')
  const [kind, setKind] = useState<AccountKind>(pathname.startsWith(DEV_BASE) ? 'developer' : 'owner')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [access, setAccess] = useState<Access | null>(null)
  const [activation, setActivation] = useState<Activation | null>(null)
  const [checked, setChecked] = useState(false)

  const info = live.info
  const inviteOnly = info?.access === 'invite'
  // Approved without a deposit: the wallet is created straight away, like on testnet.
  const activationNeeded = access?.deposit === false ? null : (info?.activation ?? null)
  const passkeyOwner = !!live.session && !isAccount(live.session.address)
  const knownEmail = live.user?.email ?? (live.session?.address.startsWith('email:') ? live.session.address.slice(6) : null)

  const run = (label: string, task: () => Promise<void>) => async () => {
    setBusy(label)
    setError(null)
    try {
      await task()
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Where this account stands: access (invite-only servers) and any activation already started.
  useEffect(() => {
    if (!token || !info) return
    let current = true
    Promise.all([
      inviteOnly || info.activation ? api<Access>('/v1/access', { token }) : Promise.resolve(null),
      info.activation ? api<{ activation: Activation | null }>('/v1/activation', { token }).then((r) => r.activation) : Promise.resolve(null),
    ])
      .then(([nextAccess, nextActivation]) => {
        if (!current) return
        setAccess(nextAccess)
        setActivation(nextActivation)
      })
      .catch((reason: Error) => current && setError(reason.message))
      .finally(() => current && setChecked(true))
    return () => {
      current = false
    }
  }, [token, info, inviteOnly])

  // Back from checkout (?reference=…), or an activation paid earlier: confirm it until the wallet exists.
  const returned = params.get('reference') ?? params.get('trxref')
  const confirming = useRef(false)
  const confirm = useCallback(
    async (reference: string) => {
      if (!token || confirming.current) return
      confirming.current = true
      try {
        for (let attempt = 0; attempt < 40; attempt++) {
          const result = await api<Activation>(`/v1/activation/${encodeURIComponent(reference)}/confirm`, { method: 'POST', token })
          setActivation(result)
          if (result.status === 'completed') {
            await live.refresh()
            return
          }
          if (result.status !== 'pending') return
          await new Promise((resolve) => setTimeout(resolve, 3000))
        }
      } catch (reason) {
        setError((reason as Error).message)
      } finally {
        confirming.current = false
      }
    },
    [token, live],
  )
  useEffect(() => {
    const reference = returned?.startsWith('oryne-act-') ? returned : activation?.paid && activation.status === 'pending' ? activation.reference : null
    if (!reference) return
    if (returned) {
      const next = new URLSearchParams(params)
      next.delete('reference')
      next.delete('trxref')
      setParams(next, { replace: true })
    }
    void confirm(reference)
  }, [returned, activation?.reference, activation?.paid, activation?.status])

  const passkeyFor = async () =>
    isAccount(live.session!.address)
      ? undefined
      : await createPasskey({
          name: live.user?.email ?? live.session!.address,
          displayName: live.user?.name ?? live.user?.email ?? 'Oryne wallet owner',
        })

  const create = run('create', async () => {
    if (activationNeeded) {
      const receiptEmail = knownEmail ?? email.trim()
      if (!EMAIL.test(receiptEmail)) throw new Error('Enter your email for the card receipt')
      const passkey = await passkeyFor()
      const checkout = await api<{ authorizationUrl: string }>('/v1/activation', {
        body: { wallet: { name, kind, passkey }, email: receiptEmail },
        token,
      })
      window.location.assign(checkout.authorizationUrl)
      return
    }
    await live.createWallet(name, kind)
  })

  const requestAccess = run('access', async () => {
    const result = await api<Access>('/v1/access', { body: { note, email: knownEmail ? undefined : email.trim() }, token })
    setAccess(result)
  })

  const shell = (children: ReactNode) => (
    <>
      <GateTeams />
      {children}
      {error && (
        <p role="alert" className="mt-5 rounded-lg border border-burgundy/30 px-4 py-3 text-sm text-burgundy">
          {error}
        </p>
      )}
      <button type="button" onClick={live.signOut} className="mt-4 block text-xs text-muted underline underline-offset-4">
        Use a different account
      </button>
    </>
  )

  if (!checked && (inviteOnly || info?.activation)) return <Loader className="py-10" />

  // Paid: the wallet is being made, or needs a person.
  if (activation && activation.paid && activation.status !== 'completed') {
    const review = activation.status === 'review'
    return shell(
      <div className="text-center">
        <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-taupe/60">
          <Icon icon={review ? Clock : CheckCircle2} size={20} />
        </span>
        <h1 className="mt-5 text-2xl tracking-[-0.02em]">{review ? 'We’re finishing your wallet' : 'Payment received'}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {review
            ? `Your payment of ${activation.charge.amount} ${activation.charge.currency} went through, but something needs a person to finish. We’ll sort it out; nothing is lost. Write to info@oryne.org if you have questions.`
            : `Creating your wallet on Stellar and adding ${activation.amount} USDC to it. This takes a few seconds.`}
        </p>
        {!review && <Loader className="mt-6" />}
      </div>,
    )
  }

  // Invite-only and not let in yet.
  if (inviteOnly && access && access.status !== 'approved') {
    if (access.status === 'requested' || access.status === 'declined') {
      return shell(
        <div className="text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full border border-taupe/60">
            <Icon icon={Clock} size={20} />
          </span>
          <h1 className="mt-5 text-2xl tracking-[-0.02em]">You’re on the list</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Live mode is opening to a few teams at a time. You can create your live wallet here as soon as you’re let in.
            Test mode is open now and works the same way, with test USDC.
          </p>
        </div>,
      )
    }
    return shell(
      <form onSubmit={(event: FormEvent) => (event.preventDefault(), void requestAccess())}>
        <h1 className="text-2xl tracking-[-0.02em]">Live mode is invite-only</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Real USDC on Stellar mainnet is opening to a few teams at a time. Tell us what you’re building and we’ll let you
          in. Test mode is open to everyone in the meantime.
        </p>
        {!knownEmail && (
          <div className="mt-6">
            <Field label="Email">
              {(id) => (
                <input id={id} type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className={inputClasses} />
              )}
            </Field>
          </div>
        )}
        <div className="mt-6">
          <Field label="What will your agents pay for?">
            {(id) => (
              <textarea
                id={id}
                rows={3}
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                className={cn(inputClasses, 'h-auto py-3')}
              />
            )}
          </Field>
        </div>
        <Button type="submit" className="mt-6 w-full" disabled={!!busy}>
          {busy ? 'Sending…' : 'Ask for access'}
        </Button>
      </form>,
    )
  }

  return shell(
    <>
      <h1 className="text-2xl tracking-[-0.02em]">{MODE === 'live' ? 'Create your live wallet' : 'Create your agent wallet'}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {passkeyOwner
          ? 'Your device will create a passkey that owns this wallet. You use it to approve changes; the key never leaves your device.'
          : 'Oryne deploys a wallet contract on Stellar owned by your Freighter account.'}{' '}
        {MODE === 'live'
          ? 'It’s a separate wallet from your test one, with its own address on Stellar mainnet.'
          : 'Oryne pays the network fee.'}
      </p>
      {activation?.status === 'failed' && (
        <p className="mt-4 rounded-lg border border-taupe/60 px-4 py-3 text-sm text-muted">
          The last card payment didn’t go through{activation.error ? ` (${activation.error})` : ''}. You can try again.
        </p>
      )}
      <fieldset className="mt-6">
        <legend className="text-sm font-medium">How will you use Oryne?</legend>
        <div className="mt-2 grid gap-2">
          {kindOptions.map((option) => (
            <label
              key={option.kind}
              className={cn(
                'flex cursor-pointer gap-3 rounded-lg border px-4 py-3 text-sm',
                kind === option.kind ? 'border-charcoal' : 'border-taupe/60 hover:border-charcoal/50',
              )}
            >
              <input type="radio" name="kind" checked={kind === option.kind} onChange={() => setKind(option.kind)} className="mt-1 accent-charcoal" />
              <span>
                <span className="font-medium">{option.title}</span>
                <span className="mt-0.5 block text-muted">{option.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="mt-6">
        <Field label="Name">
          {(id) => <input id={id} value={name} onChange={(event) => setName(event.target.value)} className={inputClasses} />}
        </Field>
      </div>
      {activationNeeded && !knownEmail && (
        <div className="mt-4">
          <Field label="Email for the card receipt">
            {(id) => <input id={id} type="email" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClasses} />}
          </Field>
        </div>
      )}
      {activationNeeded && (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          To start, add <span className="text-charcoal">{activationNeeded.usdc} USDC</span> by card. It goes straight into
          your new wallet for your agents to spend; it isn’t a fee.
        </p>
      )}
      <Button className="mt-6 w-full" onClick={create} disabled={!!busy || (!!activationNeeded && !activationNeeded.available)}>
        {busy
          ? activationNeeded
            ? 'Opening checkout…'
            : passkeyOwner
              ? 'Creating passkey and wallet…'
              : 'Deploying on Stellar…'
          : activationNeeded
            ? `Add ${activationNeeded.usdc} USDC and create wallet`
            : passkeyOwner
              ? 'Create passkey and wallet'
              : 'Create wallet'}
      </Button>
      {activationNeeded && !activationNeeded.available && (
        <p className="mt-3 text-center text-xs text-muted">Card payments aren’t switched on yet. Check back soon.</p>
      )}
    </>,
  )
}
