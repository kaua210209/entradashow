import { useEffect, useRef, useState } from 'react'
import { db, deleteEntry, dropAudioIfUnused, newId, renumber } from '../db'
import { computePeaks, engine } from '../audio'
import { Waveform } from '../components/Waveform'
import { COLORS, EMOJIS, GROUPS, clamp, fmt, fmtPrecise, parseTime, round1 } from '../util'

function TimeField({ label, value, onCommit }) {
  const [text, setText] = useState(fmtPrecise(value))
  const [nonce, setNonce] = useState(0)
  const editing = useRef(false)

  useEffect(() => {
    if (!editing.current) setText(fmtPrecise(value))
  }, [value, nonce])

  const commit = () => {
    editing.current = false
    const v = parseTime(text)
    if (v != null) onCommit(v)
    setNonce((n) => n + 1)
  }

  const nudge = (d) => onCommit(round1(value + d))

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">{label}</div>
      <div className="flex items-stretch gap-1">
        <button
          type="button"
          className="w-11 rounded-lg bg-panel2 text-xl active:scale-95"
          onClick={() => nudge(-0.1)}
          aria-label={`${label} menos 0,1 segundo`}
        >
          −
        </button>
        <input
          inputMode="decimal"
          value={text}
          onFocus={() => (editing.current = true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.target.blur()
          }}
          className="min-w-0 flex-1 rounded-lg bg-panel border border-line px-2 py-3 text-center text-lg font-mono"
        />
        <button
          type="button"
          className="w-11 rounded-lg bg-panel2 text-xl active:scale-95"
          onClick={() => nudge(0.1)}
          aria-label={`${label} mais 0,1 segundo`}
        >
          +
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl bg-panel border border-line p-4 space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-gold">{title}</h3>
      {children}
    </section>
  )
}

