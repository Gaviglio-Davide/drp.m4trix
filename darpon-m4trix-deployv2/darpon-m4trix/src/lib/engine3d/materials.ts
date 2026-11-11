// ============================================================
// DARPX ENGINE — materiali PBR realistici procedurali (v17)
// Texture disegnate su canvas (ZERO file esterni) con normal
// map generata dall'altezza: pannelli di nave spaziale, grate,
// calcestruzzo, marmo venato, vetrate, hazard, schermi.
// Tutto in cache: stesso tipo = stessa texture in GPU.
// ============================================================

import * as THREE from 'three'

// ---------------- PRNG ----------------

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------- canvas → normal map ----------------

const S = 256

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number) => void

function canvasOf(painter: Painter, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = S
  c.height = S
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#a8a8a8'
  ctx.fillRect(0, 0, S, S)
  painter(ctx, mulberry32(seed))
  return c
}

/** converte la luminanza del canvas in una normal map (Sobel) */
function toNormal(src: HTMLCanvasElement, strength = 1): HTMLCanvasElement {
  const w = src.width
  const h = src.height
  const sctx = src.getContext('2d')!
  const data = sctx.getImageData(0, 0, w, h).data
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const octx = out.getContext('2d')!
  const img = octx.createImageData(w, h)
  const lum = (x: number, y: number) => {
    const xi = (x + w) % w
    const yi = (y + h) % h
    const i = (yi * w + xi) * 4
    return (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 255
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (lum(x - 1, y) - lum(x + 1, y)) * strength
      const dy = (lum(x, y - 1) - lum(x, y + 1)) * strength
      const len = Math.hypot(dx, dy, 1)
      const i = (y * w + x) * 4
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255
      img.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255
      img.data[i + 3] = 255
    }
  }
  octx.putImageData(img, 0, 0)
  return out
}

// ---------------- pittori ----------------

/** pannelli di scafo spaziale: lastre chiare con giunti, rivetti e prese d'aria */
function paintWhitePanel(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#c2c8d2'
  ctx.fillRect(0, 0, S, S)
  // variazione tra lastre
  const cols = 2
  const rows = 2
  const cw = S / cols
  const ch = S / rows
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const v = 186 + Math.floor(rnd() * 26)
      ctx.fillStyle = `rgb(${v},${v + 4},${v + 10})`
      ctx.fillRect(cx * cw + 3, cy * ch + 3, cw - 6, ch - 6)
    }
  }
  // giunti scavati
  ctx.strokeStyle = 'rgba(70,78,92,0.9)'
  ctx.lineWidth = 3
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw, 0); ctx.lineTo(i * cw, S); ctx.stroke()
  }
  for (let i = 0; i <= rows; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * ch); ctx.lineTo(S, i * ch); ctx.stroke()
  }
  // riga di profondità morbida lungo i giunti
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 1
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath(); ctx.moveTo(i * cw + 2.5, 0); ctx.lineTo(i * cw + 2.5, S); ctx.stroke()
  }
  // rivetti agli angoli delle lastre
  ctx.fillStyle = '#8a92a0'
  for (let cy = 0; cy <= rows; cy++) {
    for (let cx = 0; cx <= cols; cx++) {
      for (const [ox, oy] of [[-10, -10], [10, -10], [-10, 10], [10, 10]] as const) {
        ctx.beginPath()
        ctx.arc(cx * cw + ox + 4, cy * ch + oy + 4, 2.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }
  // prese d'aria su una lastra
  const vx = cw * 0.5 + 10
  const vy = ch * 0.5 + 10
  ctx.fillStyle = '#5a6270'
  for (let i = 0; i < 7; i++) ctx.fillRect(vx - 22, vy - 18 + i * 6, 44, 3)
  // graffi leggeri
  ctx.strokeStyle = 'rgba(255,255,255,0.10)'
  ctx.lineWidth = 1
  for (let i = 0; i < 14; i++) {
    const x = rnd() * S, y = rnd() * S
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd() * 26 - 13, y + rnd() * 26 - 13); ctx.stroke()
  }
  // sporco agli angoli
  for (let i = 0; i < 26; i++) {
    const v = 120 + Math.floor(rnd() * 40)
    ctx.fillStyle = `rgba(${v},${v},${v},0.16)`
    ctx.fillRect(rnd() * S, rnd() * S, 2 + rnd() * 5, 2 + rnd() * 5)
  }
}

/** griglia di pavimento industriale */
function paintGrate(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#20242c'
  ctx.fillRect(0, 0, S, S)
  const step = 32
  // barra centrale chiara + bordi scuri (i buchi restano scuri)
  for (let y = 0; y < S; y += step) {
    for (let x = 0; x < S; x += step) {
      const v = 120 + Math.floor(rnd() * 24)
      ctx.fillStyle = `rgb(${v},${v + 6},${v + 12})`
      ctx.fillRect(x + 3, y + 3, step - 6, 6) // barra orizzontale
      ctx.fillRect(x + 3, y + 3, 6, step - 6) // barra verticale
      ctx.fillStyle = `rgb(${v - 22},${v - 16},${v - 8})`
      ctx.fillRect(x + step - 9, y + 3, 6, step - 6) // ombra lato dx
    }
  }
  // usura
  for (let i = 0; i < 40; i++) {
    const v = 150 + Math.floor(rnd() * 60)
    ctx.fillStyle = `rgba(${v},${v},${v},0.10)`
    ctx.fillRect(rnd() * S, rnd() * S, 3 + rnd() * 8, 2 + rnd() * 4)
  }
}

/** calcestruzzo con macchie e crepe */
function paintConcrete(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#9a9a96'
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 60; i++) {
    const v = 130 + Math.floor(rnd() * 60)
    const r = 8 + rnd() * 36
    const g = ctx.createRadialGradient(rnd() * S, rnd() * S, 0, rnd() * S, rnd() * S, r)
    g.addColorStop(0, `rgba(${v},${v},${v - 4},0.20)`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, S, S)
  }
  // crepe
  ctx.strokeStyle = 'rgba(60,60,58,0.5)'
  for (let i = 0; i < 5; i++) {
    let x = rnd() * S, y = rnd() * S
    ctx.beginPath(); ctx.moveTo(x, y)
    for (let k = 0; k < 8; k++) {
      x += rnd() * 30 - 15
      y += rnd() * 30 - 15
      ctx.lineTo(x, y)
    }
    ctx.lineWidth = rnd() * 1.4 + 0.4
    ctx.stroke()
  }
  // granuloso
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(rnd() * 255)
    ctx.fillStyle = `rgba(${v},${v},${v},0.05)`
    ctx.fillRect(rnd() * S, rnd() * S, 1.5, 1.5)
  }
}

