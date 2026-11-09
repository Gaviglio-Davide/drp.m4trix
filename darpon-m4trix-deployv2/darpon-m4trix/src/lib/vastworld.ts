'use client'

// ============================================================
// darpon.m4trix — V13 MOTORE MONDO VASTO (solo natura)
// Terreno procedurale INFINITO a chunk: niente più rettangolo!
// - montagne creste (ridged noise) con maschere continentali
// - colline morbide con domain warping (flusso naturale)
// - pianure, valli, laghi con livello dell'acqua
// - foreste deterministiche: pini, querce, betulle, cespugli,
//   rocce — più al mondo visiti, più ne nasce (seed fisso)
// - colori realistici per quota/pendenza: sabbia, prato,
//   bosco, roccia, neve
// Tutto deterministico dal seed: il mondo NON occupa spazio
// nel DB, si rigenera identico a ogni accesso.
// ============================================================

export type VastTod = 'alba' | 'giorno' | 'tramonto' | 'notte'

export type VastBiome = 'alpino' | 'invernale' | 'autunnale' | 'mediterraneo'

export type VastConfig = {
  seed: number
  mountains: number // 0..1 altezza/frequenza catene montuose
  hills: number // 0..1 collinosità
  trees: number // 0..1 densità foreste
  water: number // 0..1 quantità di acqua (livello laghi/mare)
  tod: VastTod // ora del giorno (luce, cielo, nebbia)
  quality?: 'basso' | 'medio' | 'alto' // raggio streaming chunk
  biome?: VastBiome // v14: STILE del paesaggio (alpino, invernale, autunnale, mediterraneo)
}

/** v14: gli STILI del paesaggio che l'utente può scegliere */
export const VAST_BIOMES: { id: VastBiome; label: string; desc: string }[] = [
  { id: 'alpino', label: '🏔 Alpino', desc: 'prati verdi, pini, neve sulle vette' },
  { id: 'invernale', label: '❄️ Invernale', desc: 'neve ovunque, laghi ghiacciati' },
  { id: 'autunnale', label: '🍂 Autunnale', desc: 'tonalità dorate e ramate' },
  { id: 'mediterraneo', label: '🌊 Mediterraneo', desc: 'coste sabbiose, macchia secca' },
]

export function vastBiome(b: VastBiome | undefined): VastBiome {
  return b ?? 'alpino'
}

export const VAST_DEFAULT: VastConfig = {
  seed: 1,
  mountains: 0.6,
  hills: 0.5,
  trees: 0.55,
  water: 0.35,
  tod: 'giorno',
  quality: 'medio',
}

// ---------------- hash & noise ----------------

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 2246822519)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296 // 0..1
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

/** value noise 2D bilineare-smooth */
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const tx = smooth(x - xi)
  const ty = smooth(y - yi)
  const a = hash2(xi, yi, seed)
  const b = hash2(xi + 1, yi, seed)
  const c = hash2(xi, yi + 1, seed)
  const d = hash2(xi + 1, yi + 1, seed)
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

