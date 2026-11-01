import { db } from './db'
import { clamp } from './util'

export const entryKey = (e) => `${e.id}|${e.audioId}|${e.startSec}|${e.endSec}`

function slice(ctx, buf, start, end) {
  const sr = buf.sampleRate
  const s = Math.floor(clamp(start, 0, buf.duration) * sr)
  const e = Math.max(Math.floor(clamp(end, 0, buf.duration) * sr), s + 1)
  const out = ctx.createBuffer(buf.numberOfChannels, e - s, sr)
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).subarray(s, e), ch)
  }
  return out
}

class AudioEngine {
  _ctx = null
  trimmed = new Map()
  failed = new Set()
  full = null
  current = null
  chain = Promise.resolve()

  get ctx() {
    if (!this._ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      this._ctx = new AC()
    }
    return this._ctx
  }

  /** Precisa ser chamado dentro de um toque do usuário (política de autoplay). */
  async unlock() {
    const c = this.ctx
    if (c.state !== 'running') await c.resume()
    const b = c.createBuffer(1, 1, 22050)
    const s = c.createBufferSource()
    s.buffer = b
    s.connect(c.destination)
    s.start(0)
  }

  async decodeFull(audioId) {
    if (this.full?.id === audioId) return this.full.buf
    const rec = await db.audios.get(audioId)
    if (!rec) throw new Error('Áudio não encontrado')
    const data = await rec.blob.arrayBuffer()
    const buf = await this.ctx.decodeAudioData(data)
    this.full = { id: audioId, buf }
    return buf
  }

  releaseFull() {
    this.full = null
  }

  /** Decodifica e recorta o trecho, deixando-o pronto na memória. */
  prepare(e) {
    if (!e.audioId) return Promise.resolve(null)
    const key = entryKey(e)
    const hit = this.trimmed.get(key)
    if (hit) return Promise.resolve(hit)
    const run = async () => {
      const again = this.trimmed.get(key)
      if (again) return again
      try {
        const full = await this.decodeFull(e.audioId)
        const buf = slice(this.ctx, full, e.startSec, e.endSec)
        this.trimmed.set(key, buf)
        this.failed.delete(key)
        return buf
      } catch {
        this.failed.add(key)
        return null
      }
    }
    const p = this.chain.then(run, run)
    this.chain = p
    return p
  }

  isReady = (e) => this.trimmed.has(entryKey(e))
  isFailed = (e) => this.failed.has(entryKey(e))
  readyCount = (list) => list.filter((e) => this.isReady(e)).length

  prune(list) {
    const valid = new Set(list.map(entryKey))
    for (const k of [...this.trimmed.keys()]) if (!valid.has(k)) this.trimmed.delete(k)
    for (const k of [...this.failed]) if (!valid.has(k)) this.failed.delete(k)
  }

  async play(e, onEnded) {
    const buf = this.trimmed.get(entryKey(e)) ?? (await this.prepare(e))
    if (!buf) return false
    this.start(buf, 0, buf.duration, e.fadeIn, e.fadeOut, e.volume, onEnded)
    return true
  }

  /** Toca um intervalo do arquivo inteiro (usado no editor). */
  async playRange(audioId, start, end, fadeIn, fadeOut, volume, onEnded) {
    const buf = await this.decodeFull(audioId)
    const s = clamp(start, 0, buf.duration)
    const d = clamp(end, s + 0.05, buf.duration) - s
    this.start(buf, s, d, fadeIn, fadeOut, volume, onEnded)
  }

  start(buf, offset, dur, fadeIn, fadeOut, volume, onEnded) {
    const ctx = this.ctx
    if (ctx.state !== 'running') void ctx.resume()
    this.stop(0.05)

    const vol = clamp(volume, 0, 1)
    const fi = clamp(fadeIn, 0, dur / 2)
    const fo = clamp(fadeOut, 0, dur / 2)
    const t = ctx.currentTime + 0.02

    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    src.connect(gain)
    gain.connect(ctx.destination)

    gain.gain.setValueAtTime(fi > 0 ? 0 : vol, t)
    if (fi > 0) gain.gain.linearRampToValueAtTime(vol, t + fi)
    if (fo > 0) {
      gain.gain.setValueAtTime(vol, t + dur - fo)
      gain.gain.linearRampToValueAtTime(0, t + dur)
    }

    const p = { src, gain, startedAt: t, duration: dur, stopped: false }
    src.onended = () => {
      const natural = !p.stopped
      if (this.current === p) this.current = null
      try {
        src.disconnect()
        gain.disconnect()
      } catch {
        /* já desconectado */
      }
      onEnded?.(natural)
    }
    this.current = p
    src.start(t, offset, dur)
  }

  stop(fade = 0.4) {
    const p = this.current
    if (!p) return
    p.stopped = true
    this.current = null
    const now = this.ctx.currentTime
    try {
      const g = p.gain.gain
      const v = g.value
      g.cancelScheduledValues(now)
      g.setValueAtTime(v, now)
      g.linearRampToValueAtTime(0, now + Math.max(fade, 0.01))
      p.src.stop(now + Math.max(fade, 0.01) + 0.02)
    } catch {
      /* já parou */
    }
  }

  isPlaying = () => this.current !== null

  progress() {
    const p = this.current
    if (!p) return null
    return {
      elapsed: clamp(this.ctx.currentTime - p.startedAt, 0, p.duration),
      duration: p.duration,
    }
  }
}

export const engine = new AudioEngine()

export function computePeaks(buf, buckets) {
  const out = new Array(buckets).fill(0)
  const len = buf.length
  const per = Math.max(1, Math.floor(len / buckets))
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch)
    for (let b = 0; b < buckets; b++) {
      let max = 0
      const from = b * per
      const to = Math.min(len, from + per)
      for (let i = from; i < to; i += 4) {
        const v = Math.abs(data[i])
        if (v > max) max = v
      }
      if (max > out[b]) out[b] = max
    }
  }
  const top = Math.max(...out, 0.0001)
  return out.map((v) => Math.min(1, v / top))
}