export function EntryEditor({ entry, onClose }) {
  const [draft, setDraft] = useState(entry)
  const [peaks, setPeaks] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [previewing, setPreviewing] = useState(false)
  const [playhead, setPlayhead] = useState(null)
  const rangeStart = useRef(0)
  const freshUpload = useRef(false)
  const draftRef = useRef(draft)
  draftRef.current = draft

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  // autosave com pequeno atraso
  useEffect(() => {
    const t = setTimeout(() => void db.entries.put(draft), 250)
    return () => clearTimeout(t)
  }, [draft])

  // carrega forma de onda quando há áudio
  useEffect(() => {
    let cancelled = false
    setPeaks(null)
    if (!draft.audioId) return
    setBusy(true)
    setErr(null)
    ;(async () => {
      try {
        const buf = await engine.decodeFull(draft.audioId)
        if (cancelled) return
        setPeaks(computePeaks(buf, 240))
        if (freshUpload.current) {
          freshUpload.current = false
          set({ duration: buf.duration, startSec: 0, endSec: round1(Math.min(buf.duration, 20)) })
        } else if (Math.abs(buf.duration - draftRef.current.duration) > 0.05) {
          set({
            duration: buf.duration,
            endSec: Math.min(draftRef.current.endSec || buf.duration, buf.duration),
          })
        }
      } catch {
        if (!cancelled) setErr('Não consegui abrir esse arquivo de áudio. Tente em MP3 ou M4A.')
      } finally {
        if (!cancelled) setBusy(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.audioId])

  // cabeça de reprodução
  useEffect(() => {
    if (!previewing) {
      setPlayhead(null)
      return
    }
    let raf = 0
    const loop = () => {
      const p = engine.progress()
      if (p) setPlayhead(rangeStart.current + p.elapsed)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [previewing])

  const preview = async (from, fadeIn) => {
    if (!draft.audioId) return
    rangeStart.current = from
    setPreviewing(true)
    try {
      await engine.playRange(
        draft.audioId,
        from,
        draft.endSec,
        fadeIn,
        draft.fadeOut,
        draft.volume,
        (natural) => {
          if (natural) setPreviewing(false)
        },
      )
    } catch {
      setPreviewing(false)
      setErr('Não foi possível tocar este áudio.')
    }
  }

  const stopPreview = () => {
    engine.stop(0.15)
    setPreviewing(false)
  }

  const onFile = async (f) => {
    setBusy(true)
    setErr(null)
    stopPreview()
    const previous = draft.audioId
    const id = newId()
    try {
      await db.audios.put({ id, name: f.name, type: f.type || 'audio/mpeg', blob: f, size: f.size })
      freshUpload.current = true
      set({ audioId: id, fileName: f.name })
      await db.entries.put({ ...draftRef.current, audioId: id, fileName: f.name })
      await dropAudioIfUnused(previous, draft.id)
    } catch {
      setErr('Não foi possível guardar o arquivo neste aparelho (sem espaço?).')
      setBusy(false)
    }
  }

  const close = async () => {
    stopPreview()
    const d = draftRef.current
    if (!d.name.trim() && !d.audioId) {
      await deleteEntry(d.id)
    } else {
      await db.entries.put(d)
    }
    await renumber()
    engine.releaseFull()
    onClose()
  }

  const remove = async () => {
    if (!window.confirm(`Apagar "${draft.name || 'esta entrada'}"? Isso não pode ser desfeito.`)) return
    stopPreview()
    await deleteEntry(draft.id)
    engine.releaseFull()
    onClose()
  }

  const hasAudio = !!draft.audioId && !!peaks && draft.duration > 0
  const trechoLen = Math.max(0, draft.endSec - draft.startSec)

  return (
    <div className="fixed inset-0 z-50 bg-ink overflow-y-auto">
      <div className="mx-auto max-w-2xl p-4 pb-32 space-y-4 safe-top">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold font-display">Editar entrada</h2>
          <button onClick={close} className="rounded-xl bg-gold text-ink font-bold px-5 py-3 active:scale-95">
            Concluído
          </button>
        </div>

        <Section title="Quem entra">
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Nome do formando ou do grupo"
            className="w-full rounded-xl bg-ink border border-line px-4 py-3 text-lg"
          />
          <input
            value={draft.nickname}
            onChange={(e) => set({ nickname: e.target.value })}
            placeholder="Apelido (opcional)"
            className="w-full rounded-xl bg-ink border border-line px-4 py-3"
          />
          <div>
            <input
              list="grupos"
              value={draft.group}
              onChange={(e) => set({ group: e.target.value })}
              placeholder="Grupo (Turma, Família, Homenagem…)"
              className="w-full rounded-xl bg-ink border border-line px-4 py-3"
            />
            <datalist id="grupos">
              {GROUPS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => set({ emoji: em })}
                className={`h-11 w-11 rounded-xl text-2xl ${draft.emoji === em ? 'bg-gold/25 ring-2 ring-gold' : 'bg-panel2'}`}
              >
                {em}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => set({ color: c })}
                style={{ background: c }}
                className={`h-9 w-9 rounded-full ${draft.color === c ? 'ring-4 ring-white' : 'ring-1 ring-black/40'}`}
              />
            ))}
          </div>
          <textarea
            value={draft.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Observações (ex.: entra com os pais, dançar até o refrão…)"
            rows={2}
            className="w-full rounded-xl bg-ink border border-line px-4 py-3"
          />
        </Section>

        <Section title="Música">
          <label className="flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-ink py-5 text-center cursor-pointer active:scale-[0.99]">
            <span className="text-2xl">🎵</span>
            <span className="font-semibold">
              {draft.audioId ? 'Trocar arquivo de áudio' : 'Escolher arquivo de áudio (MP3, M4A, WAV)'}
            </span>
            <input
              type="file"
              accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {draft.fileName && <p className="text-sm text-slate-400 truncate">Arquivo: {draft.fileName}</p>}
          {busy && <p className="text-sm text-gold">Carregando áudio…</p>}
          {err && <p className="text-sm text-red-400">{err}</p>}

          {hasAudio && peaks && (
            <>
              <Waveform
                peaks={peaks}
                duration={draft.duration}
                start={draft.startSec}
                end={draft.endSec}
                playhead={playhead}
                onChange={(s, e) => set({ startSec: s, endSec: e })}
              />
              <p className="text-xs text-slate-400">
                Arraste as alças douradas para escolher o trecho. Duração do trecho:{' '}
                <b className="text-white">{fmt(trechoLen)}</b> de {fmt(draft.duration)}.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <TimeField
                  label="Início"
                  value={draft.startSec}
                  onCommit={(v) => set({ startSec: round1(clamp(v, 0, draft.endSec - 0.3)) })}
                />
                <TimeField
                  label="Fim"
                  value={draft.endSec}
                  onCommit={(v) => set({ endSec: round1(clamp(v, draft.startSec + 0.3, draft.duration)) })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => (previewing ? stopPreview() : void preview(draft.startSec, draft.fadeIn))}
                  className="col-span-2 rounded-xl bg-gold text-ink font-bold py-3 active:scale-95"
                >
                  {previewing ? '■ Parar' : '▶ Ouvir trecho'}
                </button>
                <button
                  onClick={() => void preview(Math.max(draft.startSec, draft.endSec - 3), 0)}
                  className="rounded-xl bg-panel2 font-semibold py-3 active:scale-95"
                >
                  Últimos 3s
                </button>
              </div>
            </>
          )}
        </Section>

        {hasAudio && (
          <Section title="Som">
            <div>
              <div className="flex justify-between text-sm">
                <span>Fade in (entrada suave)</span>
                <b>{draft.fadeIn.toFixed(1)} s</b>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={draft.fadeIn}
                onChange={(e) => set({ fadeIn: Number(e.target.value) })}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>Fade out (saída suave)</span>
                <b>{draft.fadeOut.toFixed(1)} s</b>
              </div>
              <input
                type="range"
                min={0}
                max={5}
                step={0.1}
                value={draft.fadeOut}
                onChange={(e) => set({ fadeOut: Number(e.target.value) })}
              />
            </div>
            <div>
              <div className="flex justify-between text-sm">
                <span>Volume</span>
                <b>{Math.round(draft.volume * 100)}%</b>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(draft.volume * 100)}
                onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
              />
            </div>
          </Section>
        )}

        <button
          onClick={remove}
          className="w-full rounded-xl border border-red-500/50 text-red-400 py-3 font-semibold active:scale-95"
        >
          Apagar esta entrada
        </button>
      </div>
    </div>
  )
}
