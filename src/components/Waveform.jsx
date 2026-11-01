import { useEffect, useRef, useState } from 'react'
import { clamp, round1 } from '../util'

const H = 132

export function Waveform({ peaks, duration, start, end, playhead, onChange }) {
  const wrap = useRef(null)
  const canvas = useRef(null)
  const drag = useRef(null)
  const [w, setW] = useState(320)

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(el.clientWidth || 320))
    ro.observe(el)
    setW(el.clientWidth || 320)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = canvas.current
    if (!c || duration <= 0) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.floor(w * dpr)
    c.height = Math.floor(H * dpr)
    const g = c.getContext('2d')
    if (!g) return
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, w, H)

    const n = peaks.length
    const barW = w / n
    const xs = (start / duration) * w
    const xe = (end / duration) * w

    for (let i = 0; i < n; i++) {
      const x = i * barW
      const inside = x + barW / 2 >= xs && x + barW / 2 <= xe
      const h = Math.max(3, peaks[i] * (H - 28))
      g.fillStyle = inside ? '#f5c451' : '#3a4780'
      g.fillRect(x + 0.5, (H - h) / 2, Math.max(1, barW - 1.5), h)
    }

    // alças
    for (const x of [xs, xe]) {
      g.fillStyle = '#ffffff'
      g.fillRect(x - 1.5, 0, 3, H)
      g.beginPath()
      g.arc(x, 10, 9, 0, Math.PI * 2)
      g.arc(x, H - 10, 9, 0, Math.PI * 2)
      g.fillStyle = '#f5c451'
      g.fill()
      g.strokeStyle = '#0b1020'
      g.lineWidth = 2
      g.stroke()
    }

    if (playhead != null) {
      const px = clamp(playhead / duration, 0, 1) * w
      g.fillStyle = '#ef4444'
      g.fillRect(px - 1, 0, 2, H)
    }
  }, [peaks, duration, start, end, playhead, w])

  const minGap = Math.min(0.3, duration / 2)

  const timeAt = (clientX) => {
    const r = wrap.current?.getBoundingClientRect()
    if (!r) return 0
    return clamp((clientX - r.left) / r.width, 0, 1) * duration
  }

  const apply = (which, t) => {
    if (which === 'start') onChange(round1(clamp(t, 0, end - minGap)), end)
    else onChange(start, round1(clamp(t, start + minGap, duration)))
  }

  return (
    <div
      ref={wrap}
      className="w-full rounded-xl bg-panel border border-line overflow-hidden"
      style={{ touchAction: 'none', height: H }}
      onPointerDown={(e) => {
        const t = timeAt(e.clientX)
        const which = Math.abs(t - start) <= Math.abs(t - end) ? 'start' : 'end'
        drag.current = which
        e.currentTarget.setPointerCapture(e.pointerId)
        apply(which, t)
      }}
      onPointerMove={(e) => {
        if (drag.current) apply(drag.current, timeAt(e.clientX))
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
    >
      <canvas ref={canvas} style={{ width: '100%', height: H, display: 'block' }} />
    </div>
  )
}
