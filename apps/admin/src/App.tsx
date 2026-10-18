import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AdminContext } from './components/ui'
import { adminGet, API_URL, loadToken, saveToken } from './lib/api'
import { useTheme } from './lib/theme'
import Accounts from './pages/Accounts'
import Agents from './pages/Agents'
import Keys from './pages/Keys'
import Overview from './pages/Overview'
import Payments from './pages/Payments'
import Requests from './pages/Requests'
import System from './pages/System'
import Wallets from './pages/Wallets'

type SystemInfo = { network: string }

function SignIn({ onSignedIn, error: initialError }: { onSignedIn: (token: string, system: SystemInfo) => void; error?: string | null }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(initialError ?? null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      onSignedIn(token.trim(), await adminGet<SystemInfo>('/system', token.trim()))
    } catch (reason) {
      setError((reason as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-16">
      <form onSubmit={submit} className="w-full max-w-sm border border-line bg-surface p-8">
        <p className="text-center text-[0.9375rem] font-medium uppercase tracking-[0.34em]">Oryne</p>
        <h1 className="mt-6 text-center text-2xl tracking-[-0.02em]">Admin</h1>
        <p className="mt-2 text-center text-sm text-muted">Sign in with the admin token.</p>
        <label htmlFor="token" className="mt-8 block text-sm font-medium">
          Admin token
        </label>
        <input
          id="token"
          type="password"
          autoComplete="current-password"
          value={token}
          onChange={(event) => setToken(event.target.value)}
          required
          className="mt-2 h-11 w-full border border-line bg-bg px-3 text-sm outline-none transition-colors focus:border-text"
        />
        {error && <p className="mt-4 text-sm text-accent">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="mt-6 h-11 w-full rounded-full bg-text text-xs font-medium uppercase tracking-[0.18em] text-bg transition-opacity disabled:opacity-45"
        >
          {busy ? 'Checking…' : 'Sign in'}
        </button>
        <p className="mt-6 text-center text-xs leading-relaxed text-muted">
          ADMIN_TOKEN on the API server. Kept for this tab only.
          <br />
          {API_URL}
        </p>
      </form>
    </main>
  )
}

export default function App() {
  const [theme, setTheme] = useTheme()
  const [token, setToken] = useState<string | null>(loadToken)
  const [network, setNetwork] = useState('stellar-testnet')
  const [expired, setExpired] = useState<string | null>(null)

  const signOut = useCallback(() => {
    saveToken(null)
    setToken(null)
  }, [])

  // A token saved earlier in this tab: confirm it still works and learn the network.
  useEffect(() => {
    if (!token) return
    adminGet<SystemInfo>('/system', token)
      .then((system) => setNetwork(system.network))
      .catch((reason: Error) => {
        setExpired(reason.message)
        signOut()
      })
  }, [token, signOut])

  if (!token) {
    return (
      <SignIn
        error={expired}
        onSignedIn={(next, system) => {
          saveToken(next)
          setNetwork(system.network)
          setExpired(null)
          setToken(next)
        }}
      />
    )
  }

  return (
    <AdminContext.Provider value={{ token, signOut, network }}>
      <Routes>
        <Route element={<Layout theme={theme} onTheme={setTheme} />}>
          <Route index element={<Overview />} />
          <Route path="accounts" element={<Accounts />} />
          <Route path="wallets" element={<Wallets />} />
          <Route path="agents" element={<Agents />} />
          <Route path="payments" element={<Payments />} />
          <Route path="requests" element={<Requests />} />
          <Route path="keys" element={<Keys />} />
          <Route path="system" element={<System />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminContext.Provider>
  )
}
