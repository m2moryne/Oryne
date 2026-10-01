import type { DevState } from './dev/devData'

export type AgentKind = 'Research' | 'Shopping' | 'Travel' | 'Operations' | 'Other'

export type Agent = {
  id: string
  name: string
  kind: AgentKind
  status: 'active' | 'paused'
  /** Most the agent may spend in a rolling 30 days. */
  budget: number
  /** Most the agent may spend on a single purchase. */
  perPurchase: number
  connectedAt: string
}

export type Purchase = {
  id: string
  agentId: string
  merchant: string
  item: string
  category: string
  amount: number
  status: 'settled' | 'declined'
  /** Why a purchase was declined, when it was. */
  reason?: string
  /** True when the owner approved it by hand, overriding the agent's limits. */
  approvedByOwner?: boolean
  at: string
}

/** A purchase an agent wants to make that is waiting for its owner to decide. */
export type Approval = {
  id: string
  agentId: string
  merchant: string
  item: string
  category: string
  amount: number
  /** Why the agent could not simply go ahead. */
  why: string
  requestedAt: string
}

export type Funding = {
  id: string
  amount: number
  method: string
  at: string
}

export type User = {
  name: string
  email: string
  /** How they signed in: "email", "Google", "GitHub" or "Hugging Face". */
  provider?: string
}

/** Which emails the owner wants. */
export type Prefs = {
  approvals: boolean
  declined: boolean
  lowBalance: boolean
  budgetNearlyUsed: boolean
  weeklySummary: boolean
}

export type AppState = {
  user: User | null
  balance: number
  agents: Agent[]
  purchases: Purchase[]
  approvals: Approval[]
  fundings: Funding[]
  prefs: Prefs
  /** Developer console: API keys, webhooks, team and test/live mode. */
  dev: DevState
}
