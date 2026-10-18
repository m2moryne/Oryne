import { usePageMeta } from '../hooks/usePageMeta'
import { publicPages } from '../lib/seo'
import { AutonomousSystems } from '../sections/vision/AutonomousSystems'
import { Infrastructure } from '../sections/vision/Infrastructure'
import { LongTerm } from '../sections/vision/LongTerm'
import { Roadmap } from '../sections/vision/Roadmap'
import { VisionHero } from '../sections/vision/VisionHero'

export default function Vision() {
  usePageMeta(publicPages.vision)

  return (
    <>
      <VisionHero />
      <AutonomousSystems />
      <Infrastructure />
      <Roadmap />
      <LongTerm />
    </>
  )
}