/** marmo venato (crema caldo) */
function paintMarble(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#d8cdb8'
  ctx.fillRect(0, 0, S, S)
  // nuvolature
  for (let i = 0; i < 24; i++) {
    const v = 190 + Math.floor(rnd() * 40)
    ctx.fillStyle = `rgba(${v},${v - 6},${v - 20},0.25)`
    ctx.beginPath()
    ctx.ellipse(rnd() * S, rnd() * S, 20 + rnd() * 60, 8 + rnd() * 30, rnd() * Math.PI, 0, Math.PI * 2)
    ctx.fill()
  }
  // vene scure (random walk morbido)
  const vein = (alpha: number, width: number, color: string) => {
    let x = rnd() * S, y = -10
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = width
    ctx.beginPath(); ctx.moveTo(x, y)
    while (y < S + 10) {
      x += rnd() * 26 - 13
      y += 8 + rnd() * 16
      ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  for (let i = 0; i < 7; i++) vein(0.32 + rnd() * 0.2, 0.8 + rnd() * 1.4, '#5a4632')
  for (let i = 0; i < 4; i++) vein(0.18, 2 + rnd() * 2, '#b8a888')
  // venature dorate leggere
  for (let i = 0; i < 3; i++) vein(0.14, 0.7, '#a8842e')
}

/** vetrata: spicchi gioiello con piombo */
function paintStainedGlass(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#0a0c12'
  ctx.fillRect(0, 0, S, S)
  const JEWELS = ['#c8322e', '#2e62c8', '#c8a12e', '#2e9c48', '#7a3ec0', '#c86a1e']
  // spicchi concentrici
  const rings = [S * 0.16, S * 0.30, S * 0.44]
  const cx = S / 2, cy = S / 2
  for (let r = 0; r < rings.length; r++) {
    const segs = 6 + r * 4
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2
      const a1 = ((i + 1) / segs) * Math.PI * 2
      const r1 = rings[r]
      const r0 = r === 0 ? 4 : rings[r - 1] + 5
      ctx.beginPath()
      ctx.arc(cx, cy, r1, a0 + 0.02, a1 - 0.02)
      ctx.arc(cx, cy, r0, a1 - 0.02, a0 + 0.02, true)
      ctx.closePath()
      ctx.fillStyle = JEWELS[Math.floor(rnd() * JEWELS.length)]
      ctx.fill()
      ctx.strokeStyle = '#1a1e28'
      ctx.lineWidth = 3
      ctx.stroke()
    }
  }
  // centro
  ctx.beginPath(); ctx.arc(cx, cy, 14, 0, Math.PI * 2)
  ctx.fillStyle = '#e8c85a'; ctx.fill()
  ctx.strokeStyle = '#1a1e28'; ctx.lineWidth = 4; ctx.stroke()
  // bordo esterno a piombo
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.47, 0, Math.PI * 2)
  ctx.strokeStyle = '#232833'; ctx.lineWidth = 14; ctx.stroke()
  // finto riflesso della luce
  ctx.globalAlpha = 0.12
  ctx.fillStyle = '#ffffff'
  ctx.beginPath(); ctx.ellipse(cx - S * 0.14, cy - S * 0.16, S * 0.22, S * 0.10, -0.6, 0, Math.PI * 2); ctx.fill()
  ctx.globalAlpha = 1
}

