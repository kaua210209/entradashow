// Usado apenas no build de arquivo único (SINGLE=1), onde não há service worker.
export function registerSW(_opts) {
  return () => Promise.resolve()
}
