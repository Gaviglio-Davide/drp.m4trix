// ============================================================
// Persistenza dei giochi del Game Studio.
// I giochi sono "progetti" nel DB esistente, con lo stato JSON
// che contiene direttamente il GameProject (kind:'game2d').
// Nessuna migrazione: usiamo le API /api/projects già presenti.
// ============================================================

import type { GameProject } from './types'

export type GameMeta = {
  id: string
  name: string
  updatedAt: string
  game: GameProject
}

function parseGame(state: unknown): GameProject | null {
  try {
    const st = typeof state === 'string' ? JSON.parse(state) : state
    if (
      st &&
      st.kind === 'game2d' &&
      Array.isArray(st.scenes) &&
      st.scenes.length > 0
    )
      return st as GameProject
  } catch {
    // non è un gioco
  }
  return null
}

/** true se lo stato JSON del progetto è un GIOCO del Game Studio
 *  (e quindi NON deve comparire tra i Mondi 3D della home) */
export function isGameProjectState(state: string | undefined | null): boolean {
  if (!state) return false
  try {
    return JSON.parse(state)?.kind === 'game2d'
  } catch {
    return false
  }
}

export async function listGames(): Promise<GameMeta[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('Non autenticato')
  const data = await res.json()
  const out: GameMeta[] = []
  for (const p of data.projects ?? []) {
    const g = parseGame(p.state)
    if (g) out.push({ id: p.id, name: p.name, updatedAt: p.updatedAt, game: g })
  }
  out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  return out
}

export async function getGame(id: string): Promise<GameMeta | null> {
  const res = await fetch(`/api/projects/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  const g = parseGame(data.project?.state)
  if (!g) return null
  return { id: data.project.id, name: data.project.name, updatedAt: data.project.updatedAt, game: g }
}

export async function createGame(
  name: string,
  game: GameProject
): Promise<GameMeta> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? 'Errore durante la creazione')
  return saveGame(data.project.id, game)
}

export async function saveGame(
  id: string,
  game: GameProject,
  name?: string
): Promise<GameMeta> {
  game.updatedAt = new Date().toISOString()
  const body: Record<string, string> = { state: JSON.stringify(game) }
  body.name = (name ?? game.title).slice(0, 60)
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('Salvataggio non riuscito')
  return { id, name: body.name, updatedAt: game.updatedAt!, game }
}

export async function deleteGame(id: string): Promise<void> {
  await fetch(`/api/projects/${id}`, { method: 'DELETE' })
}

/** scarica il gioco come file JSON (backup / condivisione) */
export function exportGameFile(game: GameProject) {
  const blob = new Blob([JSON.stringify(game, null, 2)], {
    type: 'application/json',
  })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${game.title.replace(/[^\w-]+/g, '_') || 'gioco'}.game.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

/** legge un file JSON caricato dall'utente */
export function importGameFile(file: File): Promise<GameProject> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      try {
        const g = JSON.parse(String(r.result))
        if (g && g.kind === 'game2d' && Array.isArray(g.scenes)) resolve(g)
        else reject(new Error('File non valido: non è un gioco darpon'))
      } catch (e) {
        reject(e instanceof Error ? e : new Error('File non valido'))
      }
    }
    r.onerror = () => reject(new Error('Lettura file fallita'))
    r.readAsText(file)
  })
}
