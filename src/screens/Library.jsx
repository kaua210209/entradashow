import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { createEntry, db, reorder } from '../db'
import { engine } from '../audio'
import { fmt } from '../util'
import { EntryEditor } from './EntryEditor'

export function Library() {
  const entries = useLiveQuery(() => db.entries.orderBy('position').toArray(), [])
  const [editing, setEditing] = useState(null)
  const [playingId, setPlayingId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overId, setOverId] = useState(null)

  useEffect(() => () => engine.stop(0.1), [])

  if (!entries) return null

  const list = entries
  const withAudio = list.filter((e) => e.audioId)
  const total = withAudio.reduce((s, e) => s + Math.max(0, e.endSec - e.startSec), 0)

  const move = async (id, dir) => {
    const ids = list.map((e) => e.id)
    const i = ids.indexOf(id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    await reorder(ids)
  }

  const dropOn = async (targetId) => {
    if (!dragId || dragId === targetId) return
    const ids = list.map((e) => e.id).filter((id) => id !== dragId)
    const at = ids.indexOf(targetId)
    ids.splice(at, 0, dragId)
    await reorder(ids)
  }

  const togglePlay = async (e) => {
    if (playingId === e.id) {
      engine.stop(0.15)
      setPlayingId(null)
      return
    }
    setPlayingId(e.id)
    const ok = await engine.play(e, (natural) => {
      if (natural) setPlayingId((cur) => (cur === e.id ? null : cur))
    })
    if (!ok) setPlayingId(null)
  }

  const add = async () => setEditing(await createEntry())

  return (
    <div className="mx-auto max-w-2xl px-4 pb-40 safe-top">
      <header className="pt-2 pb-4">
        <h1 className="text-3xl font-extrabold font-display tracking-tight">
          Entrada <span className="text-gold">Show</span>
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {list.length} {list.length === 1 ? 'entrada' : 'entradas'} · {withAudio.length} com música · duração
          total dos trechos <b className="text-white">{fmt(total)}</b>
        </p>
      </header>

      {list.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-line p-8 text-center text-slate-400">
          <div className="text-5xl mb-3">🎓</div>
          <p className="font-semibold text-white">Nenhuma entrada ainda</p>
          <p className="text-sm mt-1">
            Toque em “Nova entrada”, escolha o nome, carregue a música e marque o trecho que vai tocar.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {list.map((e, i) => (
          <li
            key={e.id}
            draggable
            onDragStart={() => setDragId(e.id)}
            onDragOver={(ev) => {
              ev.preventDefault()
              setOverId(e.id)
            }}
            onDragEnd={() => {
              setDragId(null)
              setOverId(null)
            }}
            onDrop={() => {
              void dropOn(e.id)
              setDragId(null)
              setOverId(null)
            }}
            className={`flex items-stretch rounded-2xl bg-panel border overflow-hidden ${
              overId === e.id && dragId !== e.id ? 'border-gold' : 'border-line'
            } ${dragId === e.id ? 'opacity-50' : ''}`}
          >
            <div style={{ background: e.color }} className="w-2 shrink-0" />
            <button
              onClick={() => setEditing(e)}
              className="flex-1 min-w-0 text-left px-3 py-3 flex items-center gap-3"
            >
              <span className="text-3xl">{e.emoji}</span>
              <span className="min-w-0">
                <span className="block font-bold truncate">
                  <span className="text-slate-500 font-mono mr-2">{i + 1}</span>
                  {e.name || '(sem nome)'}
                  {e.nickname && <span className="text-slate-400 font-normal"> “{e.nickname}”</span>}
                </span>
                <span className="block text-xs text-slate-400 truncate">
                  {e.group || 'Sem grupo'} ·{' '}
                  {e.audioId ? (
                    <>
                      trecho de {fmt(e.endSec - e.startSec)} · {e.fileName}
                    </>
                  ) : (
                    <span className="text-amber-400">⚠ sem música</span>
                  )}
                </span>
              </span>
            </button>
            <div className="flex items-center gap-1 pr-2">
              {e.audioId && (
                <button
                  onClick={() => void togglePlay(e)}
                  aria-label={playingId === e.id ? 'Parar' : 'Ouvir trecho'}
                  className="h-11 w-11 rounded-full bg-gold text-ink font-bold active:scale-90"
                >
                  {playingId === e.id ? '■' : '▶'}
                </button>
              )}
              <div className="flex flex-col">
                <button
                  onClick={() => void move(e.id, -1)}
                  disabled={i === 0}
                  aria-label="Subir"
                  className="h-7 w-9 rounded bg-panel2 text-xs disabled:opacity-30 active:scale-90"
                >
                  ▲
                </button>
                <button
                  onClick={() => void move(e.id, 1)}
                  disabled={i === list.length - 1}
                  aria-label="Descer"
                  className="mt-1 h-7 w-9 rounded bg-panel2 text-xs disabled:opacity-30 active:scale-90"
                >
                  ▼
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <button
        onClick={() => void add()}
        className="fixed right-4 bottom-24 z-30 rounded-full bg-gold text-ink font-extrabold px-6 py-4 shadow-2xl shadow-black/60 active:scale-95"
      >
        + Nova entrada
      </button>

      {editing && <EntryEditor entry={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}
