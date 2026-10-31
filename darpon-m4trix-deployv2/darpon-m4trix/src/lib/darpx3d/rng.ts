// ============================================================
// Darpx3D · rng — generatore pseudo-casuale con seed riproducibile
// Stesso prompt + stesso seed = stesso modello (variante = nuovo seed)
// ============================================================

export type RNG = {
  next: () => number          // [0,1)
  range: (min: number, max: number) => number
  int: (min: number, max: number) => number
  chance: (p: number) => boolean
  pick: <T>(arr: readonly T[]) => T
  weighted: <T>(entries: readonly [T, number][]) => T
  gauss: (mean?: number, dev?: number) => number
  seed: number
}

/** mulberry32: piccolo, veloce, abbastanza buono per la generazione procedurale */
export function makeRng(seed: number): RNG {
  let a = seed >>> 0
  const next = () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const range = (min: number, max: number) => min + next() * (max - min)
  const int = (min: number, max: number) => Math.floor(range(min, max + 1))
  const chance = (p: number) => next() < p
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]
  const weighted = <T,>(entries: readonly [T, number][]): T => {
    const total = entries.reduce((s, e) => s + e[1], 0)
    let r = next() * total
    for (const [v, w] of entries) {
      r -= w
      if (r <= 0) return v
    }
    return entries[entries.length - 1][0]
  }
  // somma di 3 uniformi: abbastanza gaussiano per la varietà organica
  const gauss = (mean = 0, dev = 1) => {
    const s = (next() + next() + next()) / 1.5 - 1
    return mean + s * dev
  }
  return { next, range, int, chance, pick, weighted, gauss, seed }
}

/** hash deterministico di una stringa → seed 32 bit */
export function hashSeed(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) || 1
}

/** seed casuale per la variante */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1
}
