'use client'

import { create } from 'zustand'
import {
  DEFAULT_PARAGRAPHS,
  SITE_DEFAULTS,
  type HomeParagraph,
  type SectionConfig,
  type SiteConfig,
} from '@/lib/site'

// ============================================================
// Store UI condiviso: permette all'Agente Darpx (e ad altri
// componenti) di cambiare reparto della home, precompilare la
// creazione 3D e leggere i contenuti del sito configurati
// dall'admin, senza prop-drilling.
// ============================================================

export type DashboardTab = 'mondi' | 'genera' | 'importati' | 'strutture' | 'darpx'

type SiteContent = {
  config: SiteConfig
  paragraphs: HomeParagraph[]
  sections: Record<string, { title: string; subtitle: string; enabled: boolean }>
  announcement: { text: string; enabled: boolean }
}

type UIState = {
  tab: DashboardTab
  setTab: (t: DashboardTab) => void

  // prefill della creazione 3D (scritto dall'agente, letto da DarpxAI)
  darpxPrefill: string | null
  setDarpxPrefill: (p: string | null) => void

  // contenuto del sito (admin), caricato una volta sola
  site: SiteContent
  siteLoaded: boolean
  loadSite: () => Promise<void>
}

export const DEFAULT_SECTIONS: Record<string, { title: string; subtitle: string; enabled: boolean }> = {
  mondi: { title: 'I miei mondi', subtitle: 'Crea un nuovo progetto, costruisci il mondo e trasformalo in un videogioco.', enabled: true },
  genera: { title: 'Genera', subtitle: 'Città medievali, villaggi, fortezze e paesaggi generati in un click.', enabled: true },
  importati: { title: 'Progetti importati', subtitle: 'Carica qui tutti i modelli 3D che vuoi (.glb / .gltf): restano in ordine, scegli la loro dimensione e li trovi pronti nell\'editor di ogni tuo progetto.', enabled: true },
  strutture: { title: 'Strutture', subtitle: 'Progetta case e edifici pezzo per pezzo: la tua libreria è disponibile in ogni mondo.', enabled: true },
  darpx: { title: 'Darpx.ai', subtitle: 'L\'AI del sito: immagine → mondo, testo o immagine → 3D e l\'Agente Darpx che ti aiuta subito.', enabled: true },
}

export const useUI = create<UIState>((set, get) => ({
  tab: 'mondi',
  setTab: tab => set({ tab }),

  darpxPrefill: null,
  setDarpxPrefill: darpxPrefill => set({ darpxPrefill }),

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
        sections?: Record<string, { title: string; subtitle: string; enabled: boolean }>
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
  sections: Record<string, { title: string; subtitle: string; enabled: boolean }>,
  key: string
): { title: string; subtitle: string; enabled: boolean } {
  return sections[key] ?? DEFAULT_SECTIONS[key] ?? { title: key, subtitle: '', enabled: true }
}

export type { SectionConfig }