/** fBm: somma di ottave di value noise → 0..1 circa */
export function fbm(x: number, y: number, seed: number, oct: number): number {
  let amp = 0.5
  let f = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    sum += vnoise(x * f, y * f, seed + i * 1013) * amp
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

/** cresta montuosa: 1 sulle creste, 0 nelle valli */
function ridge(x: number, y: number, seed: number, oct: number): number {
  let amp = 0.55
  let f = 1
  let sum = 0
  let norm = 0
  for (let i = 0; i < oct; i++) {
    const n = 1 - Math.abs(vnoise(x * f, y * f, seed + i * 733) * 2 - 1)
    sum += n * n * amp
    norm += amp
    amp *= 0.5
    f *= 2.11
  }
  return sum / norm
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.max(0, Math.min(1, t))
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

// ---------------- livello acqua ----------------

export const WATER_LEVEL = -2.2 // metri

/** quantità d'acqua 0..1 → soglia continenti (più acqua = meno terra) */
export function waterShift(cfg: VastConfig): number {
  return lerp(0.62, 0.34, cfg.water)
}

// ---------------- quota del terreno ----------------

/**
 * Quota del mondo vasto alle coordinate mondo (x, z) in metri.
 * Deterministica: stesso seed + stesse coordinate = stessa quota,
 * su QUALSIASI dispositivo e a QUALSIASI distanza dal centro.
 */
export function vastHeight(x: number, z: number, cfg: VastConfig): number {
  const s = cfg.seed * 419 + 17

  // deformazione del dominio: piega il paesaggio come la natura
  const wx = x + (fbm(x * 0.008, z * 0.008, s + 91, 3) - 0.5) * 90
  const wz = z + (fbm(x * 0.008 + 7.3, z * 0.008 + 2.9, s + 137, 3) - 0.5) * 90

  // continenti: soffice variazione grande scala
  const cont = fbm(wx * 0.0035, wz * 0.0035, s, 4)
  const shift = waterShift(cfg)
  let h = (cont - shift) * 46 // mare profondo → pianure costiere

  // catene montuose: maschere ampie + creste affilate
  const mMaskRaw = fbm(wx * 0.0016 + 11.2, wz * 0.0016 + 5.7, s + 401, 3)
  const mMask = smoothstep(0.44, 0.72, mMaskRaw)
  const peaks = ridge(wx * 0.011, wz * 0.011, s + 601, 4)
  h += mMask * Math.pow(peaks, 1.35) * (6 + 78 * cfg.mountains)

  // colline: fBm medio con warp
  h += (fbm(wx * 0.021, wz * 0.021, s + 811, 4) - 0.5) * 2 * (2 + 15 * cfg.hills)

  // microdettaglio roccia/terra
  h += (fbm(x * 0.11, z * 0.11, s + 971, 2) - 0.5) * 0.9

  // sponde morbide: appiattisce dolcemente vicino al livello acqua
  if (h < WATER_LEVEL + 2.4) {
    const t = smoothstep(WATER_LEVEL - 1.4, WATER_LEVEL + 2.4, h)
    h = lerp(WATER_LEVEL - 1.2 - (WATER_LEVEL - h) * 0.6, h, t)
  }
  return h
}

/** pendenza approssimata (|gradiente|) via differenze finite */
export function vastSlope(x: number, z: number, cfg: VastConfig): number {
  const d = 1.2
  const hx = vastHeight(x + d, z, cfg) - vastHeight(x - d, z, cfg)
  const hz = vastHeight(x, z + d, cfg) - vastHeight(x, z - d, cfg)
  return Math.hypot(hx, hz) / (2 * d)
}

// ---------------- colori del paesaggio ----------------

const C_SABBIA: [number, number, number] = [0.76, 0.68, 0.47]
const C_PRATO: [number, number, number] = [0.38, 0.55, 0.25]
const C_BOSCO: [number, number, number] = [0.22, 0.4, 0.18]
const C_ROCCIA: [number, number, number] = [0.46, 0.44, 0.42]
const C_ROCCIA_S: [number, number, number] = [0.35, 0.33, 0.32]
const C_NEVE: [number, number, number] = [0.93, 0.95, 0.98]
const C_FONDO: [number, number, number] = [0.3, 0.42, 0.35]

// v14: tinte del terreno per STILE del paesaggio
type BiomeTint = {
  prato: [number, number, number]
  bosco: [number, number, number]
  roccia: [number, number, number]
  sabbia: [number, number, number]
  neveShift: number // sposta la linea delle nevi (negativo = più neve)
  beachWidth: number // larghezza extra delle spiagge (metri)
  snowLow: boolean // neve anche in pianura (inverno)
}
const BIOME_TINT: Record<VastBiome, BiomeTint> = {
  alpino: {
    prato: C_PRATO, bosco: C_BOSCO, roccia: C_ROCCIA, sabbia: C_SABBIA,
    neveShift: 0, beachWidth: 0, snowLow: false,
  },
  invernale: {
    prato: [0.8, 0.84, 0.88], bosco: [0.32, 0.4, 0.36], roccia: [0.52, 0.54, 0.58],
    sabbia: C_NEVE, neveShift: -16, beachWidth: 2.5, snowLow: true,
  },
  autunnale: {
    prato: [0.63, 0.5, 0.2], bosco: [0.46, 0.24, 0.1], roccia: [0.48, 0.42, 0.36],
    sabbia: [0.7, 0.6, 0.4], neveShift: 12, beachWidth: 0, snowLow: false,
  },
  mediterraneo: {
    prato: [0.56, 0.56, 0.27], bosco: [0.32, 0.42, 0.2], roccia: [0.64, 0.6, 0.52],
    sabbia: [0.82, 0.74, 0.52], neveShift: 30, beachWidth: 3.5, snowLow: false,
  },
}

/** leggera variazione naturale del colore (macchie d'erba, muschio) */
function tint(x: number, z: number, seed: number, k: number): number {
  return (vnoise(x * 0.35, z * 0.35, seed + 555) - 0.5) * k
}

/**
 * Colore del terreno per quota e pendenza. Rende il paesaggio
 * REALISTICO: sabbia sull'acqua, prato in basso, bosco scuro
 * dove c'è foresta, roccia sui pendii, neve sulle vette.
 */
export function vastColor(
  x: number,
  z: number,
  h: number,
  slope: number,
  cfg: VastConfig,
  forest?: number
): [number, number, number] {
  const s = cfg.seed * 419 + 17
  const f = forest ?? vastForest(x, z, cfg)
  const bt = BIOME_TINT[vastBiome(cfg.biome)]
  let c: [number, number, number]
  const rockLine = 14 + cfg.mountains * 30 // quota oltre la quale è roccia
  const snowLine = Math.max(4, rockLine + 12 + cfg.mountains * 22 + bt.neveShift)
  const beach = WATER_LEVEL + 1.6 + bt.beachWidth

  if (h < WATER_LEVEL + 0.35) {
    c = [lerp(C_FONDO[0], bt.sabbia[0], smoothstep(WATER_LEVEL - 1.6, WATER_LEVEL + 0.35, h)),
         lerp(C_FONDO[1], bt.sabbia[1], smoothstep(WATER_LEVEL - 1.6, WATER_LEVEL + 0.35, h)),
         lerp(C_FONDO[2], bt.sabbia[2], smoothstep(WATER_LEVEL - 1.6, WATER_LEVEL + 0.35, h))]
  } else if (h < beach) {
    c = [...bt.sabbia] as [number, number, number]
  } else {
    // prato → bosco in base alla foresta + quota
    const forestMix = smoothstep(0.45, 0.72, f) * (1 - smoothstep(rockLine * 0.55, rockLine, h))
    c = [
      lerp(bt.prato[0], bt.bosco[0], forestMix),
      lerp(bt.prato[1], bt.bosco[1], forestMix),
      lerp(bt.prato[2], bt.bosco[2], forestMix),
    ]
    // pendenza → roccia affiorante
    const rockMix = smoothstep(0.55, 1.15, slope)
    c = [
      lerp(c[0], slope > 0.9 ? C_ROCCIA_S[0] : bt.roccia[0], rockMix),
      lerp(c[1], slope > 0.9 ? C_ROCCIA_S[1] : bt.roccia[1], rockMix),
      lerp(c[2], slope > 0.9 ? C_ROCCIA_S[2] : bt.roccia[2], rockMix),
    ]
    // alta quota → roccia, poi neve (in inverno nevica anche in pianura)
    const highRock = smoothstep(rockLine, rockLine + 6, h)
    let snow = smoothstep(snowLine, snowLine + 7, h + tint(x, z, s, 3))
    if (bt.snowLow) snow = Math.max(snow, smoothstep(beach + 1.5, beach + 7, h))
    for (let i = 0; i < 3; i++) c[i] = lerp(c[i], bt.roccia[i], highRock)
    for (let i = 0; i < 3; i++) c[i] = lerp(c[i], C_NEVE[i], snow * (1 - smoothstep(0.9, 1.4, slope)))
  }

  // variazione naturale
  const k = tint(x, z, s, 0.06)
  return [Math.max(0, Math.min(1, c[0] + k)), Math.max(0, Math.min(1, c[1] + k * 1.1)), Math.max(0, Math.min(1, c[2] + k * 0.7))]
}

// ---------------- vegetazione ----------------

/** maschera foresta 0..1 (dove gli alberi crescono fitti) */
export function vastForest(x: number, z: number, cfg: VastConfig): number {
  const s = cfg.seed * 419 + 17
  const n = fbm(x * 0.013 + 3.1, z * 0.013 + 8.8, s + 1717, 3)
  return n * cfg.trees * 1.7
}

export type VastPlant = {
  x: number
  z: number
  y: number
  kind: 'pino' | 'querce' | 'betulla' | 'cespuglio' | 'roccia'
  scale: number
  rot: number
}

/**
 * Posiziona la vegetazione in modo DETERMINISTICO dentro il
 * rettangolo mondo [x0..x1)x[z0..z1): stesso seed = stessi
 * alberi sempre, in qualsiasi sessione di gioco.
 */
export function vastPlants(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  cfg: VastConfig
): VastPlant[] {
  const s = cfg.seed * 419 + 17
  const out: VastPlant[] = []
  const CELL = 4.5 // un candidato per cella di 4.5 m
  const i0 = Math.floor(x0 / CELL)
  const i1 = Math.floor(x1 / CELL)
  const j0 = Math.floor(z0 / CELL)
  const j1 = Math.floor(z1 / CELL)
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const r1 = hash2(i, j, s + 21)
      const r2 = hash2(i, j, s + 22)
      const r3 = hash2(i, j, s + 23)
      const r4 = hash2(i, j, s + 24)
      const x = (i + r1) * CELL
      const z = (j + r2) * CELL
      const h = vastHeight(x, z, cfg)
      if (h < WATER_LEVEL + 0.9) continue // sott'acqua / sponda
      const slope = vastSlope(x, z, cfg)
      if (slope > 0.95) continue // troppo ripido
      const f = vastForest(x, z, cfg)
      const forestMix = smoothstep(0.45, 0.72, f)
      const bt = BIOME_TINT[vastBiome(cfg.biome)]
      const rockLine = 14 + cfg.mountains * 30
      const snowLine = Math.max(4, rockLine + 12 + cfg.mountains * 22 + bt.neveShift)
      // densità: foreste fitte, radure con alberi radi
      const density = forestMix * 0.85 + 0.08
      if (r3 > density) continue
      // altezza: sotto la linea degli alberi
      if (h > snowLine - 4) {
        // alta montagna: solo rocce sparse
        if (r3 < 0.06) out.push({ x, z, y: h, kind: 'roccia', scale: 0.5 + r4 * 1.4, rot: r1 * Math.PI * 2 })
        continue
      }
      const altitude = smoothstep(6, rockLine, h)
      // tipo: pini in quota, querce in pianura, betulle a metà
      // v14: ogni STILE di paesaggio ha la sua vegetazione tipica
      const b = vastBiome(cfg.biome)
      let kind: VastPlant['kind']
      if (b === 'invernale') {
        kind = r4 > 0.3 ? 'pino' : 'betulla'
      } else if (b === 'mediterraneo') {
        kind = altitude > 0.5 ? 'pino' : r4 > 0.55 ? 'cespuglio' : 'querce'
      } else if (b === 'autunnale') {
        kind = altitude > 0.62 ? 'pino' : altitude > 0.3 ? (r4 > 0.7 ? 'pino' : 'querce') : (r4 > 0.85 ? 'betulla' : 'querce')
      } else {
        if (altitude > 0.62) kind = 'pino'
        else if (altitude > 0.3) kind = r4 > 0.55 ? 'betulla' : 'pino'
        else kind = r4 > 0.8 ? 'betulla' : 'querce'
      }
      if (r3 > 0.94 && !forestMix) kind = 'roccia'
      else if (r3 > 0.9 - forestMix * 0.18) kind = 'cespuglio'
      const sc =
        kind === 'pino' ? 0.75 + r4 * 0.9
        : kind === 'querce' ? 0.85 + r4 * 0.75
        : kind === 'betulla' ? 0.8 + r4 * 0.7
        : kind === 'cespuglio' ? 0.6 + r4 * 0.7
        : 0.45 + r4 * 1.1
      out.push({ x, z, y: h, kind, scale: sc, rot: r2 * Math.PI * 2 })
    }
  }
  return out
}

