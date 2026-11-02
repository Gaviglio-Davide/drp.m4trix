// ============================================================
// WORLD FORGE — generatore procedurale di mappe del mondo,
// ispirato a Watabou's Procgen Arcana: biomi, fiumi, città con
// isolati ed edifici, villaggi, strade, dungeon e caverne.
// Tutto modificabile e esportabile verso il Game Studio.
// ============================================================

// ---------- RNG deterministico ----------

export function rngFrom(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- biomi ----------

export const B = {
  DEEP: 0,
  WATER: 1,
  SAND: 2,
  GRASS: 3,
  FOREST: 4,
  HILL: 5,
  MOUNTAIN: 6,
  SNOW: 7,
  ROAD: 8,
} as const

export type WorldParams = {
  seed: number
  w: number
  h: number
  sea: number // 0..1 livello del mare
  forest: number // 0..1 densità boschi
  cities: number
  villages: number
  dungeons: number
  caves: number
}

export type Building = { x: number; y: number; w: number; h: number }
export type CityMap = {
  size: number
  buildings: Building[]
  wall: { x: number; y: number; w: number; h: number } | null
  plaza: Building
  river: boolean
  extent: number // raggio in unità
}
export type Settlement = {
  id: string
  kind: 'city' | 'village'
  x: number
  y: number
  name: string
  seed: number
  size: 1 | 2 | 3
  map: CityMap
}
export type Site = {
  id: string
  kind: 'dungeon' | 'cave'
  x: number
  y: number
  name: string
  seed: number
  w: number
  h: number
  grid: number[] // 0 vuoto, 1 muro, 2 pavimento, 3 acqua
}
export type World = {
  params: WorldParams
  biome: number[]
  settlements: Settlement[]
  sites: Site[]
  roads: { x: number; y: number }[]
}

// ---------- rumore ----------

function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t)
}

function valueNoise(seed: number, x: number, y: number): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const a = hash2(seed, xi, yi)
  const b = hash2(seed, xi + 1, yi)
  const c = hash2(seed, xi, yi + 1)
  const d = hash2(seed, xi + 1, yi + 1)
  const u = smooth(xf)
  const v = smooth(yf)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

function fbm(seed: number, x: number, y: number, oct = 4): number {
  let v = 0
  let amp = 0.55
  let f = 1
  for (let i = 0; i < oct; i++) {
    v += valueNoise(seed + i * 101, x * f, y * f) * amp
    f *= 2
    amp *= 0.5
  }
  return Math.min(1, v)
}

// ---------- nomi ----------

const N1 = ['Bal', 'Tor', 'Vil', 'Mor', 'Ka', 'Sar', 'Dun', 'Bel', 'Nor', 'Grim', 'Val', 'Eld', 'Ash', 'Roc', 'Zan', 'Cor', 'Fal', 'Mel', 'Ost', 'Per', 'Quar', 'Sil', 'Tar', 'Ur', 'Ver', 'Wex']
const N2 = ['dor', 'mon', 'val', 'burg', 'grad', 'heim', 'wick', 'ford', 'mere', 'stad', 'polis', 'haven', 'castro', 'lago', 'vento', 'pietra', 'nebbia', 'ferro', 'corvo', 'salce']
const DUN1 = ['Cripta', 'Miniere', 'Forte', 'Tomba', 'Sotterranei', 'Rocca', 'Catacombe']
const CAVE1 = ['Caverne', 'Grotte', 'Abissi', 'Vuoti']

export function makeName(r: () => number): string {
  return N1[Math.floor(r() * N1.length)] + N2[Math.floor(r() * N2.length)]
}
function siteName(r: () => number, kind: 'dungeon' | 'cave'): string {
  const base = kind === 'dungeon' ? DUN1 : CAVE1
  return `${base[Math.floor(r() * base.length)]} di ${makeName(r)}`
}
const rid = () => Math.random().toString(36).slice(2, 9)

