import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

registerSW({ immediate: true })

try {
  // Pede ao navegador para não apagar os áudios guardados quando faltar espaço.
  void navigator.storage?.persist?.()
} catch {
  /* sem suporte */
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
