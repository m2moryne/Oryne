import { useEffect, useState } from 'react'
import { Container } from '../../components/Section'
import { cn } from '../../lib/cn'
import { HeroField } from './HeroField'

/** "Machines can now ___." The first entry is the headline of record. */
const verbs = ['pay', 'buy', 'sell', 'trade', 'settle']

const HOLD_MS = 2400
const LEAVE_MS = 320

export function Hero() {
  const [index, setIndex] = useState(0)
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    // With reduced motion the headline simply stays on the first word.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = leaving
      ? setTimeout(() => {
          setIndex((current) => (current + 1) % verbs.length)
          setLeaving(false)
        }, LEAVE_MS)
      : setTimeout(() => setLeaving(true), HOLD_MS)
    return () => clearTimeout(timer)
  }, [leaving])

  return (
    <section
      aria-labelledby="hero-title"
      className="tone-cream flex min-h-svh flex-col pt-(--nav-h)"
    >
      <Container className="grid flex-1 items-center gap-y-14 py-16 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-7">
          {/* Screen readers get one stable sentence; the rotation is visual only. */}
          <h1 id="hero-title" aria-label="Machines can now pay." className="type-display">
            <span aria-hidden="true" className="block">
              Machines can
            </span>
            <span aria-hidden="true" className="block">
              now{' '}
              <span key={index} className={cn('swap text-burgundy', leaving && 'is-leaving')}>
                {verbs[index]}.
              </span>
            </span>
          </h1>
          <p className="type-lede mt-10 max-w-xl text-muted md:mt-14">
            Oryne gives autonomous systems the infrastructure to discover services, authorize
            spending, and transact with the world without human intervention.
          </p>
        </div>

        <div className="mx-auto aspect-square w-full max-w-sm lg:col-span-5 lg:max-w-[min(100%,66svh)]">
          <HeroField />
        </div>
      </Container>
    </section>
  )
}
