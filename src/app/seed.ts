import type { Agent, AgentKind, AppState, Funding, Purchase } from './types'

/**
 * Sample data for the dashboard preview. Everything here is invented: the
 * merchants are fictional and no real money or agents are involved. Replace
 * this file (and the store) with API calls when there is a backend.
 */

const DAY = 86_400_000

type Template = { merchant: string; item: string; category: string; min: number; max: number }

export const catalogue: Record<AgentKind, Template[]> = {
  Research: [
    { merchant: 'Lumen Search', item: 'Web search, 500 queries', category: 'Search', min: 2, max: 6 },
    { merchant: 'Fathom Market Data', item: 'Daily market snapshot', category: 'Data', min: 8, max: 18 },
    { merchant: 'Quill Docs', item: 'Document parsing, 40 pages', category: 'Documents', min: 3, max: 9 },
    { merchant: 'Northwind Data', item: 'Company dataset access', category: 'Data', min: 10, max: 22 },
  ],
  Shopping: [
    { merchant: 'Harbor Supply', item: 'Office supplies reorder', category: 'Goods', min: 14, max: 48 },
    { merchant: 'Pricewatch', item: 'Price comparison, 200 lookups', category: 'Search', min: 2, max: 5 },
    { merchant: 'Parcel Line', item: 'Shipping label', category: 'Logistics', min: 6, max: 15 },
  ],
  Travel: [
    { merchant: 'Skylane Fares', item: 'Flight search, 120 routes', category: 'Search', min: 3, max: 8 },
    { merchant: 'Meridian Maps', item: 'Route planning', category: 'Maps', min: 1, max: 4 },
    { merchant: 'Stayfinder', item: 'Hotel availability check', category: 'Search', min: 2, max: 6 },
    { merchant: 'Railpoint', item: 'Train ticket, one way', category: 'Tickets', min: 22, max: 58 },
  ],
  Operations: [
    { merchant: 'Halcyon Compute', item: 'Compute, 2 hours', category: 'Compute', min: 3, max: 9 },
    { merchant: 'Signal Relay', item: 'Status alerts, 300 messages', category: 'Messaging', min: 1, max: 4 },
    { merchant: 'Vaultline', item: 'Storage, 50 GB', category: 'Storage', min: 2, max: 5 },
  ],
  Other: [
    { merchant: 'Atlas Translate', item: 'Translation, 12 pages', category: 'Language', min: 4, max: 12 },
    { merchant: 'Northwind Data', item: 'Weather data, 1,000 calls', category: 'Data', min: 1, max: 4 },
  ],
}

/** Small deterministic generator so the sample data is the same on every load. */
function sequence(seed: number) {
  let value = seed
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296
    return value / 4294967296
  }
}

export function id(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function seedState(): AppState {
  const now = Date.now()
  const random = sequence(7)

  const agents: Agent[] = [
    {
      id: 'agt_research',
      name: 'Research assistant',
      kind: 'Research',
      status: 'active',
      budget: 400,
      perPurchase: 25,
      connectedAt: new Date(now - 29 * DAY).toISOString(),
    },
    {
      id: 'agt_travel',
      name: 'Travel planner',
      kind: 'Travel',
      status: 'active',
      budget: 350,
      perPurchase: 60,
      connectedAt: new Date(now - 19 * DAY).toISOString(),
    },
    {
      id: 'agt_ops',
      name: 'Ops monitor',
      kind: 'Operations',
      status: 'paused',
      budget: 150,
      perPurchase: 10,
      connectedAt: new Date(now - 12 * DAY).toISOString(),
    },
  ]

  // A month of history, oldest day first, so each agent's running total can be
  // checked against its budget the same way a live purchase would be.
  const purchases: Purchase[] = []
  const running = new Map<string, number>()
  for (let day = 29; day >= 0; day--) {
    for (const agent of agents) {
      const connectedDaysAgo = (now - new Date(agent.connectedAt).getTime()) / DAY
      if (day > connectedDaysAgo) continue
      // The paused agent stopped buying three days ago.
      if (agent.status === 'paused' && day < 3) continue
      const count = Math.floor(random() * 3)
      for (let n = 0; n < count; n++) {
        const options = catalogue[agent.kind]
        const template = options[Math.floor(random() * options.length)]
        const amount = Math.round((template.min + random() * (template.max - template.min)) * 100) / 100
        const soFar = running.get(agent.id) ?? 0
        const reason =
          amount > agent.perPurchase
            ? 'Over the per-purchase limit'
            : soFar + amount > agent.budget
              ? 'Budget reached'
              : undefined
        if (!reason) running.set(agent.id, soFar + amount)
        purchases.push({
          id: `pur_${day}_${agent.id}_${n}`,
          agentId: agent.id,
          merchant: template.merchant,
          item: template.item,
          category: template.category,
          amount,
          status: reason ? 'declined' : 'settled',
          reason,
          at: new Date(now - day * DAY - Math.floor(random() * 0.6 * DAY) - 600_000).toISOString(),
        })
      }
    }
  }
  purchases.sort((a, b) => b.at.localeCompare(a.at))

  const fundings: Funding[] = [
    { id: 'fund_3', amount: 300, method: 'Bank transfer', at: new Date(now - 6 * DAY).toISOString() },
    { id: 'fund_2', amount: 250, method: 'Bank transfer', at: new Date(now - 17 * DAY).toISOString() },
    { id: 'fund_1', amount: 500, method: 'Card', at: new Date(now - 29 * DAY).toISOString() },
  ]

  const spent = purchases
    .filter((purchase) => purchase.status === 'settled')
    .reduce((total, purchase) => total + purchase.amount, 0)

  return {
    user: null,
    balance: Math.round((1050 - spent) * 100) / 100,
    agents,
    purchases,
    fundings,
  }
}
