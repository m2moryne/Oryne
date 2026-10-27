import { useEffect, useRef } from 'react'

const CREAM = '246, 242, 234'
const BURGUNDY = '196, 74, 92'
/** Grid spacing, in CSS px. */
const GAP = 22

/**
 * Decorative background for the sign-in pages: a grid of dots that slow waves
 * pass through, brightening as they go, with a few burgundy dots on the crests.
 * Still when the visitor prefers reduced motion; paused when the tab is hidden.
 */
export function SignInField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let frame = 0
    // A fixed handful of grid cells get the accent colour.
    let accents = new Set<number>()

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = canvas.clientWidth
      height = canvas.clientHeight
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      const cells = Math.ceil(width / GAP) * Math.ceil(height / GAP)
      accents = new Set(Array.from({ length: Math.round(cells / 90) }, () => Math.floor(Math.random() * cells)))
    }

    const draw = (time: number) => {
      const t = time / 1000
      ctx.clearRect(0, 0, width, height)
      const columns = Math.ceil(width / GAP)
      const rows = Math.ceil(height / GAP)
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = column * GAP + GAP / 2
          const y = row * GAP + GAP / 2
          // Two waves at different angles and speeds; their sum is 0–1.
          const a = Math.sin(x * 0.012 + y * 0.006 - t * 0.6)
          const b = Math.sin(x * -0.004 + y * 0.011 - t * 0.35 + 1.7)
          const wave = Math.max(0, (a + b) / 2)
          const crest = wave ** 3
          const accent = accents.has(row * columns + column) && crest > 0.35
          ctx.fillStyle = `rgba(${accent ? BURGUNDY : CREAM}, ${accent ? 0.35 + crest * 0.6 : 0.07 + crest * 0.5})`
          ctx.beginPath()
          ctx.arc(x, y, 0.9 + crest * 1.1, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    const loop = (time: number) => {
      draw(time)
      frame = requestAnimationFrame(loop)
    }

    const start = () => {
      cancelAnimationFrame(frame)
      if (reducedMotion) draw(4000)
      else frame = requestAnimationFrame(loop)
    }

    const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : start())
    const observer = new ResizeObserver(() => {
      resize()
      if (reducedMotion) draw(4000)
    })

    resize()
    start()
    observer.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className={className} />
}
