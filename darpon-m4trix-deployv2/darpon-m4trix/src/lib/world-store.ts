'use client'

import { create } from 'zustand'
import {
  ACCENT_STORAGE_KEY,
  DEFAULT_THEME_ID,
  applyTheme,
} from './themes'
import { fetchAuth } from './http'
import type { StructurePiece } from './assets'
import type { WorldStyle } from './scene-theme'

export type WorldObject = {
  id: string
  asset: string
  x: number
  z: number
  rot: number // 0..3 quarters
  color: number // palette index
}

export type CustomAsset = {
  id: string
  name: string
  url?: string
  kind?: 'glb' | 'structure'
  pieces?: StructurePiece[]
}

export type ProjectState = {
  objects: WorldObject[]
  customAssets: CustomAsset[]
  playerAsset?: string | null
  worldStyle?: WorldStyle
}

export type SessionUser = {
  id: string
  email: string
  name: string | null
  accentColor?: string | null
}
export type ProjectMeta = {
  id: string
  name: string
  state: string
  createdAt: string
  updatedAt: string
  _count?: { saves: number }
}

export type SaveSnapshot = {
  id: string
  name: string
  state: string
  createdAt: string
}

export const GRID_HALF = 14 // playable grid: -GRID_HALF..GRID_HALF

export type View = 'landing' | 'dashboard' | 'editor'

type Store = {
  view: View
  user: SessionUser | null
  projects: ProjectMeta[]
  currentProject: ProjectMeta | null

  // editor state
  objects: WorldObject[]
  customAssets: CustomAsset[]
  selectedAsset: string | null
  ghostRot: number
  ghostColor: number
  hoverCell: [number, number] | null
  history: WorldObject[][]
  dying: { obj: WorldObject; at: number }[]
  playMode: boolean
  cameraMode: boolean
  saveStatus: 'idle' | 'saving' | 'saved'
  loadingProject: boolean
  playerAsset: string | null
  worldStyle: WorldStyle

  // theme
  accent: string

  // actions
  setView: (v: View) => void
  setUser: (u: SessionUser | null) => void
  setProjects: (p: ProjectMeta[]) => void
  setAccent: (id: string, persist?: boolean) => void
  openProject: (p: ProjectMeta) => void
  closeProject: () => void
  setLoadingProject: (b: boolean) => void

  loadState: (s: ProjectState) => void
  selectAsset: (id: string | null) => void
  setGhostRot: (r: number) => void
  setGhostColor: (c: number) => void
  setHoverCell: (c: [number, number] | null) => void
  setPlayMode: (b: boolean) => void
  toggleCameraMode: () => void
  setSaveStatus: (s: 'idle' | 'saving' | 'saved') => void
  setPlayerAsset: (id: string | null) => void
  setWorldStyle: (s: WorldStyle) => void

  addObject: (o: Omit<WorldObject, 'id'>) => void
  removeObject: (x: number, z: number) => void
  cycleColor: (x: number, z: number) => void
  rotateObject: (x: number, z: number) => void
  clearWorld: () => void
  undo: () => void
  pruneDying: () => void
  addCustomAsset: (a: CustomAsset) => void
}

let idCounter = 1
export const nextId = () => `o${Date.now().toString(36)}${(idCounter++).toString(36)}`

