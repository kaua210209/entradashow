import { useState } from 'react'
import { engine } from './audio'
import { Library } from './screens/Library'
import { Stage } from './screens/Stage'
import { Summary } from './screens/Summary'

const TABS = [
  { id: 'prep', icon: '🎼', label: 'Preparar' },
  { id: 'ensaio', icon: '🎭', label: 'Ensaio' },
  { id: 'palco', icon: '🎬', label: 'Palco' },
  { id: 'resumo', icon: '📋', label: 'Resumo' },
]

function Splash({ onStart }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 bg-[radial-gradient(ellipse_at_top,#1c2650,#0b1020_65%)]">
      <div className="text-7xl mb-4">🎓</div>
      <h1 className="text-5xl font-black tracking-tight font-display">
        Entrada <span className="text-gold">Show</span>
      </h1>
      <p className="mt-3 text-slate-300 max-w-xs">
        Os trechos de música da entrada da formatura, na palma da mão.
      </p>
      <button
        onClick={onStart}
        className="mt-10 rounded-full bg-gold text-ink text-xl font-extrabold px-10 py-5 shadow-2xl shadow-gold/20 active:scale-95"
      >
        Toque para começar
      </button>
      <p className="mt-4 text-xs text-slate-500">O navegador só libera o som depois de um toque seu.</p>
    </div>
  )
}

export default function App() {
  const [started, setStarted] = useState(false)
  const [tab, setTab] = useState('prep')

  if (!started) {
    return (
      <Splash
        onStart={async () => {
          try {
            await engine.unlock()
          } catch {
            /* o áudio é liberado de novo no primeiro play */
          }
          setStarted(true)
        }}
      />
    )
  }

  // Palco e Ensaio ocupam a tela toda, sem a barra de abas, para evitar toques acidentais.
  if (tab === 'palco' || tab === 'ensaio') {
    return <Stage key={tab} rehearsal={tab === 'ensaio'} onExit={() => setTab('prep')} />
  }

  return (
    <div className="h-full overflow-y-auto">
      {tab === 'prep' ? <Library /> : <Summary />}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur safe-bottom">
        <div className="mx-auto max-w-2xl grid grid-cols-4 gap-1 px-2 pt-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-xl py-2 flex flex-col items-center text-xs font-semibold active:scale-95 ${
                tab === t.id ? 'bg-panel2 text-gold' : 'text-slate-400'
              }`}
            >
              <span className="text-xl leading-none mb-1">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
