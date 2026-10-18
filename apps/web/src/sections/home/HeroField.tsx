import { useEffect, useRef } from 'react'

const INK = '32, 32, 32'
const BURGUNDY = '110, 31, 42'
const PURPLE = '67, 48, 90'

/** Perspective distance, in multiples of the sphere's radius. */
const CAMERA = 5
/** How far the cursor reaches, and how hard it pushes, in px. */
const REACH = 150
const PUSH = 46

type Particle = {
  /** Home on the sphere, as a unit vector scaled by `depth` (0–1 from the centre). */
  x: number
  y: number
  z: number
  seed: number
  color: string
  /** Current push from the cursor, eased toward its target each frame. */
  ox: number
  oy: number
}

type Pulse = { from: number; to: number; start: number; duration: number }

/** Fibonacci sphere: evenly spread points, most on the shell and some inside. */
function makeParticles(count: number): Particle[] {
  const golden = Math.PI * (3 - Math.sqrt(5))
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - (i / (count - 1)) * 2
    const ring = Math.sqrt(1 - y * y)
    const angle = i * golden
    const depth = Math.random() < 0.78 ? 0.86 + Math.random() * 0.14 : 0.25 + Math.random() * 0.6
    const roll = Math.random()
    return {
      x: Math.cos(angle) * ring * depth,
      y: y * depth,
      z: Math.sin(angle) * ring * depth,
      seed: Math.random() * Math.PI * 2,
      color: roll < 0.1 ? BURGUNDY : roll < 0.14 ? PURPLE : INK,
      ox: 0,
      oy: 0,
    }
  })
}

