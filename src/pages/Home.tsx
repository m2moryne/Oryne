import { usePageMeta } from '../hooks/usePageMeta'
import { Beginning } from '../sections/home/Beginning'
import { Building } from '../sections/home/Building'
import { Faq } from '../sections/home/Faq'
import { Hero } from '../sections/home/Hero'
import { Shift } from '../sections/home/Shift'

export default function Home() {
  usePageMeta(
    'Oryne — Infrastructure for autonomous commerce',
    'Oryne gives autonomous systems the infrastructure to discover services, authorize spending, and transact with the world without human intervention.',
  )

  return (
    <>
      <Hero />
      <Shift />
      <Building />
      <Beginning />
      <Faq />
    </>
  )
}
