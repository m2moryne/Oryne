import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'oryne.admin.theme'

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // Fall through to the system setting.
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/** Light or dark, following the system until chosen, then remembered in this browser. */
export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(initial)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const choose = (next: Theme) => {
    setTheme(next)
    try {
      localStorage.setItem(KEY, next)
    } catch {
      // Not remembered; it still applies for this visit.
    }
  }
  return [theme, choose]
}
