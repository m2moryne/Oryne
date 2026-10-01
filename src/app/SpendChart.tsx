import { TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { cn } from '../lib/cn'
import { formatDay, money, wholeMoney } from './format'
import type { Purchase } from './types'

const ranges = [7, 14, 30] as const
type Range = (typeof ranges)[number]

type Day = { date: Date; total: number; count: number }

/** Settled spend per calendar day for `count` days ending `offset` days ago. */
function dailyTotals(purchases: Purchase[], count: number, offset = 0): Day[] {
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

/**
 * A smooth curve through the points that never overshoots them (monotone
 * cubic), so the line cannot dip below zero between two real values.
 */
function smoothPath(points: Array<[number, number]>) {
  if (points.length < 2) return ''
  const slopes = points.slice(1).map(([x, y], i) => (y - points[i][1]) / (x - points[i][0]))
  const tangents = points.map((_, i) => {
    if (i === 0) return slopes[0]
    if (i === points.length - 1) return slopes[i - 1]
    const before = slopes[i - 1]
    const after = slopes[i]
    return before * after <= 0 ? 0 : (2 * before * after) / (before + after)
  })
  return points.slice(1).reduce((path, [x, y], i) => {
    const [fromX, fromY] = points[i]
    const third = (x - fromX) / 3
    return `${path} C${fromX + third},${fromY + tangents[i] * third} ${x - third},${y - tangents[i + 1] * third} ${x},${y}`
  }, `M${points[0][0]},${points[0][1]}`)
}

/**
 * Daily spend as a line. One series, so one colour and no legend. Hovering or
 * tabbing across the plot moves a crosshair and shows that day's figures; the
 * same data is available as a table on the Activity page.
 */
export function SpendChart({ purchases }: { purchases: Purchase[] }) {
  const [range, setRange] = useState<Range>(14)
  const [active, setActive] = useState<number | null>(null)

  const days = useMemo(() => dailyTotals(purchases, range), [purchases, range])
  const previous = useMemo(() => dailyTotals(purchases, range, range), [purchases, range])

  const total = days.reduce((sum, day) => sum + day.total, 0)
  const before = previous.reduce((sum, day) => sum + day.total, 0)
  const change = before > 0 ? Math.round(((total - before) / before) * 100) : null

  const peak = Math.max(...days.map((day) => day.total), 1)
  // Round the axis top up to a tidy figure so the gridlines read cleanly.
  const step = peak <= 40 ? 10 : peak <= 100 ? 25 : 50
  const top = Math.ceil(peak / step) * step
  const ticks = [top, top / 2, 0]

  const x = (index: number) => (index / (range - 1)) * 100
  const y = (value: number) => 100 - (value / top) * 100
  const line = smoothPath(days.map((day, index) => [x(index), y(day.total)]))
  const current = active === null ? null : days[active]

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

        <div role="group" aria-label="Time range" className="flex rounded-lg border border-taupe/70 p-1">
          {ranges.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={range === option}
              onClick={() => {
                setRange(option)
                setActive(null)
              }}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm tabular-nums transition-colors duration-200',
                range === option ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
              )}
            >
              {option}D
            </button>
          ))}
        </div>
      </figcaption>

      <div className="mt-8 flex gap-3">
        <div className="flex h-64 flex-col justify-between text-right text-xs tabular-nums text-muted">
          {ticks.map((tick) => (
            <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {wholeMoney(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative h-64" onMouseLeave={() => setActive(null)}>
            {ticks.map((tick) => (
              <span
                key={tick}
                aria-hidden="true"
                className={cn('absolute inset-x-0 h-px', tick === 0 ? 'bg-taupe' : 'bg-taupe/30')}
                style={{ bottom: `${(tick / top) * 100}%` }}
              />
            ))}

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
              className="absolute inset-0 size-full overflow-visible"
            >
              <path d={`${line} L100,100 L0,100 Z`} className="fill-burgundy/[0.07]" />
              <path
                d={line}
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-burgundy"
              />
            </svg>

            {/* The latest point is always marked; the hovered one takes over. */}
            <span
              aria-hidden="true"
              className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full bg-burgundy ring-2 ring-white transition-[left,bottom] duration-150 ease-quiet"
              style={{
                left: `${x(active ?? range - 1)}%`,
                bottom: `${100 - y(days[active ?? range - 1].total)}%`,
              }}
            />

            {current && active !== null && (
              <>
                <span
                  aria-hidden="true"
                  className="absolute inset-y-0 w-px bg-charcoal/25"
                  style={{ left: `${x(active)}%` }}
                />
                <div
                  role="tooltip"
                  className={cn(
                    'pointer-events-none absolute top-0 z-10 rounded-lg bg-charcoal px-3 py-2 text-xs whitespace-nowrap text-cream',
                    x(active) > 70 ? '-translate-x-full' : '',
                  )}
                  style={{ left: `calc(${x(active)}% + ${x(active) > 70 ? -10 : 10}px)` }}
                >
                  <p className="font-medium tabular-nums">{money(current.total)}</p>
                  <p className="text-cream/70">
                    {formatDay(current.date)} · {current.count}{' '}
                    {current.count === 1 ? 'purchase' : 'purchases'}
                  </p>
                </div>
              </>
            )}

            {/* One invisible column per day: a hit target far larger than the point. */}
            <ul className="absolute inset-y-0 flex" style={{ left: `${-50 / (range - 1)}%`, right: `${-50 / (range - 1)}%` }}>
              {days.map((day, index) => (
                <li key={day.date.toISOString()} className="flex-1">
                  <button
                    type="button"
                    onMouseEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                    aria-label={`${formatDay(day.date)}: ${money(day.total)} across ${day.count} purchases`}
                    className="size-full cursor-crosshair rounded-sm"
                  />
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-3 flex justify-between text-xs text-muted">
            <span>{formatDay(days[0].date)}</span>
            <span>{formatDay(days[Math.floor(range / 2)].date)}</span>
            <span>Today</span>
          </div>
        </div>
      </div>
    </figure>
  )
}