/** strisce di pericolo giallo/nero */
function paintHazard(ctx: CanvasRenderingContext2D, _rnd: () => number) {
  ctx.fillStyle = '#d8b422'
  ctx.fillRect(0, 0, S, S)
  ctx.fillStyle = '#16181e'
  ctx.save()
  ctx.translate(S / 2, S / 2)
  ctx.rotate(-Math.PI / 4)
  ctx.translate(-S, -S)
  for (let i = 0; i < 16; i++) ctx.fillRect(i * 32, 0, 16, S * 2)
  ctx.restore()
}

/** schermo di telemetria (linee ciano su fondo scuro) */
function paintScreen(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#04101c'
  ctx.fillRect(0, 0, S, S)
  // griglia
  ctx.strokeStyle = 'rgba(0,240,255,0.10)'
  ctx.lineWidth = 1
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * 32); ctx.lineTo(S, i * 32); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(i * 32, 0); ctx.lineTo(i * 32, S); ctx.stroke()
  }
  // grafici
  const graph = (y0: number, amp: number, color: string, alpha: number) => {
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, y0)
    for (let x = 0; x <= S; x += 6) {
      ctx.lineTo(x, y0 - Math.sin((x / S) * Math.PI * (2 + rnd() * 3)) * amp * (0.4 + rnd() * 0.6))
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }
  graph(70, 26, '#00f0ff', 0.9)
  graph(140, 18, '#7cffb2', 0.7)
  graph(200, 30, '#ffb43a', 0.5)
  // blocchi "testo"
  ctx.fillStyle = 'rgba(0,240,255,0.5)'
  for (let i = 0; i < 10; i++) ctx.fillRect(14, 226 + 0, 0, 0)
  for (let i = 0; i < 9; i++) ctx.fillRect(12 + i * 26, 228, 14 + rnd() * 12, 5)
  // barra di stato
  ctx.fillStyle = 'rgba(0,240,255,0.85)'
  ctx.fillRect(0, 0, S, 6)
}