// ---------------- spawn ----------------

/** trova un punto di spawn asciutto e non ripido vicino al centro */
export function vastSpawn(cfg: VastConfig): { x: number; z: number; y: number } {
  for (let r = 0; r < 260; r += 6) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2 + r * 0.35
      const x = Math.cos(ang) * r
      const z = Math.sin(ang) * r
      const h = vastHeight(x, z, cfg)
      if (h > WATER_LEVEL + 1.6 && vastSlope(x, z, cfg) < 0.5) {
        return { x, z, y: h }
      }
    }
  }
  return { x: 0, z: 0, y: vastHeight(0, 0, cfg) }
}

// ---------------- cielo, luce e nebbia per ora del giorno ----------------

export type VastAtmo = {
  sky: string
  fogColor: string
  fogNear: number
  fogFar: number
  sunPos: [number, number, number]
  sunColor: string
  sunIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  ambient: number
  waterColor: string
}

export function vastAtmo(tod: VastTod): VastAtmo {
  switch (tod) {
    case 'alba':
      return {
        sky: '#ffc9a3',
        fogColor: '#f7c49a',
        fogNear: 60,
        fogFar: 460,
        sunPos: [-80, 14, 30],
        sunColor: '#ffb377',
        sunIntensity: 1.9,
        hemiSky: '#ffd9b8',
        hemiGround: '#5a4a38',
        hemiIntensity: 0.75,
        ambient: 0.28,
        waterColor: '#3f6d78',
      }
    case 'tramonto':
      return {
        sky: '#ff9e6b',
        fogColor: '#e88a5e',
        fogNear: 50,
        fogFar: 420,
        sunPos: [90, 10, -40],
        sunColor: '#ff8b4d',
        sunIntensity: 1.7,
        hemiSky: '#ffb98c',
        hemiGround: '#4a3a30',
        hemiIntensity: 0.6,
        ambient: 0.24,
        waterColor: '#4a5a72',
      }
    case 'notte':
      return {
        sky: '#0a1128',
        fogColor: '#0d1530',
        fogNear: 30,
        fogFar: 300,
        sunPos: [40, 60, -60],
        sunColor: '#8fa8ff',
        sunIntensity: 0.5,
        hemiSky: '#1b2a52',
        hemiGround: '#0c101c',
        hemiIntensity: 0.4,
        ambient: 0.16,
        waterColor: '#0e1c33',
      }
    default:
      return {
        sky: '#87b5e0',
        fogColor: '#bcd4e6',
        fogNear: 90,
        fogFar: 620,
        sunPos: [60, 90, 40],
        sunColor: '#fff3d6',
        sunIntensity: 2.1,
        hemiSky: '#bcd9f2',
        hemiGround: '#51603f',
        hemiIntensity: 0.85,
        ambient: 0.32,
        waterColor: '#2e6b8a',
      }
  }
}

