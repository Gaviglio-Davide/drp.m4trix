'use client'

// ============================================================
// Libreria GLOBALE delle strutture ("Reparto Strutture" della home).
// A differenza delle strutture per-progetto, queste vivono nell'account
// (localStorage) e vengono importate automaticamente in OGNI mondo
// che apri: le progetti una volta, le riusi ovunque.
// ============================================================

import { create } from 'zustand'
import type { StructurePiece } from './assets'

export type LibraryStructure = {
  id: string
  name: string
  pieces: StructurePiece[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'darponmatrix_structures_v1'

type StructuresStore = {
  structures: LibraryStructure[]
  loaded: boolean
  load: () => void
  add: (name: string, pieces: StructurePiece[]) => LibraryStructure
  rename: (id: string, name: string) => void
  duplicate: (id: string) => void
  remove: (id: string) => void
  replaceAll: (list: LibraryStructure[]) => void
}

function persist(list: LibraryStructure[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    // storage pieno o non disponibile: ignora silenziosamente
  }
}

function readStorage(): LibraryStructure[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LibraryStructure[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      s => s && typeof s.id === 'string' && Array.isArray(s.pieces)
    )
  } catch {
    return []
  }
}

export const useStructures = create<StructuresStore>((set, get) => ({
  structures: [],
  loaded: false,

  load: () => {
    if (get().loaded) return
    set({ structures: readStorage(), loaded: true })
  },

  add: (name, pieces) => {
    const now = Date.now()
    const item: LibraryStructure = {
      id: `st_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim() || 'Struttura',
      pieces,
      createdAt: now,
      updatedAt: now,
    }
    const list = [item, ...get().structures]
    set({ structures: list })
    persist(list)
    return item
  },

  rename: (id, name) => {
    const list = get().structures.map(s =>
      s.id === id ? { ...s, name: name.trim() || s.name, updatedAt: Date.now() } : s
    )
    set({ structures: list })
    persist(list)
  },

  duplicate: (id) => {
    const src = get().structures.find(s => s.id === id)
    if (!src) return
    const now = Date.now()
    const copy: LibraryStructure = {
      ...src,
      id: `st_${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} (copia)`,
      createdAt: now,
      updatedAt: now,
    }
    const list = [copy, ...get().structures]
    set({ structures: list })
    persist(list)
  },

  remove: (id) => {
    const list = get().structures.filter(s => s.id !== id)
    set({ structures: list })
    persist(list)
  },

  replaceAll: (list) => {
    set({ structures: list, loaded: true })
    persist(list)
  },
}))

/** Id usato per l'asset importato nell'editor (prefisso g_ = global) */
export const libraryAssetId = (id: string) => `g_${id}`
