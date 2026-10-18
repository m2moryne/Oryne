import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { Audiences } from '../sections/home/Audiences'
import { Closing } from '../sections/home/Closing'
import { Faq } from '../sections/home/Faq'
import { Guarantee } from '../sections/home/Guarantee'
import { Hero } from '../sections/home/Hero'
import { HowItWorks } from '../sections/home/HowItWorks'
import { OnStellar } from '../sections/home/OnStellar'
import { Shift } from '../sections/home/Shift'

export default function Home() {
  usePageMeta(publicPages.home)

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
