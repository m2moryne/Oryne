import { ArrowRight, Code, Play } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Container } from '../../components/Section'
import { cn } from '../../lib/cn'
import { PREVIEW_ON } from '../../lib/flags'
import { HeroField } from './HeroField'

/** "Machines can now ___." The first entry is the headline of record. */
const verbs = ['pay', 'buy', 'book', 'hire']

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
      className="tone-white relative isolate flex min-h-svh flex-col overflow-hidden pt-(--nav-h)"
    >
      {/* Decorative background, desktop only; hidden, the canvas stops animating. */}
      <div className="absolute inset-0 -z-10 hidden lg:block">
        <HeroField />
      </div>

      <Container className="grid flex-1 items-center py-12 md:py-16 lg:grid-cols-12 lg:gap-x-8">
        <div className="lg:col-span-7">
          {/* Screen readers get one stable sentence; the rotation is visual only. */}
          <h1 id="hero-title" aria-label="Machines can now pay. Within your limits." className="type-display">
            <span aria-hidden="true" className="block">
              Machines can
            </span>
            <span aria-hidden="true" className="block">
              now{' '}
              <span key={index} className={cn('swap text-burgundy', leaving && 'is-leaving')}>
                {verbs[index]}.
              </span>
            </span>
            <span aria-hidden="true" className="mt-3 block text-[0.42em] tracking-[-0.03em] text-muted md:mt-4">
              Within your limits.
            </span>
          </h1>
          <p className="type-lede mt-10 max-w-xl text-muted md:mt-14">
            Oryne is the mandate layer for agent payments on Stellar. Give an AI agent a wallet it
            can spend from, and limits it cannot break: enforced by a smart contract, not a promise.
          </p>
          {/* Equal columns keep both calls to action the same size; on phones they stack full width. */}
          <div className="mt-10 grid gap-4 sm:inline-grid sm:grid-cols-2">
            <Button to="/app/agents?connect=1" icon={ArrowRight}>
              Connect an agent
            </Button>
            {PREVIEW_ON ? (
              <Button to="/dev/playground" variant="outline" leadingIcon={Play}>
                Watch demo
              </Button>
            ) : (
              <Button to="/app/developers" variant="outline" leadingIcon={Code}>
                For developers
              </Button>
            )}
          </div>
        </div>
      </Container>
    </section>
  )
}