// ---------------- preset e utilità ----------------

export const VAST_TOD_LABEL: Record<VastTod, string> = {
  alba: '🌅 Alba',
  giorno: '☀️ Giorno pieno',
  tramonto: '🌇 Tramonto',
  notte: '🌙 Notte stellata',
}

/** raggio in chunk dello streaming per qualità (chunk = 24 m) */
export function qualityRadius(q: VastConfig['quality']): number {
  return q === 'basso' ? 4 : q === 'alto' ? 7 : 5
}

export function parseVastConfig(v: unknown): VastConfig | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Partial<VastConfig>
  if (typeof o.seed !== 'number') return null
  return {
    seed: o.seed,
    mountains: clamp01(o.mountains, 0.6),
    hills: clamp01(o.hills, 0.5),
    trees: clamp01(o.trees, 0.55),
    water: clamp01(o.water, 0.35),
    tod: (['alba', 'giorno', 'tramonto', 'notte'] as VastTod[]).includes(o.tod as VastTod)
      ? (o.tod as VastTod)
      : 'giorno',
    quality: o.quality === 'basso' || o.quality === 'alto' ? o.quality : 'medio',
    biome: (['alpino', 'invernale', 'autunnale', 'mediterraneo'] as VastBiome[]).includes(
      o.biome as VastBiome
    )
      ? (o.biome as VastBiome)
      : 'alpino',
  }
}

function clamp01(v: unknown, d: number): number {
  return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : d
}

/** limite del mondo vasto: praticamente infinito ma con un cordone di sicurezza */
export const VAST_HALF = 4000 // metri dal centro (16 km² esplorabili)
