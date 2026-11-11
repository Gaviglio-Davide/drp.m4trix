// ============================================================
// DARPX ENGINE — schema del MONDO REALISTICO (v17)
// Un RWorld è una scena 3D "seria": prefab PBR, luci vere,
// nebbia, bloom e post-processing. Vive dentro un GameProject
// in settings.realWorld (nessuna migrazione del DB).
// ============================================================

export type RVec3 = [number, number, number]

/** override del materiale del prefab (colori/tinteggiatura) */
export type RMatOverride = {
  color?: string
  rough?: number // 0..1
  metal?: number // 0..1
  emissive?: string
  eInt?: number
}

/** un oggetto piazzato nel mondo realistico */
export type RObject = {
  id: string
  prefab: string // id del prefab (vedi prefabs.ts) — 'glb' = modello utente
  p: RVec3 // posizione [x, y, z] in metri
  r: RVec3 // rotazione in GRADI [x, y, z]
  s: RVec3 // scala [x, y, z]
  mat?: RMatOverride
  // ---- solo per prefab 'glb' (personaggi/modelli dell'utente) ----
  url?: string
  name?: string
  anim?: number | null // indice clip di animazione
}

/** una luce piazzata a mano nel mondo */
export type RLightObj = {
  id: string
  kind: 'point' | 'spot'
  p: RVec3
  color: string
  intensity: number
  distance: number
  angle?: number // solo spot, radianti
}

export type RSkyPreset = 'interno' | 'notte' | 'tramonto' | 'giorno' | 'nebbia'

/** impostazioni di rendering dell'ambiente */
export type REnv = {
  sky: RSkyPreset
  fog: string // colore nebbia
  fogDensity: number // 0 = niente
  exposure: number // esposizione tone-mapping (0.4..2)
  bloom: number // intensità glow (0..2.5)
  vignette: number // 0..1
}

export type RWorld = {
  engine: 'darpx3d'
  v: 1
  env: REnv
  objects: RObject[]
  lights: RLightObj[]
  spawn: RVec3
  spawnYaw: number // radianti
}

// ---------------- preset ambientali ----------------

export const ENV_PRESETS: Record<
  RSkyPreset,
  {
    label: string
    bg: string
    hemi: [string, string, number] // cielo, suolo, intensità
    dir: [string, number, RVec3] | null // colore, intensità, posizione
    fog: string
    fogDensity: number
  }
> = {
  interno: {
    label: 'Interno (neutro)',
    bg: '#0b0e14',
    hemi: ['#cfd8e8', '#20242e', 0.85],
    dir: null,
    fog: '#0b0e14',
    fogDensity: 0,
  },
  notte: {
    label: 'Notte (luna)',
    bg: '#060a18',
    hemi: ['#26324f', '#0a0e1a', 0.5],
    dir: ['#9fb8ff', 1.1, [-30, 50, -20]],
    fog: '#060a18',
    fogDensity: 0.014,
  },
  tramonto: {
    label: 'Tramonto',
    bg: '#2a1608',
    hemi: ['#ffb37a', '#241408', 0.75],
    dir: ['#ff9a4d', 2.2, [60, 18, 30]],
    fog: '#2a1608',
    fogDensity: 0.012,
  },
  giorno: {
    label: 'Giorno (sole)',
    bg: '#9db8d8',
    hemi: ['#dfeaff', '#5a5f52', 1.0],
    dir: ['#fff2dd', 2.6, [40, 60, 25]],
    fog: '#9db8d8',
    fogDensity: 0.006,
  },
  nebbia: {
    label: 'Nebbia fitta',
    bg: '#8b939c',
    hemi: ['#aab4bd', '#4a4f55', 0.85],
    dir: null,
    fog: '#8b939c',
    fogDensity: 0.05,
  },
}

// ---------------- modelli di partenza ----------------

export type RealTemplate = {
  id: string
  name: string
  icon: string
  desc: string
  tag: 'interni' | 'esterni'
}

export const REAL_TEMPLATES: RealTemplate[] = [
  {
    id: 'corridoio-spaziale',
    name: 'Corridoio della Stazione',
    icon: '🛰',
    desc: 'Corridoio spaziale in metallo bianco: pannelli, tubi, luci al neon, cartello REATTORE 1 e due robot di manutenzione con occhi arancioni.',
    tag: 'interni',
  },
  {
    id: 'cattedrale',
    name: 'Cattedrale Sacra',
    icon: '⛪',
    desc: 'Navata barocca: colonne di marmo, archi, cupola a cassettoni, rosone di vetrate, altare dorato, leoni di pietra e mare di candele.',
    tag: 'interni',
  },
  {
    id: 'hangar',
    name: 'Hangar Industriale',
    icon: '🏗',
    desc: 'Capannone con travi d\'acciaio, container, gru a ponte e riflettori da cantiere. Per giochi militari o di esplorazione.',
    tag: 'interni',
  },
  {
    id: 'sala-macchine',
    name: 'Sala Macchine',
    icon: '⚙',
    desc: 'Reattori pulsanti, tubi a grappolo, passerelle grate e luci di allerta rosse. Perfetta per un finale teso.',
    tag: 'interni',
  },
  {
    id: 'biblioteca',
    name: 'Biblioteca Antica',
    icon: '📚',
    desc: 'Scaffali di legno colmi di libri, tavoli di lettura, lampade d\'ottone e candele. Atmosfera calda e raccolta.',
    tag: 'interni',
  },
  {
    id: 'rovine',
    name: 'Rovine al Chiaro di Luna',
    icon: '🌙',
    desc: 'Colonne spezzate sotto il cielo stellato, altare con sigillo blu e bracieri accesi. Per dungeon a cielo aperto.',
    tag: 'esterni',
  },
  {
    id: 'vuoto',
    name: 'Base vuota (griglia)',
    icon: '⬛',
    desc: 'Parti da zero su una griglia pulita: scegli i prefab dalla palette e costruisci tutto tu, da vero level designer.',
    tag: 'interni',
  },
]