/**
 * Decorative hero background. A sphere of particles drifts on a slow flow
 * field and turns; the cursor scatters the particles near it, but an unseen
 * boundary, the mandate, holds every one of them in. Now and then a payment crosses.
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
    let running = false
    let visible = true
    let particles: Particle[] = []
    let pulses: Pulse[] = []
    let nextPulse = 1200
    const pointer = { x: -1e4, y: -1e4 }
    // Screen positions from the last frame, for pulses to travel between.
    let screen = new Float32Array(0)

    /** Sphere centre and radius: to the right of the headline, clear of the copy. */
    const layout = () => ({
      cx: width * 0.72,
      cy: height * 0.52,
      radius: Math.min(height * 0.3, width * 0.2),
    })

    const draw = (time: number) => {
      const { cx, cy, radius } = layout()
      const turn = time * 0.00009
      const tilt = 0.38
      const [sinT, cosT] = [Math.sin(turn), Math.cos(turn)]
      const [sinX, cosX] = [Math.sin(tilt), Math.cos(tilt)]
      // Unseen limit the cursor can't push particles past.
      const boundary = radius * 1.3

      ctx.clearRect(0, 0, width, height)

      ctx.lineWidth = 1

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        // Flow field: each point wanders around its home, never far.
        const wander = 0.045
        let x = p.x + Math.sin(p.y * 3.1 + time * 0.00041 + p.seed) * wander
        let y = p.y + Math.cos(p.z * 2.7 - time * 0.00035 + p.seed) * wander
        let z = p.z + Math.sin(p.x * 2.3 + time * 0.0003) * wander

        // Turn about the vertical axis, then tilt toward the viewer.
        ;[x, z] = [x * cosT - z * sinT, x * sinT + z * cosT]
        ;[y, z] = [y * cosX - z * sinX, y * sinX + z * cosX]

        const scale = CAMERA / (CAMERA - z)
        let sx = cx + x * radius * scale
        let sy = cy + y * radius * scale

        // The cursor pushes nearby particles away; they ease back when it leaves.
        const dx = sx - pointer.x
        const dy = sy - pointer.y
        const distance = Math.hypot(dx, dy)
        let tx = 0
        let ty = 0
        if (distance < REACH && distance > 0.01) {
          const force = (1 - distance / REACH) ** 2 * PUSH
          tx = (dx / distance) * force
          ty = (dy / distance) * force
        }
        p.ox += (tx - p.ox) * 0.08
        p.oy += (ty - p.oy) * 0.08
        sx += p.ox
        sy += p.oy

        // However hard it's pushed, nothing leaves the boundary: the mandate.
        const fromCentre = Math.hypot(sx - cx, sy - cy)
        const limit = boundary - 3
        if (fromCentre > limit) {
          sx = cx + ((sx - cx) / fromCentre) * limit
          sy = cy + ((sy - cy) / fromCentre) * limit
        }

        screen[i * 2] = sx
        screen[i * 2 + 1] = sy

        const near = (z + 1) / 2
        const stirred = Math.min(Math.hypot(p.ox, p.oy) / PUSH, 1)
        const size = (1 + near * 1.8) * (1 + stirred * 0.6)
        ctx.globalAlpha = Math.min(0.18 + near * 0.72 + stirred * 0.3, 0.95)
        ctx.fillStyle = `rgb(${p.color})`
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size)
      }
      ctx.globalAlpha = 1

      // Payments: a bright square travels from one particle to another.
      pulses = pulses.filter((pulse) => time - pulse.start < pulse.duration + 500)
      for (const pulse of pulses) {
        const progress = (time - pulse.start) / pulse.duration
        const [fx, fy] = [screen[pulse.from * 2], screen[pulse.from * 2 + 1]]
        const [tx, ty] = [screen[pulse.to * 2], screen[pulse.to * 2 + 1]]
        if (progress <= 1) {
          const eased = 1 - (1 - progress) ** 3
          const x = fx + (tx - fx) * eased
          const y = fy + (ty - fy) * eased
          ctx.strokeStyle = `rgba(${BURGUNDY}, 0.35)`
          ctx.beginPath()
          ctx.moveTo(fx, fy)
          ctx.lineTo(x, y)
          ctx.stroke()
          ctx.fillStyle = `rgb(${BURGUNDY})`
          ctx.fillRect(x - 3, y - 3, 6, 6)
        } else {
          // Settled: a square ring opens where it lands.
          const ring = (time - pulse.start - pulse.duration) / 500
          const size = 6 + ring * 18
          ctx.strokeStyle = `rgba(${BURGUNDY}, ${1 - ring})`
          ctx.strokeRect(tx - size / 2, ty - size / 2, size, size)
        }
      }
    }

    const tick = (time: number) => {
      if (time > nextPulse && pulses.length < 2 && particles.length > 1) {
        const from = Math.floor(Math.random() * particles.length)
        let to = Math.floor(Math.random() * particles.length)
        if (to === from) to = (to + 1) % particles.length
        pulses.push({ from, to, start: time, duration: 1300 + Math.random() * 700 })
        nextPulse = time + 1800 + Math.random() * 2200
      }
      draw(time)
      frame = requestAnimationFrame(tick)
    }

    const start = () => {
      if (running || reducedMotion || !visible || document.hidden || width === 0) return
      running = true
      frame = requestAnimationFrame(tick)
    }
    const stop = () => {
      running = false
      cancelAnimationFrame(frame)
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      width = rect.width
      height = rect.height
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      // Denser on bigger screens, within what a 2D canvas draws smoothly.
      const count = Math.round(Math.min(Math.max((width * height) / 450, 1400), 3200))
      if (count !== particles.length) {
        particles = makeParticles(count)
        screen = new Float32Array(count * 2)
        pulses = []
      }
      if (width === 0) stop()
      else if (reducedMotion) draw(4000)
      else start()
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect()
      pointer.x = event.clientX - rect.left
      pointer.y = event.clientY - rect.top
    }
    const onPointerLeave = () => {
      pointer.x = -1e4
      pointer.y = -1e4
    }
    const onVisibility = () => (document.hidden ? stop() : start())

    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(canvas)
    resize()

    // Only animate while the hero is on screen.
    const viewObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else stop()
    })
    viewObserver.observe(canvas)

    // The canvas sits behind the copy, so listen on the page.
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      resizeObserver.disconnect()
      viewObserver.disconnect()
      window.removeEventListener('pointermove', onPointerMove)
      document.documentElement.removeEventListener('pointerleave', onPointerLeave)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return <canvas ref={ref} aria-hidden="true" className="block size-full" />
}
