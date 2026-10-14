import { useState } from 'react'
import { cn } from '../lib/cn'

export type ChartPoint = {
  /** Shown on the axis for the first, middle and last points, and in the tooltip. */
  label: string
  value: number
  /** Second line of the tooltip, e.g. "3 purchases". */
  detail?: string
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

/** Rounds the axis top up to a tidy figure so the gridlines read cleanly. */
function niceTop(peak: number) {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(peak, 1)))
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= peak)!
  return step
}

/**
 * One series as a line: one colour, no legend. Hovering or tabbing across the
 * plot moves a crosshair and shows that point's figures.
 */
export function LineChart({
  points,
  formatValue,
  formatAxis = formatValue,
  lastLabel,
  summary,
  className = 'h-64',
}: {
  points: ChartPoint[]
  formatValue: (value: number) => string
  formatAxis?: (value: number) => string
  /** Overrides the last axis label, e.g. "Today". */
  lastLabel?: string
  /** One sentence describing the chart for screen readers. */
  summary: string
  className?: string
}) {
  const [active, setActive] = useState<number | null>(null)

  const count = points.length
  const top = niceTop(Math.max(...points.map((point) => point.value)))
  const ticks = [top, top / 2, 0]
  const x = (index: number) => (index / (count - 1)) * 100
  const y = (value: number) => 100 - (value / top) * 100
  const line = smoothPath(points.map((point, index) => [x(index), y(point.value)]))
  const marked = active !== null && active < count ? active : count - 1
  const current = active !== null && active < count ? points[active] : null

  return (
    <div className="flex gap-3">
      <p className="sr-only">{summary}</p>

      <div className={cn('flex flex-col justify-between text-right text-xs tabular-nums text-muted', className)}>
        {ticks.map((tick) => (
          <span key={tick} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
            {formatAxis(tick)}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className={cn('relative', className)} onMouseLeave={() => setActive(null)}>
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
            style={{ left: `${x(marked)}%`, bottom: `${100 - y(points[marked].value)}%` }}
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
                  'pointer-events-none absolute top-0 z-10 bg-charcoal px-3 py-2 text-xs whitespace-nowrap text-cream',
                  x(active) > 70 && '-translate-x-full',
                )}
                style={{ left: `calc(${x(active)}% + ${x(active) > 70 ? -10 : 10}px)` }}
              >
                <p className="font-medium tabular-nums">{formatValue(current.value)}</p>
                <p className="text-cream/70">
                  {current.label}
                  {current.detail && ` · ${current.detail}`}
                </p>
              </div>
            </>
          )}

          {/* One invisible column per point: a hit target far larger than the mark. */}
          <ul
            className="absolute inset-y-0 flex"
            style={{ left: `${-50 / (count - 1)}%`, right: `${-50 / (count - 1)}%` }}
          >
            {points.map((point, index) => (
              <li key={index} className="flex-1">
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  aria-label={`${point.label}: ${formatValue(point.value)}${point.detail ? `, ${point.detail}` : ''}`}
                  className="size-full cursor-crosshair"
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-3 flex justify-between text-xs text-muted">
          <span>{points[0].label}</span>
          <span>{points[Math.floor(count / 2)].label}</span>
          <span>{lastLabel ?? points[count - 1].label}</span>
        </div>
      </div>
    </div>
  )
}

/** The 7D / 14D / 30D switch used above the charts. */
export function RangeSwitch<Range extends number>({
  ranges,
  value,
  onChange,
}: {
  ranges: readonly Range[]
  value: Range
  onChange: (range: Range) => void
}) {
  return (
    <div role="group" aria-label="Time range" className="flex border border-taupe/70 p-1">
      {ranges.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={cn(
            'px-3 py-1.5 text-sm tabular-nums transition-colors duration-200',
            value === option ? 'bg-charcoal text-cream' : 'text-muted hover:text-charcoal',
          )}
        >
          {option}D
        </button>
      ))}
    </div>
  )
}
