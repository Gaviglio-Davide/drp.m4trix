'use client'

import { create } from 'zustand'
import {
  DEFAULT_PARAGRAPHS,
  SITE_DEFAULTS,
  defaultSectionConfig,
  type FeatureState,
  type HomeParagraph,
  type SectionConfig,
  type SiteConfig,
} from '@/lib/site'

// ============================================================
// Store UI condiviso: permette all'Agente Darpx (e ad altri
// componenti) di cambiare reparto della home, precompilare la
// creazione 3D e leggere i contenuti del sito configurati
// dall'admin, senza prop-drilling.
// v18: i reparti sono 5 (Strutture e Crea da Script RIMOSSI
// definitivamente) e ogni funzione ha uno stato admin
// (on / off / manutenzione / aggiornamento / sospesa).
// ============================================================

export type DashboardTab =
  | 'gamestudio'
  | 'worldforge'
  | 'mondi'
  | 'importati'
  | 'darpx'

type SiteContent = {
  config: SiteConfig
  paragraphs: HomeParagraph[]
  sections: Record<string, SectionConfig>
  announcement: { text: string; enabled: boolean }
}

type UIState = {
  tab: DashboardTab
  setTab: (t: DashboardTab) => void

  // prefill della creazione 3D (scritto dall'agente, letto da DarpxAI)
  darpxPrefill: string | null
  setDarpxPrefill: (p: string | null) => void

  // quando un altro reparto crea un gioco, apre direttamente
  // l'editor del Game Studio su quel progetto
  studioOpenId: string | null
  setStudioOpenId: (id: string | null) => void

  // contenuto del sito (admin), caricato una volta sola
  site: SiteContent
  siteLoaded: boolean
  loadSite: () => Promise<void>
}

export const DEFAULT_SECTIONS: Record<string, SectionConfig> = {
  gamestudio: { title: 'Game Studio', subtitle: 'Il cuore di darpon.m4trix: costruisci videogiochi veri con il Darpx Engine realistico — personaggi animati, terza persona, mondi vasti e giochi 2D. Provali al volo con ▶ PROVA.', state: 'on', enabled: true },
  worldforge: { title: 'Mappe & Regni', subtitle: 'Crea il tuo mondo da zero: genera una mappa casuale e personalizza tutto — città con edifici e mura, villaggi, dungeon, caverne, fiumi e strade. Poi manda tutto nel Game Studio.', state: 'on', enabled: true },
  mondi: { title: 'Mondi 3D', subtitle: 'Il laboratorio dei mondi 3D: case, strade e alberi con un clic, terreno scolpibile e il generatore di città e paesaggi con il bottone Genera.', state: 'on', enabled: true },
  importati: { title: 'Progetti importati', subtitle: 'Carica qui tutti i modelli 3D che vuoi (.glb / .gltf): restano in ordine, scegli la loro dimensione e li trovi pronti nell\'editor di ogni tuo progetto.', state: 'on', enabled: true },
  darpx: { title: 'Laboratorio', subtitle: 'Il laboratorio creativo: immagine → mondo, testo o immagine → 3D e l\'Agente che ti aiuta subito.', state: 'on', enabled: true },
  genera: { title: 'Genera', subtitle: 'Città medievali, villaggi, fortezze e paesaggi generati in un click. Lo trovi dentro il reparto Mondi 3D.', state: 'on', enabled: true },
  catalogo: { title: 'Catalogo modelli 3D', subtitle: '', state: 'on', enabled: true },
  agente: { title: 'Agente Darpx', subtitle: '', state: 'on', enabled: true },
  hubimport: { title: 'Importa mondi da Hub', subtitle: '', state: 'on', enabled: true },
}

export const useUI = create<UIState>((set, get) => ({
  tab: 'gamestudio',
  setTab: tab => set({ tab }),

  darpxPrefill: null,
  setDarpxPrefill: darpxPrefill => set({ darpxPrefill }),

  studioOpenId: null,
  setStudioOpenId: studioOpenId => set({ studioOpenId }),

  site: {
    config: { ...SITE_DEFAULTS },
    paragraphs: DEFAULT_PARAGRAPHS,
    sections: DEFAULT_SECTIONS,
    announcement: { text: '', enabled: false },
  },
  siteLoaded: false,

  loadSite: async () => {
    if (get().siteLoaded) return
    try {
      const res = await fetch('/api/site')
      if (!res.ok) return
      const data = (await res.json()) as {
        config?: SiteConfig
        paragraphs?: HomeParagraph[]
        sections?: Record<string, SectionConfig>
        announcement?: { text: string; enabled: boolean }
      }
      set({
        site: {
          config: data.config ?? { ...SITE_DEFAULTS },
          paragraphs: data.paragraphs ?? DEFAULT_PARAGRAPHS,
          sections: data.sections ?? DEFAULT_SECTIONS,
          announcement: data.announcement ?? { text: '', enabled: false },
        },
        siteLoaded: true,
      })
    } catch {
      // offline: si usano i default
    }
  },
}))

/** sezione con fallback sui valori predefiniti */
export function sectionOf(
  sections: Record<string, SectionConfig>,
  key: string
): SectionConfig {
  return sections[key] ?? DEFAULT_SECTIONS[key] ?? defaultSectionConfig(key)
}

/** stato admin di una funzione (on / off / manutenzione / aggiornamento / sospesa) */
export function featureState(
  sections: Record<string, SectionConfig>,
  key: string
): FeatureState {
  return sectionOf(sections, key).state
}

/** true solo se la funzione è pienamente attiva */
export function featureOn(
  sections: Record<string, SectionConfig>,
  key: string
): boolean {
  return featureState(sections, key) === 'on'
}

export type { SectionConfig }
