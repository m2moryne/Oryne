import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { Icon } from './Icon'

type ButtonProps = {
  children: ReactNode
  variant?: 'primary' | 'accent' | 'light' | 'outline'
  size?: 'sm' | 'md'
  /** Trailing icon; nudges forward on hover. */
  icon?: LucideIcon
  /** Leading icon; stays put. */
  leadingIcon?: LucideIcon
  /** Internal route. Renders a router link. */
  to?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
  className?: string
}

const variants = {
  primary: 'border-charcoal bg-charcoal text-cream hover:border-burgundy hover:bg-burgundy',
  accent: 'border-burgundy bg-burgundy text-cream hover:border-charcoal hover:bg-charcoal',
  /** For dark surfaces such as the navigation bar. */
  light: 'border-cream bg-cream text-charcoal hover:border-burgundy hover:bg-burgundy hover:text-cream',
  outline: 'border-taupe bg-transparent text-charcoal hover:border-charcoal',
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
  leadingIcon,
  to,
  type = 'button',
  onClick,
  disabled,
  className,
}: ButtonProps) {
  const classes = cn(
    'group inline-flex shrink-0 items-center justify-center gap-3 rounded-full border font-medium uppercase whitespace-nowrap transition-colors duration-300 ease-quiet disabled:pointer-events-none disabled:opacity-45',
    variants[variant],
    sizes[size],
    className,
  )

  const content = (
    <>
      {leadingIcon && <Icon icon={leadingIcon} size={16} />}
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
      <Link to={to} onClick={onClick} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled} className={classes}>
      {content}
    </button>
  )
}
