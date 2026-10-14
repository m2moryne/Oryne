import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  loadSession,
  saveSession,
  type Info,
  type Intent,
  type LiveApproval,
  type LivePayment,
  type Session,
  type WalletDetail,
  type WalletSummary,
} from './api'
import { signAndSubmit, signIn } from './freighter'

/** Everything the live dashboard pages share: who is signed in, their wallet, and fresh data. */
type Live = {
  info: Info | null
  session: Session | null
  wallets: WalletSummary[]
  wallet: WalletDetail | null
  payments: LivePayment[]
  approvals: LiveApproval[]
  loading: boolean
  error: string | null
  signIn: () => Promise<void>
  signOut: () => void
  createWallet: (name: string) => Promise<void>
  refresh: () => Promise<void>
  /** Builds an intent with `create`, has Freighter sign it, submits it, refreshes. Returns the tx hash. */
  sign: (create: (token: string) => Promise<Intent>) => Promise<string>
  token: string
}

const LiveContext = createContext<Live | null>(null)

export function LiveProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [session, setSession] = useState<Session | null>(loadSession)
  const [wallets, setWallets] = useState<WalletSummary[]>([])
  const [wallet, setWallet] = useState<WalletDetail | null>(null)
  const [payments, setPayments] = useState<LivePayment[]>([])
  const [approvals, setApprovals] = useState<LiveApproval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<Info>('/v1/info')
      .then(setInfo)
      .catch((reason: Error) => setError(reason.message))
  }, [])

  const refresh = useCallback(async () => {
    if (!session) {
      setLoading(false)
      return
    }
    try {
      const me = await api<{ wallets: WalletSummary[] }>('/v1/me', { token: session.token })
      setWallets(me.wallets)
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
      wallets,
      wallet,
      payments,
      approvals,
      loading,
      error,
      token: session?.token ?? '',
      async signIn() {
        if (!info) throw new Error('The API is not reachable yet')
        const next = await signIn(info.networkPassphrase)
        saveSession(next)
        setLoading(true)
        setSession(next)
      },
      signOut() {
        saveSession(null)
        setSession(null)
        setWallets([])
        setWallet(null)
      },
      async createWallet(name: string) {
        if (!session) return
        await api('/v1/wallets', { body: { name }, token: session.token })
        await refresh()
      },
      refresh,
      async sign(create) {
        if (!session) throw new Error('Sign in first')
        const intent = await create(session.token)
        const result = await signAndSubmit(intent, session)
        await refresh()
        return result.hash
      },
    }),
    [info, session, wallets, wallet, payments, approvals, loading, error, refresh],
  )

  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>
}

export function useLive() {
  const live = useContext(LiveContext)
  if (!live) throw new Error('useLive must be used inside <LiveProvider>')
  return live
}
