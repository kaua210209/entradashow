export const COLORS = [
  '#f5c451',
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fb923c',
  '#a78bfa',
  '#f87171',
  '#22d3ee',
  '#a3e635',
  '#e879f9',
]

export const EMOJIS = ['🎓', '⭐', '🔥', '🎉', '💃', '🕺', '👑', '🎸', '🥳', '❤️', '🦁', '🚀', '🎤', '🏆']

export const GROUPS = ['Turma', 'Família', 'Homenagem', 'Professores', 'Abertura']

export const clamp = (n, a, b) => Math.min(b, Math.max(a, n))

export function fmt(sec) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fmtPrecise(sec) {
  const v = Math.max(0, sec)
  const m = Math.floor(v / 60)
  const s = v - m * 60
  return `${m}:${s.toFixed(1).padStart(4, '0')}`
}

/** Aceita "83.4", "1:23", "1:23.4". Retorna null se inválido. */
export function parseTime(text) {
  const t = text.trim().replace(',', '.')
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const mm = Number(m)
    const ss = Number(s)
    if (!Number.isFinite(mm) || !Number.isFinite(ss) || mm < 0 || ss < 0) return null
    return mm * 60 + ss
  }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export const round1 = (n) => Math.round(n * 10) / 10