// ---------------- costruttori ----------------

let ridCounter = 0
export function rid(): string {
  ridCounter = (ridCounter + 1) % 100000
  return `ro_${Date.now().toString(36)}_${ridCounter.toString(36)}${Math.random()
    .toString(36)
    .slice(2, 5)}`
}

export function defaultEnv(template: string): REnv {
  switch (template) {
    case 'corridoio-spaziale':
      return { sky: 'interno', fog: '#c8d8ec', fogDensity: 0.035, exposure: 1.1, bloom: 0.9, vignette: 0.32 }
    case 'cattedrale':
      return { sky: 'interno', fog: '#241505', fogDensity: 0.02, exposure: 1.15, bloom: 0.75, vignette: 0.38 }
    case 'hangar':
      return { sky: 'interno', fog: '#141a22', fogDensity: 0.016, exposure: 1.05, bloom: 0.55, vignette: 0.3 }
    case 'sala-macchine':
      return { sky: 'interno', fog: '#060a10', fogDensity: 0.05, exposure: 1.0, bloom: 1.1, vignette: 0.42 }
    case 'biblioteca':
      return { sky: 'interno', fog: '#1a0e04', fogDensity: 0.024, exposure: 1.1, bloom: 0.6, vignette: 0.36 }
    case 'rovine':
      return { sky: 'notte', fog: '#0a1224', fogDensity: 0.02, exposure: 1.2, bloom: 0.8, vignette: 0.35 }
    default:
      return { sky: 'interno', fog: '#0b0e14', fogDensity: 0, exposure: 1.05, bloom: 0.5, vignette: 0.25 }
  }
}

/** spawn consigliato per ogni template */
function spawnFor(template: string): { spawn: RVec3; yaw: number } {
  switch (template) {
    case 'corridoio-spaziale':
      return { spawn: [-11.2, 0, 0], yaw: -Math.PI / 2 } // guarda verso la luce in fondo (+X)
    case 'cattedrale':
      return { spawn: [0, 0, -12.5], yaw: Math.PI } // guarda verso l'altare (+Z)
    case 'hangar':
      return { spawn: [-12, 0, 7], yaw: 0.6 }
    case 'sala-macchine':
      return { spawn: [0, 0, -6.5], yaw: Math.PI }
    case 'biblioteca':
      return { spawn: [0, 0, -7], yaw: Math.PI }
    case 'rovine':
      return { spawn: [0, 0, -12], yaw: Math.PI } // guarda verso l'altare
    default:
      return { spawn: [0, 1.7, 6], yaw: 0 }
  }
}

/** crea un mondo realistico pronto: ambiente completo + spawn */
export function newRealWorld(template: string): RWorld {
  const { spawn, yaw } = spawnFor(template)
  const w: RWorld = {
    engine: 'darpx3d',
    v: 1,
    env: defaultEnv(template),
    objects: [],
    lights: [],
    spawn,
    spawnYaw: yaw,
  }
  if (template !== 'vuoto') {
    w.objects.push({
      id: rid(),
      prefab: template,
      p: [0, 0, 0],
      r: [0, 0, 0],
      s: [1, 1, 1],
    })
  }
  return w
}

/** clona profondo (per editing senza toccare l'originale) */
export function cloneRealWorld(w: RWorld): RWorld {
  return JSON.parse(JSON.stringify(w)) as RWorld
}

/** valida un JSON caricato: true se è un RWorld riconoscibile */
export function isRWorld(v: unknown): v is RWorld {
  if (!v || typeof v !== 'object') return false
  const w = v as Record<string, unknown>
  return w.engine === 'darpx3d' && Array.isArray(w.objects)
}

/** sanitizza un RWorld caricato (campi mancanti → default) */
export function sanitizeRealWorld(v: unknown): RWorld {
  const base = newRealWorld('vuoto')
  if (!isRWorld(v)) return base
  const w = v as RWorld
  return {
    engine: 'darpx3d',
    v: 1,
    env: { ...base.env, ...(w.env ?? {}) },
    objects: (w.objects ?? []).filter(o => o && typeof o.prefab === 'string'),
    lights: (w.lights ?? []).filter(l => l && (l.kind === 'point' || l.kind === 'spot')),
    spawn: Array.isArray(w.spawn) && w.spawn.length === 3 ? w.spawn : base.spawn,
    spawnYaw: typeof w.spawnYaw === 'number' ? w.spawnYaw : 0,
  }
}