// ---------- generazione del mondo ----------

export function generateWorld(p: WorldParams): World {
  const r = rngFrom(p.seed)
  const { w, h } = p
  const biome = new Array(w * h).fill(B.GRASS)
  const heights = new Array(w * h)

  // continente: fbm + falloff ai bordi
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = x / w - 0.5
      const ny = y / h - 0.5
      const d = Math.min(1, Math.hypot(nx * 2.2, ny * 2.2))
      const base = fbm(p.seed, x / 22, y / 22, 5)
      heights[y * w + x] = Math.max(0, base - Math.pow(d, 2.4) * 0.9)
    }
  }

  const sea = 0.24 + p.sea * 0.24
  const hillT = sea + 0.24
  const mountT = sea + 0.34
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hv = heights[y * w + x]
      let b: number
      if (hv < sea - 0.07) b = B.DEEP
      else if (hv < sea) b = B.WATER
      else if (hv < sea + 0.03) b = B.SAND
      else if (hv > mountT + 0.12) b = B.SNOW
      else if (hv > mountT) b = B.MOUNTAIN
      else if (hv > hillT) b = B.HILL
      else {
        const f = fbm(p.seed + 777, x / 9, y / 9, 3)
        b = f > 0.62 - p.forest * 0.25 ? B.FOREST : B.GRASS
      }
      biome[y * w + x] = b
    }
  }

  // fiumi: sorgenti in montagna, cammino verso il mare
  const rivers = 2 + Math.floor(r() * 3)
  for (let i = 0; i < rivers; i++) {
    let x = 0
    let y = 0
    for (let tries = 0; tries < 60; tries++) {
      const tx = Math.floor(r() * w)
      const ty = Math.floor(r() * h)
      if (biome[ty * w + tx] === B.MOUNTAIN) {
        x = tx
        y = ty
        break
      }
    }
    if (!x && !y) continue
    for (let step = 0; step < w * 2; step++) {
      const cur = biome[y * w + x]
      if (cur === B.WATER || cur === B.DEEP) break
      if (cur !== B.MOUNTAIN && cur !== B.SNOW) biome[y * w + x] = B.WATER
      // esce verso il vicino più basso (con randomness)
      const opts: [number, number, number][] = []
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx2 = x + dx
        const ny2 = y + dy
        if (nx2 < 1 || ny2 < 1 || nx2 >= w - 1 || ny2 >= h - 1) continue
        opts.push([nx2, ny2, heights[ny2 * w + nx2] + r() * 0.02])
      }
      if (!opts.length) break
      opts.sort((a2, b2) => a2[2] - b2[2])
      const pickI = r() < 0.75 ? 0 : Math.floor(r() * opts.length)
      x = opts[pickI][0]
      y = opts[pickI][1]
    }
  }

  const world: World = { params: p, biome, settlements: [], sites: [], roads: [] }

  // ---- insediamenti ----
  const landCells: { x: number; y: number; s: number }[] = []
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++) {
      if (biome[y * w + x] !== B.GRASS && biome[y * w + x] !== B.FOREST) continue
      // bonus se vicino ad acqua (commercio!)
      let nearWater = false
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 0], [-3, 0], [0, 3], [0, -3]]) {
        const nx2 = x + dx
        const ny2 = y + dy
        if (nx2 < 0 || ny2 < 0 || nx2 >= w || ny2 >= h) continue
        const bb = biome[ny2 * w + nx2]
        if (bb === B.WATER || bb === B.DEEP) nearWater = true
      }
      landCells.push({ x, y, s: (nearWater ? 0.7 : 0) + r() * 0.5 })
    }
  landCells.sort((a2, b2) => b2.s - a2.s)

  const place = (kind: 'city' | 'village', minDist: number): Settlement | null => {
    for (const c of landCells) {
      if (world.settlements.some(s => Math.hypot(s.x - c.x, s.y - c.y) < minDist)) continue
      if (world.roads.some(rc => Math.hypot(rc.x - c.x, rc.y - c.y) < 2)) continue
      const seed = Math.floor(r() * 1e9)
      const size: 1 | 2 | 3 = kind === 'city' ? ((r() < 0.3 ? 3 : r() < 0.6 ? 2 : 1) as 1 | 2 | 3) : 1
      return {
        id: rid(),
        kind,
        x: c.x,
        y: c.y,
        name: makeName(r),
        seed,
        size,
        map: generateCity(seed, kind === 'city' ? size : 1, kind === 'village'),
      }
    }
    return null
  }
  for (let i = 0; i < p.cities; i++) {
    const s = place('city', 12)
    if (s) world.settlements.push(s)
  }
  for (let i = 0; i < p.villages; i++) {
    const s = place('village', 7)
    if (s) world.settlements.push(s)
  }

  // ---- strade: ogni insediamento verso il più vicino già collegato ----
  const connected: Settlement[] = []
  const sorted = [...world.settlements].sort((a2, b2) => (b2.kind === 'city' ? 1 : 0) - (a2.kind === 'city' ? 1 : 0))
  for (const s of sorted) {
    if (!connected.length) {
      connected.push(s)
      continue
    }
    let best = connected[0]
    let bd = Infinity
    for (const c of connected) {
      const d = Math.hypot(c.x - s.x, c.y - s.y)
      if (d < bd) {
        bd = d
        best = c
      }
    }
    carveRoad(world, best, s)
    connected.push(s)
  }

  // ---- dungeon e caverne ----
  const sitePlace = (kind: 'dungeon' | 'cave', minDist: number): Site | null => {
    for (let tries = 0; tries < 300; tries++) {
      const x = 2 + Math.floor(r() * (w - 4))
      const y = 2 + Math.floor(r() * (h - 4))
      const b = biome[y * w + x]
      // dopo 200 tentativi accetta qualsiasi terra ferma: garantisce
      // quasi sempre il numero di dungeon/caverne richiesto
      const ok =
        tries > 200
          ? b !== B.WATER && b !== B.DEEP && b !== B.ROAD
          : kind === 'dungeon'
            ? b === B.MOUNTAIN || b === B.HILL || b === B.SNOW
            : b === B.FOREST || b === B.HILL
      if (!ok) continue
      if (world.settlements.some(s => Math.hypot(s.x - x, s.y - y) < minDist)) continue
      if (world.sites.some(s => Math.hypot(s.x - x, s.y - y) < 6)) continue
      const seed = Math.floor(r() * 1e9)
      const dw = kind === 'dungeon' ? 34 : 30
      const dh = kind === 'dungeon' ? 24 : 22
      return {
        id: rid(),
        kind,
        x,
        y,
        name: siteName(r, kind),
        seed,
        w: dw,
        h: dh,
        grid: kind === 'dungeon' ? generateDungeon(seed, dw, dh) : generateCave(seed, dw, dh),
      }
    }
    return null
  }
  for (let i = 0; i < p.dungeons; i++) {
    const s = sitePlace('dungeon', 6)
    if (s) world.sites.push(s)
  }
  for (let i = 0; i < p.caves; i++) {
    const s = sitePlace('cave', 6)
    if (s) world.sites.push(s)
  }

  return world
}

