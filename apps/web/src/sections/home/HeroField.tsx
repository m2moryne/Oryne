import { useEffect, useRef } from 'react'

const LINES = 72
const INK = '32, 32, 32'
const RAIL = '184, 174, 161'
const BURGUNDY = '110, 31, 42'
const PURPLE = '67, 48, 90'

type Pulse = { line: number; start: number; duration: number; reverse: boolean; color: string }

/**
 * Decorative hero drawing. Hairlines are strung between two interlocked squares
 * and slowly shift as one surface; every so often a payment crosses along one.
 */
export function HeroField() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let width = 0
    let height = 0
    let frame = 0
    let visible = true
    let nextPulse = 600
    let pulses: Pulse[] = []

    /** Point `u` (0–1) along the perimeter of a square turned by `rotation`. */
    const onSquare = (u: number, rotation: number) => {
      const radius = Math.min(width, height) / 2 - 14
      const position = (((u % 1) + 1) % 1) * 4
      const side = Math.floor(position)
      const along = position - side
      const from = rotation + (side * Math.PI) / 2
      const to = from + Math.PI / 2
      return {
        x: width / 2 + radius * (Math.cos(from) + (Math.cos(to) - Math.cos(from)) * along),
        y: height / 2 + radius * (Math.sin(from) + (Math.sin(to) - Math.sin(from)) * along),
      }
    }

    /**
     * Two interlocked squares, an eighth of a turn apart, turning slowly as one
     * figure. Line `i` runs from the first square to the second; the point it
     * lands on drifts, which is what makes the surface between them move.
     */
    const turn = (time: number) => time * 0.00004
    const ends = (i: number, time: number) => {
      const u = i / LINES
      const drift = 0.31 + 0.14 * Math.sin(time * 0.00018)
      const a = onSquare(u, turn(time))
      const b = onSquare(u + drift, turn(time) + Math.PI / 4)
      return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }
    }

    const draw = (time: number) => {
      ctx.clearRect(0, 0, width, height)
      ctx.lineWidth = 1

      ctx.strokeStyle = `rgb(${RAIL})`
      for (const rotation of [turn(time), turn(time) + Math.PI / 4]) {
        ctx.beginPath()
        for (let corner = 0; corner < 4; corner++) {
          const { x, y } = onSquare(corner / 4, rotation)
          if (corner === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        }
        ctx.closePath()
        ctx.stroke()
      }

      ctx.strokeStyle = `rgba(${INK}, 0.45)`
      ctx.fillStyle = `rgb(${INK})`
      ctx.beginPath()
      for (let i = 0; i < LINES; i++) {
        const { x0, y0, x1, y1 } = ends(i, time)
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.fillRect(x0 - 1.5, y0 - 1.5, 3, 3)
      }
      ctx.stroke()

      pulses = pulses.filter((pulse) => time - pulse.start < pulse.duration * 1.4)
      for (const pulse of pulses) {
        const progress = (time - pulse.start) / pulse.duration
        const travel = Math.min(progress, 1)
        const eased = travel * travel * (3 - 2 * travel)
        const { x0, y0, x1, y1 } = ends(pulse.line, time)
        const [fromX, fromY, toX, toY] = pulse.reverse ? [x1, y1, x0, y0] : [x0, y0, x1, y1]

        // The line being paid along, fading out after arrival.
        const fade = progress <= 1 ? Math.min(progress * 4, 1) : 1 - (progress - 1) / 0.4
        ctx.strokeStyle = `rgba(${pulse.color}, ${fade})`
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x1, y1)
        ctx.stroke()

        if (progress <= 1) {
          const x = fromX + (toX - fromX) * eased
          const y = fromY + (toY - fromY) * eased
          ctx.fillStyle = `rgb(${pulse.color})`
          ctx.fillRect(x - 3.5, y - 3.5, 7, 7)
        } else {
          // Arrival: a square ring opens at the receiving end.
          const ring = (progress - 1) / 0.4
          const size = 7 + ring * 20
          ctx.strokeStyle = `rgba(${pulse.color}, ${1 - ring})`
          ctx.lineWidth = 1
          ctx.strokeRect(toX - size / 2, toY - size / 2, size, size)
          ctx.fillStyle = `rgba(${pulse.color}, ${1 - ring})`
          ctx.fillRect(toX - 3.5, toY - 3.5, 7, 7)
        }
      }
    }

    const tick = (time: number) => {
      if (time > nextPulse && pulses.length < 3) {
        pulses.push({
          line: Math.floor(Math.random() * LINES),
          start: time,
          duration: 1500 + Math.random() * 900,
          reverse: Math.random() < 0.5,
          color: Math.random() < 0.25 ? PURPLE : BURGUNDY,
        })
        nextPulse = time + 700 + Math.random() * 1500
      }
      draw(time)
      if (visible) frame = requestAnimationFrame(tick)
    }

    const drawStill = () => {
      pulses = [{ line: 15, start: 0, duration: 2000, reverse: false, color: BURGUNDY }]
      draw(1200)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      if (reducedMotion) drawStill()
    }

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    // Only animate while the hero is on screen.
    const viewObserver = new IntersectionObserver(([entry]) => {
      const wasVisible = visible
      visible = entry.isIntersecting
      if (visible && !wasVisible && !reducedMotion) frame = requestAnimationFrame(tick)
    })
    viewObserver.observe(canvas)

    if (!reducedMotion) frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      viewObserver.disconnect()
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="block size-full" />
}