export const useWorld = create<Store>((set, get) => ({
  view: 'landing',
  user: null,
  projects: [],
  currentProject: null,
  accent: DEFAULT_THEME_ID,

  objects: [],
  customAssets: [],
  selectedAsset: 'casa',
  ghostRot: 0,
  ghostColor: 0,
  hoverCell: null,
  history: [],
  dying: [],
  playMode: false,
  cameraMode: false,
  saveStatus: 'idle',
  loadingProject: false,
  playerAsset: null,
  worldStyle: 'cartoon' as WorldStyle,

  setView: v => set({ view: v }),
  setUser: u => set({ user: u }),
  setProjects: p => set({ projects: p }),
  setLoadingProject: b => set({ loadingProject: b }),

  setAccent: (id, persist = true) => {
    set({ accent: id })
    applyTheme(id)
    try {
      localStorage.setItem(ACCENT_STORAGE_KEY, id)
    } catch {
      // storage non disponibile
    }
    if (persist && get().user) {
      // salva sul profilo (fire-and-forget, con retry sul 401)
      void fetchAuth('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accentColor: id }),
      }).catch(() => {})
    }
  },

  openProject: p => {
    const state = parseState(p.state)
    set({
      currentProject: p,
      objects: state.objects,
      customAssets: state.customAssets,
      playerAsset: state.playerAsset ?? null,
      worldStyle: state.worldStyle ?? 'cartoon',
      history: [],
      dying: [],
      playMode: false,
      selectedAsset: state.objects.length ? null : 'casa',
      view: 'editor',
      saveStatus: 'idle',
    })
  },
  closeProject: () =>
    set({
      currentProject: null,
      objects: [],
      customAssets: [],
      playerAsset: null,
      worldStyle: 'cartoon',
      playMode: false,
      view: 'dashboard',
      saveStatus: 'idle',
    }),

  loadState: s =>
    set({
      objects: s.objects ?? [],
      customAssets: s.customAssets ?? [],
      playerAsset: s.playerAsset ?? null,
      worldStyle: s.worldStyle ?? 'cartoon',
    }),

  selectAsset: id => set({ selectedAsset: id, playMode: false }),
  setGhostRot: r => set({ ghostRot: ((r % 4) + 4) % 4 }),
  setGhostColor: c => set({ ghostColor: ((c % PALETTE.length) + PALETTE.length) % PALETTE.length }),
  setHoverCell: c => set({ hoverCell: c }),
  setPlayMode: b => set({ playMode: b }),
  toggleCameraMode: () => set({ cameraMode: !get().cameraMode }),
  setSaveStatus: s => set({ saveStatus: s }),
  setPlayerAsset: id => set({ playerAsset: id }),
  setWorldStyle: s => set({ worldStyle: s }),

  addObject: o => {
    const { objects, history, dying } = get()
    // avoid duplicates in same cell
    if (objects.some(p => p.x === o.x && p.z === o.z)) return
    const obj: WorldObject = { ...o, id: nextId() }
    set({
      history: [...history.slice(-49), objects],
      objects: [...objects, obj],
      dying: dying.filter(d => !(d.obj.x === o.x && d.obj.z === o.z)),
    })
  },
  removeObject: (x, z) => {
    const { objects, history } = get()
    const obj = objects.find(p => p.x === x && p.z === z)
    if (!obj) return
    set({
      history: [...history.slice(-49), objects],
      objects: objects.filter(p => !(p.x === x && p.z === z)),
      dying: [...get().dying, { obj, at: Date.now() }],
    })
  },
  cycleColor: (x, z) => {
    const { objects, history } = get()
    set({
      history: [...history.slice(-49), objects],
      objects: objects.map(p =>
        p.x === x && p.z === z
          ? { ...p, color: (p.color + 1) % PALETTE.length }
          : p
      ),
    })
  },
  rotateObject: (x, z) => {
    const { objects, history } = get()
    set({
      history: [...history.slice(-49), objects],
      objects: objects.map(p =>
        p.x === x && p.z === z ? { ...p, rot: (p.rot + 1) % 4 } : p
      ),
    })
  },
  clearWorld: () => {
    const { objects, history } = get()
    set({ history: [...history.slice(-49), objects], objects: [] })
  },
  undo: () => {
    const { history, objects } = get()
    if (!history.length) return
    set({ objects: history[history.length - 1], history: history.slice(0, -1) })
  },
  pruneDying: () => {
    const cutoff = Date.now() - 300
    const dying = get().dying.filter(d => d.at > cutoff)
    if (dying.length !== get().dying.length) set({ dying })
  },
  addCustomAsset: a => set({ customAssets: [...get().customAssets, a] }),
}))

export function parseState(s: string | undefined | null): ProjectState {
  if (!s) return { objects: [], customAssets: [] }
  try {
    const p = JSON.parse(s)
    return {
      objects: Array.isArray(p.objects) ? p.objects : [],
      customAssets: Array.isArray(p.customAssets) ? p.customAssets : [],
      playerAsset: typeof p.playerAsset === 'string' ? p.playerAsset : null,
      worldStyle: p.worldStyle === 'medievale' ? 'medievale' : 'cartoon',
    }
  } catch {
    return { objects: [], customAssets: [] }
  }
}

export function serializeState(): string {
  const { objects, customAssets, playerAsset, worldStyle } = useWorld.getState()
  return JSON.stringify({ objects, customAssets, playerAsset, worldStyle })
}

// Palette accogliente per i muri; i tetti derivano dalle coppie
export const PALETTE = [
  '#f7f3e8', // 0 crema
  '#f2d6b3', // 1 sabbia
  '#e9b284', // 2 pesca
  '#d97e4a', // 3 terracotta
  '#b8543f', // 4 mattone
  '#8a9b8e', // 5 salvia
  '#5d7d6b', // 6 verde bosco
  '#7ba3a0', // 7 salvia mare
  '#e3b93e', // 8 senape
  '#9c6b44', //  noce
  '#6b7280', // 10 ardesia
  '#fafafa', // 11 bianco calce
] as const

export const ROOF_PALETTE = [
  '#c96b4a', '#b8543f', '#a34a35', '#7d3b2e', '#8f4636',
  '#6e7f72', '#4e6455', '#5e7d7a', '#a8842e', '#7a5236',
  '#4b5563', '#d0cdc4',
] as const
