import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSetting, setSetting } from '../db'
import { engine, entryKey } from '../audio'
import { fmt } from '../util'

/** Mantém a tela acesa enquanto o palco está aberto. */
function useWakeLock() {
  useEffect(() => {
    let lock = null
    let dead = false
    const get = async () => {
      try {
        if (!dead && 'wakeLock' in navigator && document.visibilityState === 'visible') {
          lock = await navigator.wakeLock.request('screen')
        }
      } catch {
        /* sem suporte ou negado */
      }
    }
    void get()
    const onVis = () => {
      if (document.visibilityState === 'visible') void get()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      dead = true
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => {})
    }
  }, [])
}

export function Stage({ rehearsal, onExit }) {
  const all = useLiveQuery(() => db.entries.orderBy('position').toArray(), [])
  const queue = useMemo(() => (all ?? []).filter((e) => e.audioId), [all])
  const withoutAudio = (all ?? []).length - queue.length

  const [cursor, setCursor] = useState(0)
  const [loaded, setLoaded] = useState(rehearsal)
  const [playing, setPlaying] = useState(null)
  const [prog, setProg] = useState(null)
  const [auto, setAuto] = useState(false)
  const [msg, setMsg] = useState(null)
  const [, tick] = useState(0)

  const queueRef = useRef(queue)
  const autoRef = useRef(auto)
  queueRef.current = queue
  autoRef.current = auto

  // No palco, a posição da fila sobrevive a um recarregamento. No ensaio, sempre começa do zero.
  useEffect(() => {
    if (rehearsal) return
    void getSetting('cursor', 0).then((c) => {
      setCursor(c)
      setLoaded(true)
    })
  }, [rehearsal])
  useEffect(() => {
    if (!rehearsal && loaded) void setSetting('cursor', cursor)
  }, [cursor, loaded, rehearsal])

  const cur = Math.min(cursor, queue.length)
  const next = queue[cur]
  const playingIdx = playing ? queue.findIndex((e) => e.id === playing.id) : -1

  useWakeLock()
  useEffect(() => () => engine.stop(0.3), [])

  // Deixa o trecho atual e os próximos já decodificados na memória (play instantâneo).
  const windowEntries = queue.slice(Math.max(0, cur - 1), cur + 4)
  const winKey = windowEntries.map(entryKey).join(',')
  useEffect(() => {
    let alive = true
    engine.prune(windowEntries)
    void (async () => {
      for (const e of windowEntries) {
        if (!alive) return
        await engine.prepare(e)
        if (alive) tick((n) => n + 1)
      }
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winKey])

  // Contagem regressiva (atualiza ~10x por segundo).
  useEffect(() => {
    let raf = 0
    let last = 0
    const loop = (t) => {
      if (t - last > 90) {
        last = t
        setProg(engine.progress())
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const playAtRef = useRef(async () => {})
  const playAt = useCallback(async (idx) => {
    const e = queueRef.current[idx]
    if (!e) return
    setMsg(null)
    setPlaying(e)
    setCursor(idx + 1)
    const ok = await engine.play(e, (natural) => {
      if (!natural) return
      setPlaying((p) => (p?.id === e.id ? null : p))
      if (autoRef.current && idx + 1 < queueRef.current.length) void playAtRef.current(idx + 1)
    })
    if (!ok) {
      setPlaying(null)
      setMsg(`Não consegui tocar “${e.name || 'sem nome'}”. Confira o arquivo na aba Preparar.`)
    }
  }, [])
  playAtRef.current = playAt

  const stop = () => {
    engine.stop(0.4)
    setPlaying(null)
  }
  const playNext = () => {
    if (next) void playAt(cur)
  }
  const back = () => setCursor((c) => Math.max(0, Math.min(c, queue.length) - 1))
  const skip = () => setCursor((c) => Math.min(queue.length, c + 1))
  const repeat = () => {
    const idx = playingIdx >= 0 ? playingIdx : Math.max(0, cur - 1)
    void playAt(idx)
    setCursor(idx + 1)
  }
  const exit = () => {
    if (playing && !window.confirm('Tem música tocando. Sair do palco mesmo assim?')) return
    onExit()
  }

  // Atalhos de teclado (útil com notebook): Espaço toca, Esc para.
  useEffect(() => {
    const onKey = (ev) => {
      const t = ev.target
      if (t && ['INPUT', 'TEXTAREA'].includes(t.tagName)) return
      if (ev.code === 'Space' || ev.key === 'Enter') {
        ev.preventDefault()
        if (!ev.repeat) playNext()
      } else if (ev.key === 'Escape') {
        stop()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const remaining = prog ? Math.max(0, prog.duration - prog.elapsed) : 0
  const pct = prog ? (prog.elapsed / prog.duration) * 100 : 0

  if (!all || !loaded) return <div className="fixed inset-0 bg-black" />

  return (
    <div
      className={`fixed inset-0 z-40 flex flex-col bg-black ${
        rehearsal ? 'ring-4 ring-inset ring-amber-400/80' : ''
      }`}
      style={{ touchAction: 'manipulation' }}
    >
      {/* topo */}
      <header className="safe-top px-3 pb-2 flex items-center gap-2 border-b border-line/60">
        <button
          onClick={exit}
          className="rounded-xl bg-panel px-4 py-3 text-sm font-semibold active:scale-95"
        >
          ✕ Sair
        </button>
        <span
          className={`rounded-full px-3 py-1 text-xs font-extrabold tracking-widest ${
            rehearsal ? 'bg-amber-400 text-black' : 'bg-live text-white'
          }`}
        >
          {rehearsal ? 'ENSAIO' : '● AO VIVO'}
        </span>
        <span className="ml-auto text-sm text-slate-400 font-mono">
          {Math.min(cur + (playing ? 0 : 1), queue.length)}/{queue.length}
        </span>
        <button
          onClick={() => setAuto((a) => !a)}
          aria-pressed={auto}
          className={`rounded-xl px-3 py-3 text-xs font-semibold active:scale-95 ${
            auto ? 'bg-gold text-ink' : 'bg-panel text-slate-300'
          }`}
        >
          Auto {auto ? 'ligado' : 'desligado'}
        </button>
      </header>

      {/* centro */}
      <main className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {queue.length === 0 ? (
          <div className="text-center text-slate-400 py-16">
            <div className="text-5xl mb-3">🎼</div>
            <p className="font-semibold text-white">Nenhuma entrada com música</p>
            <p className="text-sm mt-1">Volte e adicione as entradas na aba Preparar.</p>
          </div>
        ) : (
          <>
            <section
              className="rounded-3xl border-2 p-4"
              style={{
                borderColor: playing ? playing.color : '#2b3668',
                background: playing ? `${playing.color}1f` : '#0b1020',
              }}
            >
              <div className="text-xs uppercase tracking-widest text-slate-400">
                {playing ? 'Tocando agora' : 'Silêncio'}
              </div>
              {playing ? (
                <>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-5xl">{playing.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-3xl font-black leading-tight break-words">{playing.name}</div>
                      {playing.nickname && (
                        <div className="text-slate-300 break-words">“{playing.nickname}”</div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-3 flex-1 rounded-full bg-black/60 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          background: playing.color,
                          transition: 'width 100ms linear',
                        }}
                      />
                    </div>
                    <div className="text-4xl font-black font-mono tabular-nums">
                      {fmt(Math.ceil(remaining))}
                    </div>
                  </div>
                  {playing.notes && <p className="mt-2 text-sm text-amber-300">📝 {playing.notes}</p>}
                </>
              ) : (
                <p className="text-slate-500 mt-1">Nada tocando. Toque em TOCAR para começar.</p>
              )}
            </section>

            <section className="rounded-3xl bg-panel p-4">
              <div className="text-xs uppercase tracking-widest text-slate-400">Próximo</div>
              {next ? (
                <div className="mt-1 flex items-center gap-3">
                  <span className="text-4xl">{next.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold truncate">{next.name || '(sem nome)'}</div>
                    <div className="text-sm text-slate-400 truncate">
                      {next.group}
                      {next.notes ? ` · ${next.notes}` : ''}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-slate-400 mt-1">Fim da fila. 🎉</p>
              )}
            </section>
          </>
        )}

        {msg && (
          <p className="rounded-xl bg-red-950 border border-red-500/60 text-red-200 p-3 text-sm">{msg}</p>
        )}
        {withoutAudio > 0 && (
          <p className="text-xs text-amber-400">
            ⚠ {withoutAudio} {withoutAudio === 1 ? 'entrada está' : 'entradas estão'} sem música e{' '}
            {withoutAudio === 1 ? 'foi ignorada' : 'foram ignoradas'}.
          </p>
        )}

        {queue.length > 0 && (
          <section>
            <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">
              Fila · toque num nome para escolhê-lo como próximo
            </div>
            <ul className="space-y-1.5">
              {queue.map((e, i) => {
                const isNext = i === cur
                const isPlaying = playing?.id === e.id
                const done = i < cur && !isPlaying
                const dot = engine.isReady(e)
                  ? 'bg-emerald-400'
                  : engine.isFailed(e)
                    ? 'bg-red-500'
                    : 'bg-slate-600'
                return (
                  <li key={e.id}>
                    <button
                      onClick={() => setCursor(i)}
                      className={`w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-left border active:scale-[0.99] ${
                        isNext ? 'border-gold bg-gold/10' : 'border-line/60 bg-panel/60'
                      } ${done ? 'opacity-50' : ''}`}
                    >
                      <span style={{ background: e.color }} className="h-9 w-1.5 rounded-full shrink-0" />
                      <span className="font-mono text-slate-500 w-6 text-right">{i + 1}</span>
                      <span className="text-2xl">{e.emoji}</span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold truncate">{e.name || '(sem nome)'}</span>
                        <span className="block text-xs text-slate-400 truncate">{e.group}</span>
                      </span>
                      {isPlaying && <span className="text-xs font-bold text-gold">▶ TOCANDO</span>}
                      {isNext && !isPlaying && <span className="text-xs font-bold text-gold">PRÓXIMO</span>}
                      {done && <span className="text-emerald-400">✓</span>}
                      <span title="Pronto na memória" className={`h-2.5 w-2.5 rounded-full ${dot}`} />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}
      </main>

      {/* controles fixos embaixo */}
      {queue.length > 0 && (
        <footer className="safe-bottom shrink-0 border-t border-line/60 bg-ink px-3 pt-3 space-y-3">
          {next ? (
            <button
              onClick={playNext}
              className="w-full rounded-3xl bg-gold text-ink h-24 flex flex-col items-center justify-center active:scale-[0.98] shadow-lg shadow-gold/20"
            >
              <span className="text-3xl font-black tracking-wide">▶ TOCAR</span>
              <span className="text-base font-semibold truncate max-w-[90%]">
                {next.name || '(sem nome)'}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setCursor(0)}
              className="w-full rounded-3xl bg-panel2 h-24 text-2xl font-black active:scale-[0.98]"
            >
              ↺ Reiniciar fila
            </button>
          )}
          <div className="grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-3 pb-1">
            <button onClick={back} className="rounded-2xl bg-panel2 py-4 font-semibold active:scale-95">
              ◀ Voltar
            </button>
            <button onClick={skip} className="rounded-2xl bg-panel2 py-4 font-semibold active:scale-95">
              Pular ▶▶
            </button>
            <button onClick={repeat} className="rounded-2xl bg-panel2 py-4 font-semibold active:scale-95">
              ↻ Repetir
            </button>
            <button
              onClick={stop}
              className="rounded-2xl bg-live text-white py-4 text-lg font-black active:scale-95 shadow-lg shadow-red-900/40"
            >
              ■ PARAR
            </button>
          </div>
        </footer>
      )}
    </div>
  )
}
