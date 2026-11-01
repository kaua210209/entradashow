import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { fileURLToPath } from 'node:url'

// SINGLE=1 gera um único index.html (sem service worker), útil para testes rápidos.
const single = process.env.SINGLE === '1'

export default defineConfig({
  base: './',
  resolve: single
    ? { alias: { 'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-stub.js', import.meta.url)) } }
    : undefined,
  plugins: [
    react(),
    tailwindcss(),
    ...(single
      ? [viteSingleFile()]
      : [
          VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['icon.svg'],
            manifest: {
              name: 'Entrada Show',
              short_name: 'Entrada Show',
              description: 'Toque trechos de músicas na entrada da formatura',
              lang: 'pt-BR',
              theme_color: '#0b1020',
              background_color: '#0b1020',
              display: 'standalone',
              orientation: 'any',
              start_url: './',
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
            },
          }),
        ]),
  ],
})
