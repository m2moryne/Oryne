import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  isAccount,
  loadAccount,
  loadInfo,
  loadSession,
  saveAccount,
  saveInfo,
  saveSession,
  type Info,
  type Intent,
  type LiveApproval,
  type LivePayment,
  type AccountKind,
  type Membership,
  type Role,
  type Session,
  type User,
  type WalletDetail,
  type WalletSummary,
} from './api'
import { signAndSubmit, signIn } from './freighter'
import { createPasskey, signWithPasskey } from './passkey'

/** After Google/GitHub sign-in the API sends the browser back to /app#session=… (or #error=…). */
function sessionFromRedirect(): { session?: Session; error?: string } {
  if (typeof location === 'undefined' || !location.hash.includes('=')) return {}
  const params = new URLSearchParams(location.hash.slice(1))
  const encoded = params.get('session')
  const error = params.get('error') ?? undefined
  if (!encoded && !error) return {}
  history.replaceState(null, '', location.pathname + location.search)
  if (!encoded) return { error }
  try {
    const json = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'))
    const session = JSON.parse(json) as Session
    saveSession(session)
    return { session }
  } catch {
    return { error: 'Sign-in could not be completed. Try again.' }
  }
}

/** Everything the live dashboard pages share: who is signed in, their wallet, and fresh data. */
type Live = {
  info: Info | null
  session: Session | null
  /** Profile for Google/GitHub users; { provider: 'freighter' } otherwise. */
  user: User | null
  wallets: WalletSummary[]
  wallet: WalletDetail | null
  payments: LivePayment[]
  approvals: LiveApproval[]
  loading: boolean
  error: string | null
  signIn: () => Promise<void>
  /** Uses a session handed back by OAuth or the dev login. */
  adoptSession: (session: Session) => void
  signOut: () => void
  /** Set when working in a teammate's account: the role and who is signed in. */
  member: { role: Role; email: string; actor: string } | null
  /** Invitations to, and teams of, the signed-in person. */
  memberships: Membership[]
  reloadMemberships: () => Promise<void>
  /** Switches to a team account, or back to their own with null. Reloads the dashboard. */
  switchAccount: (account: string | null) => void
  createWallet: (name: string, kind?: AccountKind) => Promise<void>
  /** owner: the agent dashboard only. developer: the developer console only. Null until known. */
  kind: AccountKind | null
  /** Switches the account between the two. Owner only. */
  setKind: (kind: AccountKind) => Promise<void>
  refresh: () => Promise<void>
  /** Builds an intent with `create`, has Freighter or the passkey sign it, submits it, refreshes. Returns the tx hash. */
  sign: (create: (token: string) => Promise<Intent>) => Promise<string>
  token: string
}

