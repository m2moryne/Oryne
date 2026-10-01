import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'

type TextLinkProps = {
  children: ReactNode
  /** Internal route. */
  to?: string
  /** External, mailto or in-page anchor. */
  href?: string
  className?: string
}

export function TextLink({ children, to, href, className }: TextLinkProps) {
  const classes = cn(
    'inline-flex items-center gap-2 border-b border-current/30 pb-1 transition-colors duration-300 ease-quiet hover:border-current',
    className,
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    )
  }

  return (
    <a href={href} className={classes}>
      {children}
    </a>
  )
}
