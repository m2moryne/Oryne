import { usePageMeta } from '../hooks/usePageMeta'
import { Audiences } from '../sections/home/Audiences'
import { Closing } from '../sections/home/Closing'
import { Faq } from '../sections/home/Faq'
import { Guarantee } from '../sections/home/Guarantee'
import { Hero } from '../sections/home/Hero'
import { HowItWorks } from '../sections/home/HowItWorks'
import { OnStellar } from '../sections/home/OnStellar'
import { Shift } from '../sections/home/Shift'

export default function Home() {
  usePageMeta(
    'Oryne — Wallets for AI agents, with limits they can’t break',
    'Oryne is the mandate layer for agent payments on Stellar: give an AI agent a wallet it can spend from, with budgets and permissions enforced on-chain.',
  )

  return (
    <>
      <Hero />
      <Shift />
      <HowItWorks />
      <Guarantee />
      <Audiences />
      <OnStellar />
      <Faq />
      <Closing />
    </>
  )
}
