import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Each page opens at the top, or at its anchor when the URL carries one.
 * In-page anchor clicks are left to the browser.
 */
export function ScrollManager() {
  const { pathname } = useLocation()

  useEffect(() => {
    const anchor = window.location.hash && document.getElementById(window.location.hash.slice(1))
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'instant' })
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    }
  }, [pathname])

  return null
}
