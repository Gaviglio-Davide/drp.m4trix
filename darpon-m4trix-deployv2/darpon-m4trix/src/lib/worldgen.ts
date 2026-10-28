'use client'

// ============================================================
// Generatore procedurale di mondi: città medievali, villaggi,
// fortezze e paesaggi con laghi e colline. Stessa identica
// struttura dati dell'editor (oggetti + heightmap), quindi
// tutto ciò che genera è subito giocabile e modificabile.
// ============================================================

import {
  newTerrain,
  terrainBump,
  terrainDip,
  T_GRID_HALF,
  type Terrain,
} from './terrain'
import type { WorldObject } from './world-store'

export type GenKind = 'citta' | 'villaggio' | 'fortezza' | 'paesaggio'
export type GenSize = 's' | 'm' | 'l' | 'xl'

export type GenOptions = {
  kind: GenKind
  size: GenSize
  density: number // 0..1: quanti edifici
  seed: number
}

export type GenResult = {
  objects: Omit<WorldObject, 'id'>[]
  terrain: Terrain | null
  stats: { case: number; alberi: number; strade: number; mura: number }
}

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

const SIZE_RADIUS: Record<GenSize, number> = { s: 9, m: 14, l: 19, xl: 24 }
const KIND_LABEL: Record<GenKind, string> = {
  citta: 'Città medievale',
  villaggio: 'Villaggio',
  fortezza: 'Fortezza',
  paesaggio: 'Paesaggio',
}
export const GEN_KINDS: { id: GenKind; label: string; icon: string; desc: string }[] = [
  { id: 'citta', label: 'Città medievale', icon: '🏙️', desc: 'Piazza, strade ad anello, case affacciate e mura con portoni' },
  { id: 'villaggio', label: 'Villaggio', icon: '🏡', desc: 'Piccole case sparse tra campi, alberi e uno stagno' },
  { id: 'fortezza', label: 'Fortezza', icon: '🏰', desc: 'Mura quadrate, torri d\u2019angolo e mastio centrale' },
  { id: 'paesaggio', label: 'Paesaggio', icon: '⛰️', desc: 'Colline, laghi e boschi: natura libera da popolare' },
]

class Builder {
  objects: Omit<WorldObject, 'id'>[] = []
  occupied = new Set<string>()
  stats = { case: 0, alberi: 0, strade: 0, mura: 0 }
  rand: () => number

  constructor(seed: number) {
    this.rand = mulberry32(seed * 7919 + 13)
  }

  key(x: number, z: number) {
    return `${x},${z}`
  }

  free(x: number, z: number) {
    return !this.occupied.has(this.key(x, z))
  }

  put(
    asset: string,
    x: number,
    z: number,
    opts: { rot?: number; color?: number } = {}
  ) {
    if (Math.abs(x) > T_GRID_HALF - 1 || Math.abs(z) > T_GRID_HALF - 1) return
    if (!this.free(x, z)) return
    this.occupied.add(this.key(x, z))
    this.objects.push({
      asset,
      x,
      z,
      rot: opts.rot ?? 0,
      color: opts.color ?? Math.floor(this.rand() * 12),
    })
    if (asset === 'strada') this.stats.strade++
    else if (asset === 'muroAlto' || asset === 'muro') this.stats.mura++
    else if (asset === 'albero' || asset === 'pino' || asset === 'cespuglio') this.stats.alberi++
    else if (asset === 'casa' || asset === 'casatorre' || asset === 'torre') this.stats.case++
  }

  maybeTree(x: number, z: number, prob = 0.5) {
    if (this.free(x, z) && this.rand() < prob) {
      this.put(this.rand() < 0.5 ? 'albero' : 'pino', x, z)
    }
  }
}

