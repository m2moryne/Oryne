import { ArrowLeft, Coins, ShieldCheck, Store, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Panel } from '../../app/ui'
import { Icon } from '../../components/Icon'

/** Owner dashboard pages that are linked in the sidebar but not built yet. */
export const soonPages: Array<{ slug: string; label: string; icon: LucideIcon; title: string; text: string }> = [
  {
    slug: 'services',
    label: 'Services',
    icon: Store,
    title: 'A marketplace for your agents',
    text: 'Find APIs and tools your agents can pay for per request, see what each one costs, and choose which services every agent may buy from.',
  },
  {
    slug: 'wallet',
    label: 'Wallet',
    icon: ShieldCheck,
    title: 'Your wallet, up close',
    text: 'The contract that holds your funds: its owner, its rules, the agents it trusts, and every change made to it on Stellar.',
  },
  {
    slug: 'funds',
    label: 'Funds',
    icon: Coins,
    title: 'Money in, money out',
    text: 'Top up your wallet with USDC and move it back out whenever you like, with every deposit and withdrawal in one place.',
  },
]

/** A page that's on its way: what it will do, and a way back to what works today. */
export default function ComingSoon({ slug }: { slug: string }) {
  const page = soonPages.find((candidate) => candidate.slug === slug)!

  return (
    <div className="space-y-4">
      <h1 className="text-2xl tracking-[-0.02em]">{page.label}</h1>
      <Panel>
        <div className="flex flex-col items-center px-4 py-14 text-center">
          <span className="flex size-14 items-center justify-center rounded-full border border-taupe/60 text-muted">
            <Icon icon={page.icon} size={22} />
          </span>
          <p className="mt-6 inline-flex items-center gap-2 rounded-full border border-taupe/60 px-3 py-1 text-xs text-muted">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-burgundy" />
            Coming soon
          </p>
          <h2 className="mt-4 text-xl tracking-[-0.01em]">{page.title}</h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-muted">{page.text}</p>
          <Link
            to="/app"
            className="mt-8 inline-flex items-center gap-2 text-sm underline-offset-4 hover:underline"
          >
            <Icon icon={ArrowLeft} size={15} />
            Back to overview
          </Link>
        </div>
      </Panel>
    </div>
  )
}
