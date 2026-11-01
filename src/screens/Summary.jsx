import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { engine } from '../audio'
import { download, exportProject, importProject } from '../backup'
import { fmt } from '../util'

const mb = (n) => `${(n / 1024 / 1024).toFixed(n > 1e8 ? 0 : 1)} MB`

function Card({ title, children }) {
  return (
    <section className="rounded-2xl bg-panel border border-line p-4 space-y-3 print:bg-white print:border-slate-300">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-gold print:text-black">{title}</h2>
      {children}
    </section>
  )
}

export function Summary() {
  const entries = useLiveQuery(() => db.entries.orderBy('position').toArray(), [])
  const [busy, setBusy] = useState(null)
  const [note, setNote] = useState(null)
  const [check, setCheck] = useState(null)
  const [storage, setStorage] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    void (async () => {
      try {
        const est = await navigator.storage?.estimate?.()
        const persisted = (await navigator.storage?.persisted?.()) ?? false
        if (est) setStorage({ used: est.usage ?? 0, quota: est.quota ?? 0, persisted })
      } catch {
        /* sem suporte */
      }
    })()
  }, [entries])

  if (!entries) return null
  const withAudio = entries.filter((e) => e.audioId)
  const total = withAudio.reduce((s, e) => s + Math.max(0, e.endSec - e.startSec), 0)

  const run = async (label, fn) => {
    setBusy(label)
    setNote(null)
    try {
      await fn()
    } catch (err) {
      setNote({ kind: 'err', text: err instanceof Error ? err.message : 'Algo deu errado.' })
    } finally {
      setBusy(null)
    }
  }

  const verify = () =>
    run('Verificando os áudios…', async () => {
      const bad = []
      let ok = 0
      for (const e of withAudio) {
        const buf = await engine.prepare(e)
        if (buf) ok++
        else bad.push(e.name || '(sem nome)')
      }
      engine.prune([])
      setCheck({ ok, bad })
    })

  const doExport = () =>
    run('Gerando o backup…', async () => {
      const blob = await exportProject()
      const d = new Date()
      const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      download(blob, `entrada-show-${stamp}.eshow`)
      setNote({
        kind: 'ok',
        text: `Backup gerado (${mb(blob.size)}). Guarde o arquivo em outro lugar além deste aparelho.`,
      })
    })

  const doImport = (file) =>
    run('Importando…', async () => {
      if (!window.confirm('Importar vai SUBSTITUIR tudo que está neste aparelho. Continuar?')) return
      const r = await importProject(file)
      engine.prune([])
      setCheck(null)
      setNote({ kind: 'ok', text: `Projeto importado: ${r.entries} entradas e ${r.audios} músicas.` })
    })

  const clearAll = () =>
    run('Apagando…', async () => {
      if (!window.confirm('Apagar TODAS as entradas e músicas deste aparelho? Isso não pode ser desfeito.'))
        return
      await db.entries.clear()
      await db.audios.clear()
      engine.prune([])
      setCheck(null)
      setNote({ kind: 'ok', text: 'Tudo apagado.' })
    })

  return (
    <div className="mx-auto max-w-2xl px-4 pb-32 safe-top space-y-4 print:text-black">
      <header className="pt-2">
        <h1 className="text-3xl font-extrabold font-display tracking-tight">Resumo</h1>
        <p className="text-slate-400 text-sm mt-1 no-print">Confira tudo antes do grande dia.</p>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          ['Entradas', String(entries.length)],
          ['Com música', String(withAudio.length)],
          ['Duração', fmt(total)],
        ].map(([k, v]) => (
          <div
            key={k}
            className="rounded-2xl bg-panel border border-line py-3 print:bg-white print:border-slate-300"
          >
            <div className="text-2xl font-black text-gold print:text-black">{v}</div>
            <div className="text-xs text-slate-400">{k}</div>
          </div>
        ))}
      </div>

      {busy && <p className="rounded-xl bg-panel2 text-gold px-4 py-3 text-sm">{busy}</p>}
      {note && (
        <p
          className={`rounded-xl px-4 py-3 text-sm ${
            note.kind === 'ok' ? 'bg-emerald-950 text-emerald-200' : 'bg-red-950 text-red-200'
          }`}
        >
          {note.text}
        </p>
      )}

      <Card title="Ordem da entrada">
        {entries.length === 0 ? (
          <p className="text-slate-400 text-sm">Ainda não há entradas.</p>
        ) : (
          <ol className="divide-y divide-line/60 print:divide-slate-300">
            {entries.map((e, i) => (
              <li key={e.id} className="py-2 flex items-start gap-3">
                <span className="font-mono text-slate-500 w-6 text-right pt-0.5">{i + 1}</span>
                <span className="text-xl">{e.emoji}</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold">
                    {e.name || '(sem nome)'}
                    {e.nickname && <span className="font-normal text-slate-400"> “{e.nickname}”</span>}
                  </span>
                  <span className="block text-xs text-slate-400 print:text-slate-600">
                    {e.group}
                    {e.audioId
                      ? ` · trecho de ${fmt(e.endSec - e.startSec)} (${e.fileName})`
                      : ' · ⚠ sem música'}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
        <button
          onClick={() => window.print()}
          className="no-print w-full rounded-xl bg-panel2 py-3 font-semibold active:scale-95"
        >
          🖨 Imprimir ou salvar em PDF
        </button>
      </Card>

      <div className="no-print space-y-4">
        <Card title="Antes do evento">
          <button
            onClick={() => void verify()}
            disabled={!!busy || withAudio.length === 0}
            className="w-full rounded-xl bg-gold text-ink font-bold py-3 active:scale-95 disabled:opacity-40"
          >
            ✔ Testar se todos os áudios abrem
          </button>
          {check && (
            <p className={`text-sm ${check.bad.length ? 'text-red-300' : 'text-emerald-300'}`}>
              {check.bad.length === 0
                ? `Tudo certo: ${check.ok} de ${withAudio.length} áudios abriram.`
                : `${check.ok} abriram. Com problema: ${check.bad.join(', ')}. Troque o arquivo dessas entradas.`}
            </p>
          )}
          {storage && (
            <p className="text-xs text-slate-400">
              Espaço usado: {mb(storage.used)} de {mb(storage.quota)}. Armazenamento{' '}
              {storage.persisted ? (
                <b className="text-emerald-300">protegido</b>
              ) : (
                <b className="text-amber-300">não protegido</b>
              )}{' '}
              contra limpeza automática do navegador.
            </p>
          )}
          <ul className="text-xs text-slate-400 list-disc pl-5 space-y-1">
            <li>
              Instale o app na tela inicial (menu do navegador → “Adicionar à tela inicial”) para abrir sem
              internet.
            </li>
            <li>Faça um Ensaio completo no mesmo aparelho e com a mesma caixa de som do dia.</li>
            <li>Gere um backup e guarde em outro lugar (e-mail, nuvem, outro celular).</li>
          </ul>
        </Card>

        <Card title="Backup">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => void doExport()}
              disabled={!!busy || entries.length === 0}
              className="rounded-xl bg-panel2 py-3 font-semibold active:scale-95 disabled:opacity-40"
            >
              ⬇ Exportar projeto
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!!busy}
              className="rounded-xl bg-panel2 py-3 font-semibold active:scale-95 disabled:opacity-40"
            >
              ⬆ Importar projeto
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".eshow,application/octet-stream"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void doImport(f)
              e.target.value = ''
            }}
          />
          <p className="text-xs text-slate-400">
            O arquivo .eshow leva as entradas e as músicas juntas. Serve para passar o projeto para outro
            aparelho.
          </p>
        </Card>

        <button
          onClick={() => void clearAll()}
          disabled={!!busy || entries.length === 0}
          className="w-full rounded-xl border border-red-500/50 text-red-400 py-3 font-semibold active:scale-95 disabled:opacity-40"
        >
          Apagar tudo deste aparelho
        </button>
      </div>
    </div>
  )
}