// ---------------- generatore CITTÀ ----------------
function genCity(o: GenOptions): GenResult {
  const b = new Builder(o.seed)
  const R = SIZE_RADIUS[o.size]
  const dens = 0.35 + o.density * 0.55

  // piazza centrale (lastricata) + fontana di roccia
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      b.put('strada', dx, dz)
    }
  }
  b.occupied.delete('0,0')
  b.objects = b.objects.filter(ob => !(ob.x === 0 && ob.z === 0))
  b.put('roccia', 0, 0)
  b.put('lampioncino', 2, -2)
  b.put('lampioncino', -2, 2)

  // strade: croce principale + anello intermedio
  for (let i = -R; i <= R; i++) {
    if (Math.abs(i) > 2) {
      b.put('strada', i, 0)
      b.put('strada', 0, i)
    }
  }
  const ring = Math.round(R * 0.55)
  for (let a = 0; a < 360; a += 3) {
    const x = Math.round(Math.cos((a * Math.PI) / 180) * ring)
    const z = Math.round(Math.sin((a * Math.PI) / 180) * ring)
    b.put('strada', x, z)
    b.put('strada', -x, -z)
  }
  // lampioni sugli incroci principali
  b.put('lampioncino', ring + 1, 1)
  b.put('lampioncino', -ring - 1, -1)

  // lotti di case lungo le strade (affacciate)
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      if (!b.free(x, z)) continue
      const nearRoad =
        b.occupied.has(b.key(x, z + 1)) === false && false // placeholder
      void nearRoad
      const adjacentRoad =
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dz]) => {
          const ob = b.objects.find(q => q.x === x + dx && q.z === z + dz && q.asset === 'strada')
          return !!ob
        })
      if (!adjacentRoad) {
        // interno: giardino con alberi
        b.maybeTree(x, z, 0.22)
        continue
      }
      const r = b.rand()
      if (r > dens) {
        b.maybeTree(x, z, 0.18)
        continue
      }
      // affaccio: rotazione verso la strada adiacente
      let rot = 0
      if (b.objects.some(q => q.x === x && q.z === z + 1 && q.asset === 'strada')) rot = 0
      else if (b.objects.some(q => q.x === x + 1 && q.z === z && q.asset === 'strada')) rot = 1
      else if (b.objects.some(q => q.x === x && q.z === z - 1 && q.asset === 'strada')) rot = 2
      else rot = 3
      const pick = b.rand()
      if (pick < 0.62) b.put('casa', x, z, { rot })
      else if (pick < 0.85) b.put('casatorre', x, z, { rot })
      else if (pick < 0.93) b.put('torre', x, z, { rot })
      else b.put('portone', x, z, { rot })
    }
  }

  // mura di cinta con portoni (città medie e grandi)
  if (o.size === 'l' || o.size === 'xl') {
    const W = R + 3
    for (let i = -W; i <= W; i++) {
      b.put('muroAlto', i, W)
      b.put('muroAlto', i, -W)
      b.put('muroAlto', W, i)
      b.put('muroAlto', -W, i)
    }
    // portoni (varchi) ai 4 punti cardinali
    for (const [px, pz] of [
      [0, W],
      [0, -W],
      [W, 0],
      [-W, 0],
    ]) {
      b.occupied.delete(b.key(px, pz))
      b.objects = b.objects.filter(q => !(q.x === px && q.z === pz))
      b.put('portone', px, pz)
      b.put('torre', px + 1, pz + (pz === 0 ? 0 : 1))
      b.put('torre', px - 1, pz - (pz === 0 ? 0 : 1))
    }
  }

  // verde esterno + colline sugli angoli
  const terrain = newTerrain()
  for (let a = 0; a < 360; a += 7) {
    const rr = R + 5
    const x = Math.round(Math.cos((a * Math.PI) / 180) * rr)
    const z = Math.round(Math.sin((a * Math.PI) / 180) * rr)
    b.maybeTree(x, z, 0.35)
  }
  if (o.size === 'xl' || o.size === 'l') {
    terrainBump(terrain, -T_GRID_HALF + 8, -T_GRID_HALF + 8, 9, 2.6)
    terrainBump(terrain, T_GRID_HALF - 8, T_GRID_HALF - 8, 8, 2.1)
    terrainBump(terrain, T_GRID_HALF - 7, -T_GRID_HALF + 7, 7, 1.6)
    b.put('collina', -T_GRID_HALF + 8, -T_GRID_HALF + 8)
    b.put('collinaAlta', T_GRID_HALF - 8, T_GRID_HALF - 8)
  }

  return { objects: b.objects, terrain, stats: b.stats }
}

