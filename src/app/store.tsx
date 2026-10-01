import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { catalogue, id, seedState } from './seed'
import type { Agent, AppState, Purchase, User } from './types'

/**
 * Dashboard state for the preview. It lives in this browser only (localStorage);
 * there is no server, no real account and no real money behind it.
 */

const STORAGE_KEY = 'oryne.dashboard.v2'
const WINDOW_MS = 30 * 86_400_000
const round = (value: number) => Math.round(value * 100) / 100

type Action =
  | { type: 'signIn'; user: User }
  | { type: 'signOut' }
  | { type: 'updateUser'; user: User }
  | { type: 'addFunds'; amount: number; method: string }
  | { type: 'connectAgent'; agent: Agent }
  | { type: 'updateAgent'; id: string; patch: Partial<Agent> }
  | { type: 'removeAgent'; id: string }
  | { type: 'attemptPurchase'; purchase: Omit<Purchase, 'status' | 'reason'> }
  | { type: 'reset' }

/** What an agent has spent in the last 30 days (settled purchases only). */
export function spentBy(purchases: Purchase[], agentId?: string) {
  const since = Date.now() - WINDOW_MS
  return round(
    purchases
      .filter(
        (purchase) =>
          purchase.status === 'settled' &&
          (!agentId || purchase.agentId === agentId) &&
          new Date(purchase.at).getTime() >= since,
      )
      .reduce((total, purchase) => total + purchase.amount, 0),
  )
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'signIn':
    case 'updateUser':
      return { ...state, user: action.user }
    case 'signOut':
      return { ...state, user: null }
    case 'addFunds':
      return {
        ...state,
        balance: round(state.balance + action.amount),
        fundings: [
          { id: id('fund'), amount: action.amount, method: action.method, at: new Date().toISOString() },
          ...state.fundings,
        ],
      }
    case 'connectAgent':
      return { ...state, agents: [...state.agents, action.agent] }
    case 'updateAgent':
      return {
        ...state,
        agents: state.agents.map((agent) =>
          agent.id === action.id ? { ...agent, ...action.patch } : agent,
        ),
      }
    case 'removeAgent':
      return { ...state, agents: state.agents.filter((agent) => agent.id !== action.id) }
    case 'attemptPurchase': {
      // The same three checks a real purchase would have to pass.
      const agent = state.agents.find((candidate) => candidate.id === action.purchase.agentId)
      if (!agent || agent.status !== 'active') return state
      const { amount } = action.purchase
      const reason =
        amount > agent.perPurchase
          ? 'Over the per-purchase limit'
          : spentBy(state.purchases, agent.id) + amount > agent.budget
            ? 'Budget reached'
            : amount > state.balance
              ? 'Not enough funds'
              : undefined
      const purchase: Purchase = { ...action.purchase, status: reason ? 'declined' : 'settled', reason }
      return {
        ...state,
        balance: reason ? state.balance : round(state.balance - amount),
        purchases: [purchase, ...state.purchases].slice(0, 300),
      }
    }
    case 'reset':
      return { ...seedState(), user: state.user }
  }
}

function load(): AppState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) return JSON.parse(stored) as AppState
  } catch {
    // Unreadable or blocked storage: fall through to fresh sample data.
  }
  return seedState()
}

const StoreContext = createContext<{ state: AppState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, load)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Storage unavailable: the session simply won't persist.
    }
  }, [state])

  const value = useMemo(() => ({ state, dispatch }), [state])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useStore must be used inside <StoreProvider>')
  return store
}

/**
 * Stands in for real agents while there is no backend: every so often one
 * active agent attempts a purchase, so the dashboard has live activity.
 */
export function useSimulatedActivity() {
  const { state, dispatch } = useStore()
  const activeIds = state.agents
    .filter((agent) => agent.status === 'active')
    .map((agent) => `${agent.id}:${agent.kind}`)
    .join(',')

  useEffect(() => {
    if (!activeIds) return
    const agents = activeIds.split(',').map((entry) => entry.split(':') as [string, Agent['kind']])
    let timer: ReturnType<typeof setTimeout>

    const schedule = () => {
      timer = setTimeout(
        () => {
          const [agentId, kind] = agents[Math.floor(Math.random() * agents.length)]
          const options = catalogue[kind]
          const template = options[Math.floor(Math.random() * options.length)]
          dispatch({
            type: 'attemptPurchase',
            purchase: {
              id: id('pur'),
              agentId,
              merchant: template.merchant,
              item: template.item,
              category: template.category,
              amount: round(template.min + Math.random() * (template.max - template.min)),
              at: new Date().toISOString(),
            },
          })
          schedule()
        },
        14_000 + Math.random() * 16_000,
      )
    }
    schedule()
    return () => clearTimeout(timer)
  }, [activeIds, dispatch])
}
