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
  // v18: proprietà "seri" dell'ispettore (stile Unreal/Godot)
  name?: string // nome mostrato in Outliner e Details
  hidden?: boolean // invisibile in modalità GIOCO
  noCollide?: boolean // attraversabile: nessuna collisione
  locked?: boolean // selezionabile ma NON muovibile col gizmo
  note?: string // nota libera dell'autore (tag, descrizione…)
  // ---- solo per prefab 'glb' (personaggi/modelli dell'utente) ----
  url?: string
  anim?: number | null // indice clip di animazione
  animSpeed?: number // velocità dell'animazione (1 = normale)
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

export type RSkyPreset = 'interno' | 'notte' | 'nottebosco' | 'tramonto' | 'giorno' | 'nebbia'

/** v17: personaggio del GIOCATORE nel mondo realistico */
export type RPlayerChar = {
  url: string // GLB del personaggio ('' = nessuno: camera in prima persona)
  name?: string
  anim?: number | null // indice della clip da girare mentre si muove
  cam: 'prima' | 'terza' // camera dentro il personaggio o dietro di lui
  yawOff?: number // rotazione extra del modello in gradi (se il GLB guarda "al contrario")
}

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
  player?: RPlayerChar // v17: personaggio del giocatore (facoltativo)
  // v19: CREATURE (mostri/PNG del gioco horror) e INTERAZIONI (falò, oggetti)
  creatures?: RCreature[]
  spots?: RSpot[]
}

/** v19: una creatura del mondo realistico (mostro o PNG) */
export type RCreature = {
  id: string
  name: string // mostrato sopra la testa (nametag, come nel trailer)
  p: RVec3
  kind: 'vaga' | 'insegue' | 'ferma' // IA: passeggia / inseguirti se ti vede / statua
  speed: number // m/s (vaga ~1.2, insegue ~3-4.6)
  aggro: number // raggio di vista in metri (solo 'insegue')
  dmg: number // danni al contatto per secondo
  scale: number // 1 = umanoide ~1.8m
  color: string // colore del corpo (scuro di default)
}

/** v19: punto di interazione stile "[E] Start game" del trailer */
export type RSpot = {
  id: string
  label: string // testo del prompt "[E] …"
  p: RVec3
  radius: number // raggio di attivazione
  action: 'riposa' | 'messaggio' | 'salva'
  msg?: string // messaggio mostrato al termine
  holdMs?: number // ms di pressione E (default 1200)
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
  nottebosco: {
    label: 'Bosco Notturno (horror)',
    bg: '#141b21',
    hemi: ['#3a4a46', '#18201a', 0.58],
    dir: ['#8ea6c8', 0.8, [-40, 55, -25]],
    fog: '#11161a',
    fogDensity: 0.04,
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
    id: 'bosco-notturno',
    name: 'Bosco Notturno',
    icon: '🌲',
    desc: 'Foresta horror di notte: 240 abeti nella nebbia, sentiero di terra, radura con falò di pietra, fossa nel bosco e torce. Prima persona, atmosfera da trailer.',
    tag: 'esterni',
  },
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
    case 'bosco-notturno':
      return { sky: 'nottebosco', fog: '#39443f', fogDensity: 0.042, exposure: 0.92, bloom: 0.85, vignette: 0.5 }
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
    case 'bosco-notturno':
      return { spawn: [0, 0, 4], yaw: Math.PI + 0.4 } // sul sentiero, guarda il falò
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
  // v19: il Bosco Notturno nasce PRONTO per giocarci: falò interattivo
  // ("riposa" = cura e salva, come lo [E] Start game del trailer) e
  // una creatura con occhi bianchi che vaga tra gli alberi
  if (template === 'bosco-notturno') {
    w.spots = [
      {
        id: `S${rid()}`,
        label: 'Riposa al falò',
        p: [6, 0, 6.79],
        radius: 2.4,
        action: 'riposa',
        msg: 'Ti sei riposato al falò: salute e energie tornate. Il gioco è salvato.',
        holdMs: 1200,
      },
    ]
    w.creatures = [
      {
        id: `C${rid()}`,
        name: 'Viandante',
        p: [-14, 0, 16],
        kind: 'vaga',
        speed: 1.3,
        aggro: 9,
        dmg: 6,
        scale: 1,
        color: '#14161a',
      },
    ]
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
  const pl = w.player
  return {
    engine: 'darpx3d',
    v: 1,
    env: { ...base.env, ...(w.env ?? {}) },
    objects: (w.objects ?? []).filter(o => o && typeof o.prefab === 'string'),
    lights: (w.lights ?? []).filter(l => l && (l.kind === 'point' || l.kind === 'spot')),
    spawn: Array.isArray(w.spawn) && w.spawn.length === 3 ? w.spawn : base.spawn,
    spawnYaw: typeof w.spawnYaw === 'number' ? w.spawnYaw : 0,
    // v19: creature e interazioni (con default sicuri)
    creatures: Array.isArray(w.creatures)
      ? w.creatures
          .filter(c => c && typeof c.p === 'object')
          .map((c, i) => ({
            id: typeof c.id === 'string' ? c.id : `C${i}`,
            name: typeof c.name === 'string' && c.name ? c.name : `Creatura ${i + 1}`,
            p: (Array.isArray(c.p) && c.p.length === 3 ? c.p : [0, 0, 0]) as RVec3,
            kind: c.kind === 'insegue' || c.kind === 'ferma' ? c.kind : 'vaga',
            speed: typeof c.speed === 'number' && c.speed > 0 ? c.speed : 1.3,
            aggro: typeof c.aggro === 'number' && c.aggro > 0 ? c.aggro : 9,
            dmg: typeof c.dmg === 'number' ? c.dmg : 6,
            scale: typeof c.scale === 'number' && c.scale > 0 ? c.scale : 1,
            color: typeof c.color === 'string' ? c.color : '#14161a',
          }))
      : undefined,
    spots: Array.isArray(w.spots)
      ? w.spots
          .filter(s => s && typeof s.p === 'object')
          .map((s, i) => ({
            id: typeof s.id === 'string' ? s.id : `S${i}`,
            label: typeof s.label === 'string' && s.label ? s.label : 'Interagisci',
            p: (Array.isArray(s.p) && s.p.length === 3 ? s.p : [0, 0, 0]) as RVec3,
            radius: typeof s.radius === 'number' && s.radius > 0 ? s.radius : 2.4,
            action: s.action === 'messaggio' || s.action === 'salva' ? s.action : 'riposa',
            msg: typeof s.msg === 'string' ? s.msg : undefined,
            holdMs: typeof s.holdMs === 'number' && s.holdMs > 0 ? s.holdMs : 1200,
          }))
      : undefined,
    player:
      pl && typeof pl.url === 'string'
        ? {
            url: pl.url,
            name: typeof pl.name === 'string' ? pl.name : undefined,
            anim: typeof pl.anim === 'number' ? pl.anim : null,
            cam: pl.cam === 'terza' ? 'terza' : 'prima',
            yawOff: typeof pl.yawOff === 'number' ? pl.yawOff : 0,
          }
        : undefined,
  }
}