function carveRoad(world: World, a: Settlement, b: Settlement) {
  const { w, h } = world.params
  let x = a.x
  let y = a.y
  const r = rngFrom(a.seed ^ b.seed)
  for (let step = 0; step < w * h; step++) {
    if (x === b.x && y === b.y) break
    const b0 = world.biome[y * w + x]
    if (b0 === B.GRASS || b0 === B.FOREST || b0 === B.SAND || b0 === B.HILL) world.biome[y * w + x] = B.ROAD
    world.roads.push({ x, y })
    // passo leggermente random (strade che serpeggiano)
    if (r() < 0.8) {
      if (Math.abs(b.x - x) > Math.abs(b.y - y)) x += Math.sign(b.x - x)
      else y += Math.sign(b.y - y)
    } else {
      if (Math.abs(b.x - x) > Math.abs(b.y - y)) y += Math.sign(b.y - y)
      else x += Math.sign(b.x - x)
    }
  }
}

/** rigenera il layout di un insediamento (stesso posto) */
export function rerollSettlement(s: Settlement, size: 1 | 2 | 3): Settlement {
  const seed = Math.floor(Math.random() * 1e9)
  return { ...s, seed, size, map: generateCity(seed, size, s.kind === 'village') }
}

// ---------- generatore città stile Watabou ----------

