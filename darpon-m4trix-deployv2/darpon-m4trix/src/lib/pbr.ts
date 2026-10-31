// ============================================================
// PBR procedurale — texture realistiche generate su canvas
// (niente file esterni: mattoni, coppi, legno, pietra, ciottoli,
//  intonaco, scaglie, tessuto… con normal map dedicata).
// Le texture sono MESSE IN CACHE e condivise: stesso kind+repeat
// = stessa texture in GPU (e un solo PNG dentro il GLB esportato).
// La mappa albedo è disegnata in scala di grigi chiari e viene
// TINTA dal colore del materiale (material.color).
// ============================================================

import * as THREE from 'three'

export type PbrKind =
  | 'intonaco' | 'mattoni' | 'coppi' | 'legno' | 'pietra'
  | 'pietraSquadrata' | 'ciottoli' | 'erba' | 'ghiaia' | 'metallo'
  | 'scaglie' | 'pelle' | 'tessuto' | 'paglia' | 'foglie' | 'sabbia'

// ---------------- PRNG deterministico ----------------

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------- canvas di servizio ----------------

const SIZE = 192 // lato texture (192 = buon compromesso qualità/memoria)

type Painter = (ctx: CanvasRenderingContext2D, rnd: () => number, S: number) => void

function makeCanvas(painter: Painter, seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = SIZE
  c.height = SIZE
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#b9b9b9'
  ctx.fillRect(0, 0, SIZE, SIZE)
  painter(ctx, mulberry32(seed), SIZE)
  return c
}

