import Dexie from 'dexie'
import { COLORS } from './util'

class EntradaDB extends Dexie {
  // tabelas: entries, audios, settings (criadas por this.version().stores())
  constructor() {
    super('entrada-show')
    this.version(1).stores({
      entries: 'id, position, audioId',
      audios: 'id',
      settings: 'key',
    })
  }
}

export const db = new EntradaDB()

export const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export async function createEntry() {
  const last = await db.entries.orderBy('position').last()
  const count = await db.entries.count()
  const entry = {
    id: newId(),
    position: (last?.position ?? -1) + 1,
    name: '',
    nickname: '',
    color: COLORS[count % COLORS.length],
    emoji: '🎓',
    group: 'Turma',
    notes: '',
    audioId: null,
    fileName: '',
    duration: 0,
    startSec: 0,
    endSec: 0,
    fadeIn: 0.2,
    fadeOut: 1,
    volume: 1,
  }
  await db.entries.add(entry)
  return entry
}

/** Remove o áudio se nenhuma outra entrada o usa. */
export async function dropAudioIfUnused(audioId, exceptEntryId) {
  if (!audioId) return
  const users = await db.entries
    .where('audioId')
    .equals(audioId)
    .filter((e) => e.id !== exceptEntryId)
    .count()
  if (users === 0) await db.audios.delete(audioId)
}

export async function deleteEntry(id) {
  const e = await db.entries.get(id)
  if (!e) return
  await db.entries.delete(id)
  await dropAudioIfUnused(e.audioId, id)
  await renumber()
}

export async function renumber() {
  const list = await db.entries.orderBy('position').toArray()
  await db.entries.bulkPut(list.map((e, i) => ({ ...e, position: i })))
}

export async function reorder(ids) {
  const map = new Map((await db.entries.toArray()).map((e) => [e.id, e]))
  const next = []
  ids.forEach((id, i) => {
    const e = map.get(id)
    if (e) next.push({ ...e, position: i })
  })
  await db.entries.bulkPut(next)
}

export async function pruneOrphanAudios() {
  const used = new Set((await db.entries.toArray()).map((e) => e.audioId).filter(Boolean))
  const keys = await db.audios.toCollection().primaryKeys()
  const orphans = keys.filter((k) => !used.has(k))
  if (orphans.length) await db.audios.bulkDelete(orphans)
}

export async function getSetting(key, fallback) {
  const s = await db.settings.get(key)
  return s ? s.value : fallback
}

export const setSetting = (key, value) => db.settings.put({ key, value })