export function generateCity(seed: number, size: 1 | 2 | 3, village = false): CityMap {
  const r = rngFrom(seed)
  const extent = village ? 16 + size * 4 : 20 + size * 9
  const buildings: Building[] = []
  const plaza: Building = { x: -extent / 5, y: -extent / 5, w: extent / 2.5, h: extent / 2.5 }

  // split ricorsivo dell'area in isolati, poi edifici dentro gli isolati
  const splitArea = (x: number, y: number, w0: number, h0: number, depth: number) => {
    if (depth <= 0 || (w0 < 9 && h0 < 9)) {
      fillBlock(x, y, w0, h0)
      return
    }
    const horiz = w0 > h0 ? true : w0 < h0 ? false : r() < 0.5
    const jitter = 0.35 + r() * 0.3
    if (horiz) {
      const cut = Math.floor(w0 * jitter)
      splitArea(x, y, cut - 1, h0, depth - 1)
      splitArea(x + cut + 1, y, w0 - cut - 1, h0, depth - 1)
    } else {
      const cut = Math.floor(h0 * jitter)
      splitArea(x, y, w0, cut - 1, depth - 1)
      splitArea(x, y + cut + 1, w0, h0 - cut - 1, depth - 1)
    }
  }

  const fillBlock = (x: number, y: number, w0: number, h0: number) => {
    if (w0 < 3 || h0 < 3) return
    // parchi e cortili occasionali
    if (r() < 0.12) return
    const cols = Math.max(1, Math.floor(w0 / 5))
    const rows = Math.max(1, Math.floor(h0 / 5))
    const cw = w0 / cols
    const ch = h0 / rows
    for (let cy = 0; cy < rows; cy++)
      for (let cx = 0; cx < cols; cx++) {
        if (r() < 0.1) continue
        const m = 0.5
        const bx = x + cx * cw + m
        const by = y + cy * ch + m
        const bw = cw - m * 1.2
        const bh = ch - m * 1.2
        if (bw >= 1 && bh >= 1) buildings.push({ x: bx, y: by, w: bw, h: bh })
      }
  }

  if (village) {
    // villaggio: case sparse attorno alla piazza
    const n = 8 + Math.floor(r() * 6)
    for (let i = 0; i < n; i++) {
      const a = r() * Math.PI * 2
      const d = 4 + r() * extent * 0.75
      const bw = 2.5 + r() * 2
      const bh = 2 + r() * 1.6
      buildings.push({ x: Math.cos(a) * d - bw / 2, y: Math.sin(a) * d * 0.85 - bh / 2, w: bw, h: bh })
    }
    return {
      size,
      buildings,
      wall: null,
      plaza: { x: -2.5, y: -2.5, w: 5, h: 5 },
      river: r() < 0.3,
      extent,
    }
  }

  splitArea(-extent, -extent * 0.82, extent * 2, extent * 1.64, 4 + size)

  // mura: rettangolo arrotondato intorno al built-up
  const wallPad = 2.5
  const wall = {
    x: -extent - wallPad,
    y: -extent * 0.82 - wallPad,
    w: extent * 2 + wallPad * 2,
    h: extent * 1.64 + wallPad * 2,
  }
  void plaza
  return {
    size,
    buildings,
    wall,
    plaza: { x: -3.5, y: -3, w: 7, h: 6 },
    river: r() < 0.45,
    extent: extent + wallPad,
  }
}

