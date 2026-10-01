import { usePageMeta } from '../hooks/usePageMeta'
import { AutonomousSystems } from '../sections/vision/AutonomousSystems'
import { Infrastructure } from '../sections/vision/Infrastructure'
import { LongTerm } from '../sections/vision/LongTerm'
import { VisionHero } from '../sections/vision/VisionHero'

export default function Vision() {
  usePageMeta(
    'Vision — Oryne',
    'An economy where software can act. Oryne on autonomous systems, the infrastructure they require, and the long term.',
  )

  return (
    <>
      <VisionHero />
      <AutonomousSystems />
      <Infrastructure />
      <LongTerm />
    </>
  )
}
