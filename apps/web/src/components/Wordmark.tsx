import { Logo } from './Logo'

/** The Oryne logo (mark + wordmark). Sized by the surrounding font-size; letters follow the text colour. */
export function Wordmark({ className, variant = 'full' }: { className?: string; variant?: 'full' | 'mark' }) {
  return <Logo variant={variant} className={className} />
}