// ---------------- generatore VILLAGGIO ----------------
function genVillage(o: GenOptions): GenResult {
  const b = new Builder(o.seed)
  const R = Math.max(6, SIZE_RADIUS[o.size] - 4)
  const dens = 0.25 + o.density * 0.4

  // piazza piccola con pozzo
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) b.put('strada', dx, dz)
  b.occupied.delete('0,0')
  b.objects = b.objects.filter(ob => !(ob.x === 0 && ob.z === 0))
  b.put('roccia', 0, 0)

  // stradine a stella (3 raggi)
  for (const dir of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    for (let i = 2; i <= R; i++) {
      b.put('strada', dir[0] * i, dir[1] * i)
      if (i % 4 === 0 && dir[1] === 0) b.put('strada', dir[0] * i, 1)
      if (i % 4 === 0 && dir[0] === 0) b.put('strada', 1, dir[1] * i)
    }
  }

  // case a nucleo attorno alla piazza con probabilità decrescente
  for (let z = -R; z <= R; z++) {
    for (let x = -R; x <= R; x++) {
      if (!b.free(x, z)) continue
      const dist = Math.sqrt(x * x + z * z)
      const p = Math.max(0, dens * (1 - dist / (R + 2)))
      if (b.rand() < p) {
        const pick = b.rand()
        const rot = Math.floor(b.rand() * 4)
        if (pick < 0.8) b.put('casa', x, z, { rot })
        else b.put('casatorre', x, z, { rot })
      } else {
        b.maybeTree(x, z, 0.3)
      }
    }
  }

  // stagno scavato con anfiteatro di cespugli
  const terrain = newTerrain()
  const pondX = Math.round(R * 0.8)
  const pondZ = Math.round(-R * 0.8)
  terrainDip(terrain, pondX, pondZ, 6.5, 1.4)
  for (let a = 0; a < 360; a += 24) {
    const x = Math.round(pondX + Math.cos((a * Math.PI) / 180) * 8)
    const z = Math.round(pondZ + Math.sin((a * Math.PI) / 180) * 8)
    if (b.free(x, z)) b.put('cespuglio', x, z)
  }
  b.put('lampioncino', 3, 3)
  b.put('lampioncino', -3, -3)

  return { objects: b.objects, terrain, stats: b.stats }
}

// ---------------- generatore FORTEZZA ----------------
function genFortress(o: GenOptions): GenResult {
  const b = new Builder(o.seed)
  const W = Math.max(6, Math.round(SIZE_RADIUS[o.size] * 0.75))
  const dens = 0.4 + o.density * 0.5

  // cortile interno lastricato
  for (let z = -W + 2; z <= W - 2; z++)
    for (let x = -W + 2; x <= W - 2; x++) b.put('strada', x, z)

  // mastio: torre grande al centro + roccie
  b.occupied.delete('0,0')
  b.objects = b.objects.filter(ob => !(ob.x === 0 && ob.z === 0))
  b.put('torre', 0, 0)
  b.put('roccia', 2, 2)
  b.put('roccia', -2, -2)
  b.put('lampioncino', 2, -2)

  // mura perimetrali
  for (let i = -W; i <= W; i++) {
    b.put('muroAlto', i, W)
    b.put('muroAlto', i, -W)
    b.put('muroAlto', W, i)
    b.put('muroAlto', -W, i)
  }
  // torri d'angolo + varchi
  for (const [sx, sz] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    b.put('torre', sx * W, sz * W)
    b.put('torre', sx * (W - 1), sz * W)
    b.put('torre', sx * W, sz * (W - 1))
  }
  for (const [px, pz] of [
    [0, W],
    [0, -W],
    [W, 0],
    [-W, 0],
  ]) {
    b.occupied.delete(b.key(px, pz))
    b.objects = b.objects.filter(q => !(q.x === px && q.z === pz))
    b.put('portone', px, pz)
  }

  // cortile: caserme e servizi
  for (let z = -W + 3; z <= W - 3; z++) {
    for (let x = -W + 3; x <= W - 3; x++) {
      if (!b.free(x, z)) continue
      const edge =
        Math.abs(x) === W - 3 || Math.abs(z) === W - 3 ||
        Math.abs(x) === W - 2 || Math.abs(z) === W - 2
      if (edge && b.rand() < dens) {
        const rot = Math.abs(x) > Math.abs(z) ? (x > 0 ? 1 : 3) : z > 0 ? 0 : 2
        b.put(b.rand() < 0.7 ? 'casa' : 'casatorre', x, z, { rot })
      } else if (!edge) {
        b.maybeTree(x, z, 0.12)
      }
    }
  }

  // terreno: altopiano roccioso — la fortezza sorge su un rilievo
  const terrain = newTerrain()
  terrainBump(terrain, 0, 0, W * 1.7, 1.5)
  // spalto di terra davanti ai portoni
  for (const [px, pz] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ]) {
    terrainBump(terrain, px * (W + 3), pz * (W + 3), 5, 0.8)
  }
  // boschetto fuori
  for (let i = 0; i < 40; i++) {
    const a = b.rand() * Math.PI * 2
    const rr = W + 4 + b.rand() * 6
    b.maybeTree(Math.round(Math.cos(a) * rr), Math.round(Math.sin(a) * rr), 0.8)
  }

  return { objects: b.objects, terrain, stats: b.stats }
}

