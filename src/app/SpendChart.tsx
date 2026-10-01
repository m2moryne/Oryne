import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { formatDay, money, wholeMoney } from './format'
import { LineChart, RangeSwitch } from './LineChart'
import type { Purchase } from './types'

const ranges = [7, 14, 30] as const

/** Settled spend per calendar day for `count` days ending `offset` days ago. */
function dailyTotals(purchases: Purchase[], count: number, offset = 0) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() - offset - (count - 1 - index))
    const next = new Date(date)
    next.setDate(date.getDate() + 1)
    const settled = purchases.filter((purchase) => {
      const at = new Date(purchase.at)
      return purchase.status === 'settled' && at >= date && at < next
    })
    return {
      date,
      total: settled.reduce((sum, purchase) => sum + purchase.amount, 0),
      count: settled.length,
    }
  })
}

/** Daily spend, with the period total and how it compares with the period before. */
export function SpendChart({ purchases }: { purchases: Purchase[] }) {
  const [range, setRange] = useState<(typeof ranges)[number]>(14)

  const days = useMemo(() => dailyTotals(purchases, range), [purchases, range])
  const previous = useMemo(() => dailyTotals(purchases, range, range), [purchases, range])

  const total = days.reduce((sum, day) => sum + day.total, 0)
  const before = previous.reduce((sum, day) => sum + day.total, 0)
  const change = before > 0 ? Math.round(((total - before) / before) * 100) : null

  return (
    <figure>
      <figcaption className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div>
          <p className="type-label text-muted">Spent, last {range} days</p>
          <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-4xl tracking-[-0.03em] tabular-nums">{money(total)}</span>
            {change !== null && (
              <span className="flex items-center gap-1.5 text-sm text-muted">
                <Icon icon={change >= 0 ? TrendingUp : TrendingDown} size={16} />
                {change >= 0 ? 'Up' : 'Down'} {Math.abs(change)}% on the {range} days before
              </span>
            )}
          </p>
        </div>
        <RangeSwitch ranges={ranges} value={range} onChange={setRange} />
      </figcaption>

      <div className="mt-8">
        <LineChart
          points={days.map((day) => ({
            label: formatDay(day.date),
            value: day.total,
            detail: `${day.count} ${day.count === 1 ? 'purchase' : 'purchases'}`,
          }))}
          formatValue={money}
          formatAxis={wholeMoney}
          lastLabel="Today"
          summary={`Line chart of settled spending per day over the last ${range} days.`}
        />
      </div>
    </figure>
  )
}
