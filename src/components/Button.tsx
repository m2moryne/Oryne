import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'accent' | 'light'
  size?: 'sm' | 'md'
  icon?: LucideIcon
  /** Internal route. Renders a router link. */
  to?: string
  type?: 'button' | 'submit'
  className?: string
}

const variants = {
  primary: 'border-charcoal bg-charcoal text-cream hover:border-burgundy hover:bg-burgundy',
  accent: 'border-burgundy bg-burgundy text-cream hover:border-charcoal hover:bg-charcoal',
  /** For dark surfaces such as the navigation bar. */
  light: 'border-cream bg-cream text-charcoal hover:border-burgundy hover:bg-burgundy hover:text-cream',
}

const sizes = {
  sm: 'h-10 px-6 text-[0.6875rem] tracking-[0.18em]',
  md: 'h-14 px-9 text-xs tracking-[0.18em]',
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  to,
  type = 'button',
  className,
}: ButtonProps) {
  const classes = cn(
    'group inline-flex shrink-0 items-center justify-center gap-3 rounded-full border font-medium uppercase whitespace-nowrap transition-colors duration-300 ease-quiet',
    variants[variant],
    sizes[size],
    className,
  )

  const content = (
    <>
      {children}
      {icon && (
        <Icon
          icon={icon}
          size={16}
          className="transition-transform duration-300 ease-quiet group-hover:translate-x-1"
        />
      )}
    </>
  )

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} className={classes}>
      {content}
    </button>
  )
}
