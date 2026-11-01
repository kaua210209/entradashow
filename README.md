# Entrada Show

App para tocar trechos de músicas na entrada de uma formatura. Vite + React + JavaScript + Tailwind CSS v4.
Tudo fica no aparelho (IndexedDB via Dexie) e funciona offline como PWA. Não precisa de internet nem de Supabase.

## Rodar

```bash
npm install
npm run dev        # desenvolvimento (acesse pelo IP da rede para testar no celular)
npm run build      # gera dist/ com PWA (service worker)
npm run preview
```

## Publicar (para instalar no celular)

PWA e Web Audio exigem HTTPS. Suba a pasta `dist/` em Netlify, Vercel, Cloudflare Pages ou GitHub Pages.
No celular: abra o endereço, toque em "Adicionar à tela inicial" e abra uma vez com internet para o app ser guardado.

## Como usar

1. **Preparar**: crie uma entrada por formando, escolha o arquivo de áudio, arraste as alças da waveform para marcar o trecho, ajuste fades e volume. Reordene com ▲ ▼ ou arrastando.
2. **Ensaio**: igual ao palco, com selo ENSAIO e sem salvar a posição da fila.
3. **Palco**: tela de operação ao vivo. TOCAR toca o próximo; PARAR faz fade rápido. Toque num nome da fila para escolhê-lo como próximo. "Auto" liga o próximo sozinho ao fim de cada trecho. Teclado: Espaço toca, Esc para.
4. **Resumo**: duração total, teste de abertura de todos os áudios, impressão da ordem, backup `.eshow` (entradas + músicas) e importação.

## Estrutura

- `src/audio.js` motor Web Audio (trechos pré-recortados na memória, fades agendados)
- `src/db.js` Dexie (entradas, áudios, configurações)
- `src/backup.js` exportar/importar projeto
- `src/screens/` Library, EntryEditor, Stage (Palco/Ensaio), Summary
- `src/components/Waveform.jsx` forma de onda com alças arrastáveis

## Próximas etapas

Trilha de fundo com ducking, pad de efeitos sonoros, sincronização opcional com Supabase (backup e link de compartilhamento).