// ---------------- generatore PAESAGGIO ----------------
function genLandscape(o: GenOptions): GenResult {
  const b = new Builder(o.seed)
  const R = SIZE_RADIUS[o.size]
  const terrain = newTerrain()

  // catena di colline perimetriche + valle centrale
  for (let i = 0; i < 7 + o.density * 10; i++) {
    const a = (i / (7 + o.density * 10)) * Math.PI * 2 + b.rand() * 0.4
    const rr = R + 3 + b.rand() * (T_GRID_HALF - R - 4)
    const h = 1.2 + b.rand() * 3.4
    const cx = Math.round(Math.cos(a) * rr)
    const cz = Math.round(Math.sin(a) * rr)
    terrainBump(terrain, cx, cz, 4 + b.rand() * 6, h)
    if (h > 2.8 && b.free(cx, cz)) b.put('collinaAlta', cx, cz)
    else if (h > 1.8 && b.free(cx, cz)) b.put('collina', cx, cz)
  }

  // lago con isoletta
  const lakeX = Math.round((b.rand() - 0.5) * R)
  const lakeZ = Math.round((b.rand() - 0.5) * R)
  terrainDip(terrain, lakeX, lakeZ, 5.5 + b.rand() * 4, 1.6)

  // bosco diffuso
  const treeCount = Math.round(60 + o.density * 260 * (R / 24))
  for (let i = 0; i < treeCount; i++) {
    const x = Math.round((b.rand() * 2 - 1) * R)
    const z = Math.round((b.rand() * 2 - 1) * R)
    b.maybeTree(x, z, 0.9)
  }
  // radura con panchina-fossile (rocce) e campo fiorito
  for (let i = 0; i < 8; i++) {
    const a = b.rand() * Math.PI * 2
    b.put('roccia', Math.round(Math.cos(a) * 3), Math.round(Math.sin(a) * 3))
  }
  // sentiero verso il lago
  const steps = Math.max(Math.abs(lakeX), Math.abs(lakeZ)) + 4
  for (let i = 3; i < steps; i++) {
    const t = i / steps
    b.put('strada', Math.round(lakeX * t), Math.round(lakeZ * t))
  }

  return { objects: b.objects, terrain, stats: b.stats }
}

export function generateWorld(o: GenOptions): GenResult {
  switch (o.kind) {
    case 'citta':
      return genCity(o)
    case 'villaggio':
      return genVillage(o)
    case 'fortezza':
      return genFortress(o)
    default:
      return genLandscape(o)
  }
}

export function suggestedName(o: GenOptions): string {
  const prefix = KIND_LABEL[o.kind]
  return `${prefix} #${o.seed}`
}

// ============================================================
// Analisi immagine (per Darpx.ai immagine → mondo)
// ============================================================

export type ImageAnalysis = {
  seed: number
  brightness: number // 0..1
  saturation: number // 0..1
  skyTop: [number, number, number] // rgb dominante metà alta
  groundBottom: [number, number, number] // rgb dominante metà bassa
  blueness: number // 0..1 quanto blu è dominante (acqua/cielo)
  greenness: number
  earthiness: number // marroni/terra
  style: 'cartoon' | 'medievale'
  waterHeavy: boolean
  mountainous: boolean
  foresty: boolean
  label: string
}