/** rumore fine a grani (per intonaco/pelle/sabbia) */
function speckle(ctx: CanvasRenderingContext2D, rnd: () => number, S: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(rnd() * 255)
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`
    ctx.fillRect(rnd() * S, rnd() * S, 1 + rnd() * 2, 1 + rnd() * 2)
  }
}

/** macchie morbide grandi (variazione tonale) */
function blotches(ctx: CanvasRenderingContext2D, rnd: () => number, S: number, n: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.floor(150 + rnd() * 90)
    const r = S * (0.06 + rnd() * 0.16)
    const x = rnd() * S
    const y = rnd() * S
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
    grad.addColorStop(0, `rgba(${v},${v},${v},${alpha})`)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

// ---------------- i pittori di ogni materiale ----------------

const PAINTERS: Record<PbrKind, Painter> = {
  intonaco: (ctx, rnd, S) => {
    blotches(ctx, rnd, S, 26, 0.16)
    speckle(ctx, rnd, S, 2600, 0.1)
    // scricchiature leggere
    ctx.strokeStyle = 'rgba(70,70,70,0.16)'
    for (let i = 0; i < 7; i++) {
      ctx.beginPath()
      let x = rnd() * S
      let y = rnd() * S
      ctx.moveTo(x, y)
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 26
        y += rnd() * 20
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
  },

  mattoni: (ctx, rnd, S) => {
    ctx.fillStyle = '#8f8f8f' // malta
    ctx.fillRect(0, 0, S, S)
    const rows = 8
    const bh = S / rows
    const bw = S / 4
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : bw / 2
      for (let c = -1; c < 5; c++) {
        const x = c * bw + off + 2
        const y = r * bh + 2
        const v = Math.floor(120 + rnd() * 70)
        ctx.fillStyle = `rgb(${v},${v - 6},${v - 10})`
        ctx.fillRect(x, y, bw - 4, bh - 4)
        // bordo mattone smussato
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.fillRect(x, y, bw - 4, 2)
        ctx.fillStyle = 'rgba(0,0,0,0.18)'
        ctx.fillRect(x, y + bh - 6, bw - 4, 2)
      }
    }
    speckle(ctx, rnd, S, 1400, 0.08)
  },

  coppi: (ctx, rnd, S) => {
    ctx.fillStyle = '#7a7a7a'
    ctx.fillRect(0, 0, S, S)
    const rows = 6
    const cols = 6
    const rh = S / rows
    const cw = S / cols
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cw
        const y = r * rh
        // coppa: gradiente orizzontale (cilindro)
        const grad = ctx.createLinearGradient(x, y, x + cw, y)
        const base = Math.floor(125 + rnd() * 55)
        grad.addColorStop(0, `rgb(${base - 55},${base - 55},${base - 55})`)
        grad.addColorStop(0.45, `rgb(${base},${base},${base})`)
        grad.addColorStop(1, `rgb(${base - 70},${base - 70},${base - 70})`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.roundRect(x + 1, y + 1, cw - 2, rh + 1, [cw / 2, cw / 2, 0, 0])
        ctx.fill()
        // ombra di sovrapposizione tra le file
        const sh = ctx.createLinearGradient(0, y, 0, y + rh * 0.5)
        sh.addColorStop(0, 'rgba(0,0,0,0.30)')
        sh.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = sh
        ctx.fillRect(x + 1, y + 1, cw - 2, rh * 0.5)
      }
    }
    speckle(ctx, rnd, S, 900, 0.07)
  },

  legno: (ctx, rnd, S) => {
    // 4 assi verticali con venature
    const planks = 4
    const pw = S / planks
    for (let p = 0; p < planks; p++) {
      const base = Math.floor(120 + rnd() * 60)
      ctx.fillStyle = `rgb(${base},${base - 4},${base - 12})`
      ctx.fillRect(p * pw, 0, pw, S)
      // venature: linee ondulate verticali
      for (let g = 0; g < 7; g++) {
        ctx.strokeStyle = `rgba(${base - 60},${base - 60},${base - 60},0.35)`
        ctx.lineWidth = 0.7 + rnd()
        ctx.beginPath()
        let x = p * pw + rnd() * pw
        ctx.moveTo(x, 0)
        for (let y = 0; y <= S; y += 12) {
          x += (rnd() - 0.5) * 5
          x = Math.max(p * pw + 1, Math.min((p + 1) * pw - 1, x))
          ctx.lineTo(x, y)
        }
        ctx.stroke()
      }
      // nodo occasionale
      if (rnd() < 0.6) {
        const nx = p * pw + pw * (0.3 + rnd() * 0.4)
        const ny = rnd() * S
        for (let k = 4; k >= 1; k--) {
          ctx.strokeStyle = `rgba(60,50,42,0.4)`
          ctx.beginPath()
          ctx.ellipse(nx, ny, k * 2.4, k * 4, 0, 0, Math.PI * 2)
          ctx.stroke()
        }
      }
      // stacco tra le assi
      ctx.fillStyle = 'rgba(40,36,30,0.75)'
      ctx.fillRect(p * pw, 0, 2, S)
    }
    speckle(ctx, rnd, S, 700, 0.06)
  },

  pietra: (ctx, rnd, S) => {
    // pietre irregolari a corsi orizzontali (muratura a secco)
    ctx.fillStyle = '#828282'
    ctx.fillRect(0, 0, S, S)
    const rows = 5
    const rh = S / rows
    for (let r = 0; r < rows; r++) {
      let x = -rnd() * 20
      while (x < S) {
        const w = S * (0.14 + rnd() * 0.16)
        const h = rh * (0.72 + rnd() * 0.16)
        const v = Math.floor(105 + rnd() * 85)
        ctx.fillStyle = `rgb(${v},${v - 2},${v - 6})`
        ctx.beginPath()
        ctx.roundRect(x + 2, r * rh + (rh - h) / 2, w - 4, h, [4, 5, 3, 6])
        ctx.fill()
        // luce sul bordo superiore
        ctx.fillStyle = 'rgba(255,255,255,0.14)'
        ctx.fillRect(x + 3, r * rh + (rh - h) / 2, w - 6, 2)
        x += w
      }
    }
    speckle(ctx, rnd, S, 1600, 0.09)
  },

  pietraSquadrata: (ctx, rnd, S) => {
    // blocchi regolari con giunti profondi (fondazioni, torri)
    ctx.fillStyle = '#787878'
    ctx.fillRect(0, 0, S, S)
    const rows = 6
    const rh = S / rows
    const bw = S / 3
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : bw / 2
      for (let c = -1; c < 4; c++) {
        const v = Math.floor(115 + rnd() * 65)
        ctx.fillStyle = `rgb(${v},${v - 1},${v - 4})`
        ctx.fillRect(c * bw + off + 3, r * rh + 3, bw - 6, rh - 6)
        ctx.fillStyle = 'rgba(255,255,255,0.10)'
        ctx.fillRect(c * bw + off + 3, r * rh + 3, bw - 6, 2)
        ctx.fillStyle = 'rgba(0,0,0,0.20)'
        ctx.fillRect(c * bw + off + 3, r * rh + rh - 7, bw - 6, 3)
      }
    }
    speckle(ctx, rnd, S, 1500, 0.08)
  },

  ciottoli: (ctx, rnd, S) => {
    ctx.fillStyle = '#6f6a64'
    ctx.fillRect(0, 0, S, S)
    const rows = 7
    const cols = 7
    const rh = S / rows
    const cw = S / cols
    for (let r = 0; r < rows; r++) {
      const off = r % 2 === 0 ? 0 : cw / 2
      for (let c = -1; c <= cols; c++) {
        const cx = c * cw + off + cw / 2
        const cy = r * rh + rh / 2
        const rr = Math.min(cw, rh) * 0.52
        const v = Math.floor(110 + rnd() * 80)
        const grad = ctx.createRadialGradient(cx - rr * 0.3, cy - rr * 0.3, rr * 0.1, cx, cy, rr)
        grad.addColorStop(0, `rgb(${Math.min(255, v + 40)},${Math.min(255, v + 38)},${Math.min(255, v + 32)})`)
        grad.addColorStop(1, `rgb(${v - 45},${v - 47},${v - 52})`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.ellipse(cx, cy, rr * (0.9 + rnd() * 0.18), rr * (0.75 + rnd() * 0.2), rnd() * 0.6, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    speckle(ctx, rnd, S, 1000, 0.07)
  },

  erba: (ctx, rnd, S) => {
    blotches(ctx, rnd, S, 40, 0.2)
    // fili d'erba: trattini verticali chiari/scuri
    for (let i = 0; i < 2400; i++) {
      const v = Math.floor(rnd() * 255)
      const x = rnd() * S
      const y = rnd() * S
      const h = 2 + rnd() * 6
      ctx.strokeStyle = `rgba(${v},${v},${v},${0.16 + rnd() * 0.14})`
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (rnd() - 0.5) * 3, y - h)
      ctx.stroke()
    }
  },

  ghiaia: (ctx, rnd, S) => {
    ctx.fillStyle = '#9d988e'
    ctx.fillRect(0, 0, S, S)
    for (let i = 0; i < 620; i++) {
      const x = rnd() * S
      const y = rnd() * S
      const r = 1.4 + rnd() * 3.4
      const v = Math.floor(95 + rnd() * 120)
      const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r)
      grad.addColorStop(0, `rgb(${Math.min(255, v + 34)},${Math.min(255, v + 32)},${Math.min(255, v + 26)})`)
      grad.addColorStop(1, `rgb(${v - 36},${v - 38},${v - 44})`)
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  metallo: (ctx, rnd, S) => {
    // spazzolato orizzontale
    for (let y = 0; y < S; y += 1) {
      const v = Math.floor(140 + rnd() * 80)
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`
      ctx.fillRect(0, y, S, 1)
    }
    // qualche graffio più marcato
    for (let i = 0; i < 26; i++) {
      const y = rnd() * S
      const v = rnd() < 0.5 ? 235 : 70
      ctx.strokeStyle = `rgba(${v},${v},${v},0.25)`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.moveTo(rnd() * S * 0.4, y)
      ctx.lineTo(S * (0.5 + rnd() * 0.5), y + (rnd() - 0.5) * 3)
      ctx.stroke()
    }
    speckle(ctx, rnd, S, 400, 0.05)
  },

  scaglie: (ctx, rnd, S) => {
    // file di scaglie a semicerchio sovrapposte
    ctx.fillStyle = '#8c8c8c'
    ctx.fillRect(0, 0, S, S)
    const rows = 8
    const rh = S / rows
    const cw = S / 8
    for (let r = 0; r <= rows; r++) {
      const off = r % 2 === 0 ? 0 : cw / 2
      for (let c = -1; c <= 8; c++) {
        const x = c * cw + off
        const y = r * rh
        const v = Math.floor(115 + rnd() * 75)
        const grad = ctx.createLinearGradient(x, y - rh, x, y)
        grad.addColorStop(0, `rgb(${v},${v},${v})`)
        grad.addColorStop(1, `rgb(${v - 55},${v - 55},${v - 55})`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(x, y, cw * 0.62, Math.PI, 0)
        ctx.fill()
      }
    }
    speckle(ctx, rnd, S, 700, 0.06)
  },

  pelle: (ctx, rnd, S) => {
    blotches(ctx, rnd, S, 22, 0.10)
    speckle(ctx, rnd, S, 2200, 0.07)
    // pori
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = 'rgba(90,90,90,0.10)'
      ctx.beginPath()
      ctx.arc(rnd() * S, rnd() * S, 0.8, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  tessuto: (ctx, rnd, S) => {
    // tessitura: fili orizzontali e verticali alternati
    const step = 6
    for (let y = 0; y < S; y += step) {
      ctx.fillStyle = 'rgba(255,255,255,0.20)'
      ctx.fillRect(0, y, S, step / 2)
      ctx.fillStyle = 'rgba(0,0,0,0.14)'
      ctx.fillRect(0, y + step / 2, S, step / 2)
    }
    for (let x = 0; x < S; x += step) {
      ctx.fillStyle = 'rgba(0,0,0,0.10)'
      ctx.fillRect(x, 0, step / 2, S)
      ctx.fillStyle = 'rgba(255,255,255,0.10)'
      ctx.fillRect(x + step / 2, 0, step / 2, S)
    }
    speckle(ctx, rnd, S, 700, 0.05)
  },

  paglia: (ctx, rnd, S) => {
    // fasci orizzontali di paglia
    for (let y = 0; y < S; y += 4) {
      const v = Math.floor(120 + rnd() * 70)
      ctx.strokeStyle = `rgb(${v},${v - 6},${v - 24})`
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, y + rnd() * 2)
      ctx.lineTo(S, y + (rnd() - 0.5) * 3)
      ctx.stroke()
    }
    // steli diagonali
    for (let i = 0; i < 320; i++) {
      const v = Math.floor(100 + rnd() * 110)
      ctx.strokeStyle = `rgba(${v},${v - 8},${v - 26},0.5)`
      ctx.lineWidth = 1
      const x = rnd() * S
      const y = rnd() * S
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + 6 + rnd() * 8, y - 5 - rnd() * 6)
      ctx.stroke()
    }
  },

  foglie: (ctx, rnd, S) => {
    blotches(ctx, rnd, S, 34, 0.22)
    // grappoli di foglioline
    for (let i = 0; i < 900; i++) {
      const x = rnd() * S
      const y = rnd() * S
      const v = Math.floor(95 + rnd() * 120)
      ctx.fillStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.3})`
      ctx.beginPath()
      ctx.ellipse(x, y, 2 + rnd() * 3, 1.4 + rnd() * 2, rnd() * Math.PI, 0, Math.PI * 2)
      ctx.fill()
    }
  },

  sabbia: (ctx, rnd, S) => {
    blotches(ctx, rnd, S, 18, 0.08)
    speckle(ctx, rnd, S, 3200, 0.09)
    // increspature leggere
    ctx.strokeStyle = 'rgba(80,80,80,0.08)'
    for (let i = 0; i < 12; i++) {
      const y = rnd() * S
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.08 + i) * 4)
      ctx.stroke()
    }
  },
}

// ---------------- normal map dal campo di altezza ----------------

/** Sobel sul canale di luminanza → normal map (tangente, stile glTF) */
function canvasToNormalMap(src: HTMLCanvasElement, strength: number): HTMLCanvasElement {
  const S = src.width
  const sctx = src.getContext('2d')!
  const img = sctx.getImageData(0, 0, S, S)
  const d = img.data
  const out = document.createElement('canvas')
  out.width = S
  out.height = S
  const octx = out.getContext('2d')!
  const oimg = octx.createImageData(S, S)
  const o = oimg.data
  const lum = (i: number) => (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255
  const at = (x: number, y: number) => {
    const xx = (x + S) % S
    const yy = (y + S) % S
    return lum((yy * S + xx) * 4)
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx =
        at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1) -
        (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1))
      const dy =
        at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) -
        (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1))
      const nx = dx * strength
      const ny = dy * strength
      const nz = 1
      const len = Math.hypot(nx, ny, nz)
      const i = (y * S + x) * 4
      o[i] = Math.round(((nx / len) * 0.5 + 0.5) * 255)
      o[i + 1] = Math.round(((ny / len) * 0.5 + 0.5) * 255)
      o[i + 2] = Math.round(((nz / len) * 0.5 + 0.5) * 255)
      o[i + 3] = 255
    }
  }
  octx.putImageData(oimg, 0, 0)
  return out
}

// ---------------- cache delle texture ----------------

type TexPair = { map: THREE.Texture | null; normalMap: THREE.Texture | null }

const texCache = new Map<string, TexPair>()
const matCache = new Map<string, THREE.MeshStandardMaterial>()

/** ambiente senza canvas (SSR / test Node): niente texture, solo colore */
const NO_TEX: TexPair = { map: null, normalMap: null }

const NORMAL_STRENGTH: Partial<Record<PbrKind, number>> = {
  mattoni: 2.2, coppi: 2.6, ciottoli: 2.6, scaglie: 2.0, legno: 1.2,
  pietra: 2.0, pietraSquadrata: 2.4, tessuto: 1.0, paglia: 1.4, foglie: 1.6,
  erba: 0.9, ghiaia: 2.4, intonaco: 0.7, metallo: 0.5, pelle: 0.4, sabbia: 0.6,
}

const SEEDS: Record<PbrKind, number> = {
  intonaco: 11, mattoni: 23, coppi: 37, legno: 41, pietra: 53, pietraSquadrata: 59,
  ciottoli: 67, erba: 71, ghiaia: 73, metallo: 79, scaglie: 83, pelle: 89,
  tessuto: 97, paglia: 101, foglie: 103, sabbia: 107,
}

/** texture (albedo + normal) per un materiale, con repeat [rx, ry] */
export function getTextures(kind: PbrKind, rx = 1, ry = 1): TexPair {
  if (typeof document === 'undefined') return NO_TEX // SSR / Node: solo colore
  const key = `${kind}|${rx}|${ry}`
  const hit = texCache.get(key)
  if (hit) return hit
  const albedo = makeCanvas(PAINTERS[kind], SEEDS[kind])
  const normal = canvasToNormalMap(albedo, NORMAL_STRENGTH[kind] ?? 1)
  const map = new THREE.CanvasTexture(albedo)
  map.colorSpace = THREE.SRGBColorSpace
  map.wrapS = map.wrapT = THREE.RepeatWrapping
  map.repeat.set(rx, ry)
  map.anisotropy = 4
  const nm = new THREE.CanvasTexture(normal)
  nm.wrapS = nm.wrapT = THREE.RepeatWrapping
  nm.repeat.set(rx, ry)
  nm.anisotropy = 4
  const pair: TexPair = { map, normalMap: nm }
  texCache.set(key, pair)
  return pair
}

export type PbrMatOpts = {
  roughness?: number
  metalness?: number
  repeat?: number   // repeat quadrato
  rx?: number       // repeat orizzontale (prevale su repeat)
  ry?: number       // repeat verticale
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  opacity?: number
}

/**
 * Materiale PBR condiviso (cache per kind+colore+parametri).
 * ATTENZIONE: è un oggetto CONDIVISO — non mutarlo dopo la creazione
 * (per i ghost usare GhostGroup, che clona).
 */
export function pbrMat(
  kind: PbrKind,
  color: THREE.ColorRepresentation,
  opts: PbrMatOpts = {}
): THREE.MeshStandardMaterial {
  const rx = opts.rx ?? opts.repeat ?? 1
  const ry = opts.ry ?? opts.repeat ?? 1
  const key = `${kind}|${String(color)}|${rx}|${ry}|${opts.roughness ?? ''}|${opts.metalness ?? ''}|${String(opts.emissive ?? '')}|${opts.emissiveIntensity ?? ''}|${opts.opacity ?? ''}`
  const hit = matCache.get(key)
  if (hit) return hit
  const { map, normalMap } = getTextures(kind, rx, ry)
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: opts.roughness ?? 0.9,
    metalness: opts.metalness ?? 0,
  })
  if (map) m.map = map
  if (normalMap) {
    m.normalMap = normalMap
    m.normalScale = new THREE.Vector2(1, 1)
  }
  if (opts.emissive !== undefined) {
    m.emissive = new THREE.Color(opts.emissive)
    m.emissiveIntensity = opts.emissiveIntensity ?? 0.5
  }
  if (opts.opacity !== undefined && opts.opacity < 1) {
    m.transparent = true
    m.opacity = opts.opacity
  }
  matCache.set(key, m)
  return m
}

/** Pulisce le cache (usato solo nei test) */
export function clearPbrCaches() {
  for (const t of texCache.values()) {
    t.map.dispose()
    t.normalMap.dispose()
  }
  texCache.clear()
  matCache.clear()
}