// ---------- dungeon (stanze + corridoi) ----------

export function generateDungeon(seed: number, w: number, h: number): number[] {
  const r = rngFrom(seed)
  const g = new Array(w * h).fill(1)
  const rooms: { x: number; y: number; w: number; h: number }[] = []
  const target = Math.max(5, Math.floor((w * h) / 90))

  const split = (x: number, y: number, rw: number, rh: number, depth: number) => {
    if (depth <= 0 || rooms.length >= target || (rw < 12 && rh < 10)) {
      if (rw >= 6 && rh >= 5) rooms.push({ x, y, w: rw, h: rh })
      return
    }
    const horiz = rw > rh ? true : rw < rh ? false : r() < 0.5
    if (horiz && rw >= 14) {
      const cut = 6 + Math.floor(r() * (rw - 12))
      split(x, y, cut, rh, depth - 1)
      split(x + cut, y, rw - cut, rh, depth - 1)
    } else if (!horiz && rh >= 12) {
      const cut = 5 + Math.floor(r() * (rh - 10))
      split(x, y, rw, cut, depth - 1)
      split(x, y + cut, rw, rh - cut, depth - 1)
    } else {
      if (rw >= 6 && rh >= 5) rooms.push({ x, y, w: rw, h: rh })
    }
  }
  split(1, 1, w - 2, h - 2, 4)

  const centers: { x: number; y: number }[] = []
  for (const room of rooms) {
    const rw = Math.max(3, room.w - 3 - Math.floor(r() * 2))
    const rh = Math.max(3, room.h - 3 - Math.floor(r() * 2))
    const rx = room.x + 1 + Math.floor(r() * Math.max(1, room.w - rw - 1))
    const ry = room.y + 1 + Math.floor(r() * Math.max(1, room.h - rh - 1))
    for (let yy = ry; yy < ry + rh && yy < h - 1; yy++)
      for (let xx = rx; xx < rx + rw && xx < w - 1; xx++) g[yy * w + xx] = 2
    centers.push({ x: rx + Math.floor(rw / 2), y: ry + Math.floor(rh / 2) })
  }
  for (let i = 1; i < centers.length; i++) {
    const a = centers[i - 1]
    const b = centers[i]
    if (r() < 0.5) {
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) g[a.y * w + x] = 2
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) g[y * w + b.x] = 2
    } else {
      for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) g[y * w + a.x] = 2
      for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) g[b.y * w + x] = 2
    }
  }
  // laghetto occasionale
  if (r() < 0.4 && rooms.length) {
    const room = rooms[Math.floor(r() * rooms.length)]
    const cx = room.x + Math.floor(room.w / 2)
    const cy = room.y + Math.floor(room.h / 2)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const xx = cx + dx
        const yy = cy + dy
        if (xx > 0 && yy > 0 && xx < w - 1 && yy < h - 1 && g[yy * w + xx] === 2)
          g[yy * w + xx] = 3
      }
  }
  return g
}

// ---------- caverne (automi cellulari) ----------

export function generateCave(seed: number, w: number, h: number): number[] {
  const r = rngFrom(seed)
  let g: number[] = new Array(w * h).fill(0).map(() => (r() < 0.55 ? 1 : 0))
  for (let it = 0; it < 5; it++) {
    const nx = [...g]
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        let n = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if (!(dx === 0 && dy === 0)) n += g[(y + dy) * w + (x + dx)]
        nx[y * w + x] = n >= 5 ? 1 : 0
      }
    g = nx
  }
  // apri un po' di passaggi per garantire esplorabilità
  for (let y = 2; y < h - 2; y++)
    for (let x = 2; x < w - 2; x++)
      if (g[y * w + x] === 0 && r() < 0.04) g[y * w + x] = 2
  return g.map(v => (v === 1 ? 1 : 2))
}
