import type { LucideIcon } from 'lucide-react'

type IconProps = {
  icon: LucideIcon
  size?: number
  className?: string
}

/** Thin, monochrome, decorative. Meaning always lives in adjacent text. */
export function Icon({ icon: Glyph, size = 18, className }: IconProps) {
  return <Glyph size={size} strokeWidth={1.25} className={className} aria-hidden="true" />
}
