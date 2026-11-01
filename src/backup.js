import { db } from './db'

const MAGIC = 'ESHOW1\n'

/** Formato: MAGIC + 4 bytes (tamanho do cabeçalho) + cabeçalho JSON + áudios em sequência. */
export async function exportProject() {
  const entries = await db.entries.orderBy('position').toArray()
  const audios = await db.audios.toArray()
  let offset = 0
  const meta = audios.map((a) => {
    const m = { id: a.id, name: a.name, type: a.type, offset, size: a.blob.size }
    offset += a.blob.size
    return m
  })
  const header = new TextEncoder().encode(JSON.stringify({ version: 1, entries, audios: meta }))
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, header.length)
  const parts = [MAGIC, len, header, ...audios.map((a) => a.blob)]
  return new Blob(parts, { type: 'application/octet-stream' })
}

export async function importProject(file) {
  const magic = await file.slice(0, MAGIC.length).text()
  if (magic !== MAGIC) throw new Error('Este arquivo não é um projeto do Entrada Show.')
  const lenBuf = await file.slice(MAGIC.length, MAGIC.length + 4).arrayBuffer()
  const headerLen = new DataView(lenBuf).getUint32(0)
  const headerStart = MAGIC.length + 4
  const header = JSON.parse(await file.slice(headerStart, headerStart + headerLen).text())

  const dataStart = headerStart + headerLen
  const audios = header.audios.map((m) => ({
    id: m.id,
    name: m.name,
    type: m.type,
    size: m.size,
    blob: file.slice(dataStart + m.offset, dataStart + m.offset + m.size, m.type),
  }))
  await db.transaction('rw', db.entries, db.audios, async () => {
    await db.entries.clear()
    await db.audios.clear()
    await db.audios.bulkAdd(audios)
    await db.entries.bulkAdd(header.entries)
  })
  return { entries: header.entries.length, audios: audios.length }
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}