/** analizza un'immagine (dataUrl) su canvas ridotto */
export function analyzeImage(dataUrl: string): Promise<ImageAnalysis> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const N = 48
      const c = document.createElement('canvas')
      c.width = N
      c.height = N
      const ctx = c.getContext('2d')
      if (!ctx) return reject(new Error('canvas non disponibile'))
      ctx.drawImage(img, 0, 0, N, N)
      const d = ctx.getImageData(0, 0, N, N).data
      let seed = 2166136261
      let sumL = 0
      let sumSat = 0
      let blue = 0
      let green = 0
      let earth = 0
      const top = [0, 0, 0]
      const bot = [0, 0, 0]
      let n = 0
      for (let y = 0; y < N; y++) {
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4
          const r = d[i] / 255
          const g = d[i + 1] / 255
          const b = d[i + 2] / 255
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
          const mx = Math.max(r, g, b)
          const mn = Math.min(r, g, b)
          sumL += l
          sumSat += mx > 0 ? (mx - mn) / mx : 0
          if (b > r + 0.08 && b > g + 0.04) blue++
          else if (g > r + 0.05 && g > b + 0.05) green++
          else if (r > b + 0.1 && g > b + 0.05 && l < 0.62) earth++
          if (y < N / 2) {
            top[0] += r
            top[1] += g
            top[2] += b
          } else {
            bot[0] += r
            bot[1] += g
            bot[2] += b
          }
          // hash fnv per il seed
          seed ^= d[i] + d[i + 1] * 3 + d[i + 2] * 7
          seed = Math.imul(seed, 16777619) >>> 0
          n++
        }
      }
      const total = N * N
      const skyTop: [number, number, number] = [
        top[0] / (total / 2),
        top[1] / (total / 2),
        top[2] / (total / 2),
      ]
      const groundBottom: [number, number, number] = [
        bot[0] / (total / 2),
        bot[1] / (total / 2),
        bot[2] / (total / 2),
      ]
      const brightness = sumL / total
      const saturation = sumSat / total
      const blueness = blue / total
      const greenness = green / total
      const earthiness = earth / total
      const waterHeavy = blueness > 0.3
      const mountainous = earthiness > 0.22 || brightness < 0.35
      const foresty = greenness > 0.34
      const style: 'cartoon' | 'medievale' =
        saturation > 0.32 && !mountainous ? 'cartoon' : 'medievale'
      const label = waterHeavy
        ? 'acqua dominante'
        : mountainous
          ? 'montuoso'
          : foresty
            ? 'boschivo'
            : 'aperto'
      resolve({
        seed: seed % 100000,
        brightness,
        saturation,
        skyTop,
        groundBottom,
        blueness,
        greenness,
        earthiness,
        style,
        waterHeavy,
        mountainous,
        foresty,
        label,
      })
    }
    img.onerror = () => reject(new Error('Immagine non leggibile'))
    img.src = dataUrl
  })
}

/** genera un mondo a partire dall'analisi dell'immagine */
export function generateWorldFromImage(a: ImageAnalysis, density: number): GenResult {
  const kind: GenKind = a.waterHeavy ? 'paesaggio' : a.mountainous ? 'paesaggio' : 'citta'
  const res = generateWorld({
    kind,
    size: a.mountainous || a.waterHeavy ? 'l' : 'm',
    density,
    seed: a.seed,
  })
  const terrain = res.terrain ?? newTerrain()
  const b = new Builder(a.seed)

  // acqua: se l'immagine è dominata dal blu → grande lago centrale
  if (a.waterHeavy) {
    terrainDip(terrain, 0, 4, 10, 1.8)
    terrainDip(terrain, -6, -8, 6, 1.2)
    res.objects = res.objects.filter(o2 => {
      const d = Math.sqrt(o2.x * o2.x + (o2.z - 4) * (o2.z - 4))
      return d > 10
    })
  }
  // montagne: bordi rialzati + rocce
  if (a.mountainous) {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      terrainBump(terrain, Math.cos(ang) * 26, Math.sin(ang) * 26, 8, 2.4 + (i % 3) * 1.4)
      const rx = Math.round(Math.cos(ang) * 26)
      const rz = Math.round(Math.sin(ang) * 26)
      res.objects.push({ asset: i % 2 ? 'collinaAlta' : 'collina', x: rx, z: rz, rot: 0, color: 10 })
    }
  }
  // bosco fitto
  if (a.foresty) {
    for (let i = 0; i < 90; i++) {
      const x = Math.round((b.rand() * 2 - 1) * 20)
      const z = Math.round((b.rand() * 2 - 1) * 20)
      const dup = res.objects.some(q => q.x === x && q.z === z)
      if (!dup) res.objects.push({ asset: b.rand() < 0.6 ? 'albero' : 'pino', x, z, rot: 0, color: 0 })
    }
  }
  // notturno/scuro: lampioni in più
  if (a.brightness < 0.42) {
    for (let i = 0; i < 10; i++) {
      const x = Math.round((b.rand() * 2 - 1) * 14)
      const z = Math.round((b.rand() * 2 - 1) * 14)
      const dup = res.objects.some(q => q.x === x && q.z === z)
      if (!dup) res.objects.push({ asset: 'lampioncino', x, z, rot: 0, color: 11 })
    }
  }
  return { ...res, terrain }
}