/** lamiera ondulata dei container */
function paintCorrugated(ctx: CanvasRenderingContext2D, rnd: () => number) {
  const base = 150
  ctx.fillStyle = `rgb(${base},${base},${base})`
  ctx.fillRect(0, 0, S, S)
  const rib = 32
  for (let x = 0; x < S; x += rib) {
    const g = ctx.createLinearGradient(x, 0, x + rib, 0)
    g.addColorStop(0, 'rgba(255,255,255,0.30)')
    g.addColorStop(0.5, 'rgba(0,0,0,0.22)')
    g.addColorStop(1, 'rgba(255,255,255,0.30)')
    ctx.fillStyle = g
    ctx.fillRect(x, 0, rib, S)
    ctx.fillStyle = 'rgba(0,0,0,0.34)'
    ctx.fillRect(x, 0, 2, S)
  }
  // ruggine
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(120,60,20,${0.08 + rnd() * 0.14})`
    ctx.fillRect(rnd() * S, rnd() * S, 4 + rnd() * 20, 3 + rnd() * 12)
  }
}

/** cupola a cassettoni (quadrotti in ombra) */
function paintCoffer(ctx: CanvasRenderingContext2D, rnd: () => number) {
  ctx.fillStyle = '#8a7a5e'
  ctx.fillRect(0, 0, S, S)
  const n = 4
  const c = S / n
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = 150 + Math.floor(rnd() * 26)
      ctx.fillStyle = `rgb(${v},${v - 14},${v - 40})`
      ctx.fillRect(x * c + 8, y * c + 8, c - 16, c - 16)
      ctx.strokeStyle = 'rgba(40,30,16,0.75)'
      ctx.lineWidth = 6
      ctx.strokeRect(x * c + 8, y * c + 8, c - 16, c - 16)
      ctx.strokeStyle = 'rgba(212,175,55,0.35)'
      ctx.lineWidth = 2
      ctx.strokeRect(x * c + 14, y * c + 14, c - 28, c - 28)
    }
  }
}

// ---------------- cache texture ----------------

export type RMatKind =
  | 'whitePanel' | 'grate' | 'concrete' | 'marble' | 'stainedGlass'
  | 'hazard' | 'screen' | 'corrugated' | 'coffer'

const PAINTERS: Record<RMatKind, { painter: Painter; seed: number; normal: number }> = {
  whitePanel: { painter: paintWhitePanel, seed: 11, normal: 1.4 },
  grate: { painter: paintGrate, seed: 23, normal: 1.8 },
  concrete: { painter: paintConcrete, seed: 37, normal: 0.8 },
  marble: { painter: paintMarble, seed: 43, normal: 0.5 },
  stainedGlass: { painter: paintStainedGlass, seed: 57, normal: 0.35 },
  hazard: { painter: paintHazard, seed: 61, normal: 1.0 },
  screen: { painter: paintScreen, seed: 71, normal: 0.3 },
  corrugated: { painter: paintCorrugated, seed: 83, normal: 1.5 },
  coffer: { painter: paintCoffer, seed: 97, normal: 1.2 },
}

type TexPair = { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }
const texCache = new Map<string, TexPair>()

function getTex(kind: RMatKind, rx = 1, ry = 1): TexPair | null {
  if (typeof document === 'undefined') return null
  const key = `${kind}|${rx}|${ry}`
  const hit = texCache.get(key)
  if (hit) return hit
  const def = PAINTERS[kind]
  const albedo = canvasOf(def.painter, def.seed)
  const normal = toNormal(albedo, def.normal)
  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(rx, ry)
  map.anisotropy = 8
  const nm = new THREE.CanvasTexture(normal)
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping
  nm.repeat.set(rx, ry)
  nm.anisotropy = 8
  const pair = { map, normalMap: nm }
  texCache.set(key, pair)
  return pair
}

// ---------------- materiali ----------------

const matCache = new Map<string, THREE.MeshStandardMaterial>()

export type RMatOpts = {
  color?: THREE.ColorRepresentation
  rough?: number
  metal?: number
  rx?: number
  ry?: number
  emissive?: THREE.ColorRepresentation
  eInt?: number
  opacity?: number
  flat?: boolean // niente texture (oro, metalli lucidi)
}

/**
 * Materiale realistico condiviso (in cache). NON mutarlo dopo
 * la creazione: per varianti passare parametri diversi.
 */
export function rMat(kind: RMatKind | 'flat', opts: RMatOpts = {}): THREE.MeshStandardMaterial {
  const key = `${kind}|${String(opts.color ?? '')}|${opts.rough ?? ''}|${opts.metal ?? ''}|${opts.rx ?? 1}|${opts.ry ?? 1}|${String(opts.emissive ?? '')}|${opts.eInt ?? ''}|${opts.opacity ?? ''}`
  const hit = matCache.get(key)
  if (hit) return hit
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(opts.color ?? '#ffffff'),
    roughness: opts.rough ?? 0.5,
    metalness: opts.metal ?? 0,
  })
  if (kind !== 'flat') {
    const tex = getTex(kind, opts.rx ?? 1, opts.ry ?? 1)
    if (tex) {
      m.map = tex.map
      m.normalMap = tex.normalMap
    }
  }
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive)
    m.emissiveIntensity = opts.eInt ?? 1
  }
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true
    m.opacity = opts.opacity
  }
  matCache.set(key, m)
  return m
}

// ---------------- scorciatoie per i prefab ----------------

/** pannelli di scafo (tinta base bianco sporco) */
export function hullMat(color = '#e8ecf2'): THREE.MeshStandardMaterial {
  return rMat('whitePanel', { color, rough: 0.38, metal: 0.82, rx: 1, ry: 1 })
}
/** metallo scuro tecnico (telai, costole) */
export function techMat(color = '#3a414e'): THREE.MeshStandardMaterial {
  return rMat('whitePanel', { color, rough: 0.5, metal: 0.85, rx: 2, ry: 2 })
}
/** pavimento a griglia */
export function grateMat(color = '#cfd6e2'): THREE.MeshStandardMaterial {
  return rMat('grate', { color, rough: 0.55, metal: 0.7, rx: 1, ry: 1 })
}
/** calcestruzzo */
export function concreteMat(color = '#b4b2ac'): THREE.MeshStandardMaterial {
  return rMat('concrete', { color, rough: 0.92, metal: 0, rx: 1, ry: 1 })
}
/** marmo lucido */
export function marbleMat(color = '#e6dcc6'): THREE.MeshStandardMaterial {
  return rMat('marble', { color, rough: 0.22, metal: 0.05, rx: 1, ry: 1 })
}
/** oro lucido (per altari e decorazioni) */
export function goldMat(): THREE.MeshStandardMaterial {
  return rMat('flat', { color: '#d4af37', rough: 0.24, metal: 1 })
}
/** oro antico opaco */
export function oldGoldMat(): THREE.MeshStandardMaterial {
  return rMat('flat', { color: '#a8862e', rough: 0.45, metal: 1 })
}
/** pietra per statue e muri antichi */
export function stoneMat(color = '#b8b0a0'): THREE.MeshStandardMaterial {
  return rMat('concrete', { color, rough: 0.88, metal: 0, rx: 1, ry: 1 })
}
/** vetrata emissiva (le finestre della cattedrale) */
export function glassMat(): THREE.MeshStandardMaterial {
  return rMat('stainedGlass', { color: '#ffffff', rough: 0.3, metal: 0, emissive: '#ffffff', eInt: 0.85 })
}
/** strisce di pericolo */
export function hazardMat(): THREE.MeshStandardMaterial {
  return rMat('hazard', { color: '#ffffff', rough: 0.7, metal: 0.1 })
}
/** schermo luminoso */
export function screenMat(): THREE.MeshStandardMaterial {
  return rMat('screen', { color: '#ffffff', rough: 0.35, metal: 0, emissive: '#00f0ff', eInt: 1.15 })
}
/** lamiera container */
export function containerMat(color = '#2e62c8'): THREE.MeshStandardMaterial {
  return rMat('corrugated', { color, rough: 0.62, metal: 0.55 })
}
/** cupola a cassettoni */
export function cofferMat(): THREE.MeshStandardMaterial {
  return rMat('coffer', { color: '#d8c8a2', rough: 0.6, metal: 0.1 })
}
/** superficie emissiva pura (strisce luce, occhi, fiamme) */
export function glowMat(color: THREE.ColorRepresentation, intensity = 2): THREE.MeshStandardMaterial {
  return rMat('flat', { color: '#101216', rough: 0.4, metal: 0, emissive: color, eInt: intensity })
}

// ---------------- carta con testo (cartelli) ----------------

const signCache = new Map<string, THREE.MeshStandardMaterial>()

/** cartello con testo disegnato su canvas (es. REATTORE 1) */
export function signMat(
  text: string,
  opts: { bg?: string; fg?: string; accent?: string; sub?: string } = {}
): THREE.MeshStandardMaterial {
  const key = `${text}|${opts.bg ?? ''}|${opts.fg ?? ''}|${opts.sub ?? ''}`
  const hit = signCache.get(key)
  if (hit) return hit
  if (typeof document === 'undefined') {
    // SSR / Node: nessun canvas disponibile, fallback pieno
    return rMat('hazard', { color: opts.bg ?? '#d8b422' })
  }
  const W = 256, H = 128
  const c = document.createElement('canvas')
  c.width = W, c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = opts.bg ?? '#d8b422'
  ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = '#101216'
  ctx.lineWidth = 8
  ctx.strokeRect(6, 6, W - 12, H - 12)
  ctx.fillStyle = opts.fg ?? '#101216'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  // scala il font finché il testo entra
  let size = 44
  do {
    ctx.font = `900 ${size}px 'Arial Black', Arial, sans-serif`
    size -= 2
  } while (ctx.measureText(text).width > W - 40 && size > 10)
  ctx.fillText(text, W / 2, opts.sub ? H / 2 - 12 : H / 2)
  if (opts.sub) {
    ctx.font = `600 ${16}px Arial, sans-serif`
    ctx.fillStyle = opts.accent ?? '#101216'
    ctx.fillText(opts.sub, W / 2, H / 2 + 26)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const m = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.25,
    emissive: new THREE.Color('#ffffff'),
    emissiveMap: tex,
    emissiveIntensity: 0.22,
  })
  signCache.set(key, m)
  return m
}

/** pulisce tutte le cache (test) */
export function clearEngine3DCaches() {
  texCache.clear()
  matCache.clear()
  signCache.clear()
}
