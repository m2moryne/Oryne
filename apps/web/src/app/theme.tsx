import { Moon, Sun } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { Icon } from '../components/Icon'
import { cn } from '../lib/cn'

/**
 * Light or dark for the dashboards (owner, developer console and their
 * previews). One choice, remembered in this browser; until someone picks,
 * each area keeps its own default.
 */

export type Theme = 'light' | 'dark'

const KEY = 'oryne.dashboard.theme'
const listeners = new Set<() => void>()

function read(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

let current = read()

function choose(theme: Theme) {
  current = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    // Not remembered; it still applies for this visit.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The chosen theme, or `fallback` until one is chosen, and a setter. */
export function useTheme(fallback: Theme): [Theme, (theme: Theme) => void] {
  const chosen = useSyncExternalStore(subscribe, () => current, () => null)
  return [chosen ?? fallback, choose]
}

/** Round sun / moon button. `onDark` styles it for a dark surface such as the sidebar. */
export function ThemeToggle({ theme, onChange, onDark }: { theme: Theme; onChange: (theme: Theme) => void; onDark?: boolean }) {
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors',
        onDark
          ? 'border-cream/20 text-cream/70 hover:border-cream/50 hover:text-cream'
          : 'border-taupe/70 text-muted hover:border-charcoal hover:text-charcoal',
      )}
    >
      <Icon icon={theme === 'dark' ? Sun : Moon} size={16} />
    </button>
  )
}