const LiveContext = createContext<Live | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Info | null>(loadInfo)
  const [redirect] = useState(sessionFromRedirect)
  const [session, setSession] = useState<Session | null>(() => redirect.session ?? loadSession())
  const [user, setUser] = useState<User | null>(null)
  const [wallets, setWallets] = useState<WalletSummary[]>([])
  const [wallet, setWallet] = useState<WalletDetail | null>(null)
  const [payments, setPayments] = useState<LivePayment[]>([])
  const [approvals, setApprovals] = useState<LiveApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [member, setMember] = useState<Live['member']>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [kind, setKindState] = useState<AccountKind | null>(null)
  const [error, setError] = useState<string | null>(redirect.error ?? null)

  useEffect(() => {
    // Refresh the cached copy; the page already works from it while the API wakes up.
    api<Info>('/v1/info')
      .then((fresh) => {
        saveInfo(fresh)
        setInfo(fresh)
      })
      .catch((reason: Error) => {
        if (!loadInfo()) setError(reason.message)
      })
  }, [])

  const refresh = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }
    try {
      let me: { wallets: WalletSummary[]; user: User; member?: Live['member']; kind?: AccountKind }
      try {
        me = await api('/v1/me', { token: session.token })
      } catch (reason) {
        // No longer on that team: back to their own account.
        if ((reason as { status?: number }).status !== 403 || !loadAccount()) throw reason
        saveAccount(null)
        me = await api('/v1/me', { token: session.token })
      }
      setWallets(me.wallets)
      setUser(me.user)
      setMember(me.member ?? null)
      setKindState(me.kind ?? 'owner')
      const current = me.wallets[0]
      if (current) {
        const [detail, history, pending] = await Promise.all([
          api<WalletDetail>(`/v1/wallets/${current.id}`, { token: session.token }),
          api<{ payments: LivePayment[] }>(`/v1/wallets/${current.id}/payments`, { token: session.token }),
          api<{ approvals: LiveApproval[] }>('/v1/approvals?status=all', { token: session.token }),
        ])
        setWallet(detail)
        setPayments(history.payments)
        setApprovals(pending.approvals)
      } else {
        setWallet(null)
      }
      setError(null)
    } catch (reason) {
      const status = (reason as { status?: number }).status
      if (status === 401) {
        saveSession(null)
        setSession(null)
      } else {
        setError((reason as Error).message)
      }
    } finally {
      setLoading(false)
    }
  }, [session])

  const reloadMemberships = useCallback(async () => {
    if (!session) return setMemberships([])
    try {
      const data = await api<{ memberships: Membership[] }>('/v1/memberships', { token: session.token })
      setMemberships(data.memberships)
    } catch {
      // Older API, or offline: no team features.
    }
  }, [session])

  useEffect(() => {
    void reloadMemberships()
  }, [reloadMemberships])

  useEffect(() => {
    void refresh()
    if (!session) return
    // Payments arrive from agents at any time.
    const timer = setInterval(() => void refresh(), 8000)
    return () => clearInterval(timer)
  }, [refresh, session])

  const value = useMemo<Live>(
    () => ({
      info,
      session,
      user,
      wallets,
      wallet,
      payments,
      approvals,
      loading,
      error,
      token: session?.token ?? '',
      async signIn() {
        const current = info ?? (await api<Info>('/v1/info'))
        const next = await signIn(current.networkPassphrase)
        saveSession(next)
        setLoading(true)
        setSession(next)
      },
      adoptSession(next: Session) {
        saveSession(next)
        setLoading(true)
        setSession(next)
      },
      member,
      memberships,
      reloadMemberships,
      switchAccount(account: string | null) {
        saveAccount(account)
        window.location.assign('/app')
      },
      signOut() {
        saveAccount(null)
        saveSession(null)
        setSession(null)
        setUser(null)
        setWallets([])
        setWallet(null)
        setKindState(null)
      },
      kind,
      async setKind(next: AccountKind) {
        if (!session) return
        await api('/v1/account', { method: 'PUT', body: { kind: next }, token: session.token })
        setKindState(next)
      },
      async createWallet(name: string, chosen?: AccountKind) {
        if (!session) return
        // Freighter accounts own their wallet directly; everyone else with a new passkey.
        const passkey = isAccount(session.address)
          ? undefined
          : await createPasskey({
              name: user?.email ?? session.address,
              displayName: user?.name ?? user?.email ?? 'Oryne wallet owner',
            })
        await api('/v1/wallets', { body: { name, passkey, kind: chosen }, token: session.token })
        if (chosen) setKindState(chosen)
        await refresh()
      },
      refresh,
      async sign(create) {
        if (!session) throw new Error('Sign in first')
        const intent = await create(session.token)
        const result =
          intent.mode === 'passkey'
            ? await api<{ hash: string }>(`/v1/intents/${intent.id}/submit`, {
                body: { passkey: await signWithPasskey(intent.challenge, intent.credentialIds) },
                token: session.token,
              })
            : await signAndSubmit(intent, session)
        await refresh()
        return result.hash
      },
    }),
    [info, session, user, wallets, wallet, payments, approvals, loading, error, refresh, member, memberships, reloadMemberships, kind],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  const live = useContext(LiveContext)
  if (!live) throw new Error('useLive must be used inside <LiveProvider>')
  return live
}
