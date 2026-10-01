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
  at: string
}

export type Funding = {
  id: string
  amount: number
  method: string
  at: string
}

export type User = { name: string; email: string }

export type AppState = {
  user: User | null
  balance: number
  agents: Agent[]
  purchases: Purchase[]
  fundings: Funding[]
}
