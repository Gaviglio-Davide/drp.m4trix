'use client'

// ============================================================
// Terreno scolpito: heightmap condivisa da editor, generatore
// e modalità Gioca. Griglia 61x61 (una quota per cella),
// quantizzata in byte (passo 0.05m) e salvata in base64 dentro
// lo state del progetto. Completamente opzionale: un mondo
// senza terreno resta piatto, perfettamente retrocompatibile.
// ============================================================

export const T_GRID_HALF = 30 // -30..30 → 61x61 celle
export const T_SIZE = T_GRID_HALF * 2 + 1

// quantizzazione: byte 0..255 → metri -3.20 .. +6.35 (passo 0.05)
const H_STEP = 0.05
const H_MIN = -3.2
const H_ZERO = Math.round(-H_MIN / H_STEP) // 64

export type Terrain = Float32Array // lunghezza T_SIZE*T_SIZE

export function newTerrain(): Terrain {
  return new Float32Array(T_SIZE * T_SIZE)
}

export function idx(ix: number, iz: number): number {
  return (iz + T_GRID_HALF) * T_SIZE + (ix + T_GRID_HALF)
}

/** quota campionata (bilineare, clamp ai bordi) da coordinate mondo */
export function terrainHeightAt(t: Terrain | null, x: number, z: number): number {
  if (!t) return 0
  const fx = Math.max(-T_GRID_HALF, Math.min(T_GRID_HALF, x))
  const fz = Math.max(-T_GRID_HALF, Math.min(T_GRID_HALF, z))
  const x0 = Math.floor(fx)
  const z0 = Math.floor(fz)
  const tx = fx - x0
  const tz = fz - z0
  const h00 = t[idx(x0, z0)]
  const h10 = t[idx(Math.min(x0 + 1, T_GRID_HALF), z0)]
  const h01 = t[idx(x0, Math.min(z0 + 1, T_GRID_HALF))]
  const h11 = t[idx(Math.min(x0 + 1, T_GRID_HALF), Math.min(z0 + 1, T_GRID_HALF))]
  return (
    h00 * (1 - tx) * (1 - tz) +
    h10 * tx * (1 - tz) +
    h01 * (1 - tx) * tz +
    h11 * tx * tz
  )
}

export type BrushMode = 'raise' | 'lower' | 'flatten'

function falloff(dist: number, radius: number): number {
  const r = dist / radius
  if (r >= 1) return 0
  const s = 1 - r * r
  return s * s // smoothstep-like morbido
}

/** applica il pennello: raise (alza), lower (scava), flatten (spiana verso 0) */
export function brushApply(
  t: Terrain,
  cx: number,
  cz: number,
  radius: number,
  flow: number,
  mode: BrushMode
): void {
  const ix = Math.round(cx)
  const iz = Math.round(cz)
  const ri = Math.ceil(radius)
  for (let dz = -ri; dz <= ri; dz++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const x = ix + dx
      const z = iz + dz
      if (Math.abs(x) > T_GRID_HALF || Math.abs(z) > T_GRID_HALF) continue
      const d = Math.sqrt(dx * dx + dz * dz)
      const f = falloff(d, radius)
      if (f <= 0) continue
      const i = idx(x, z)
      const cur = t[i]
      if (mode === 'raise') t[i] = Math.min(8, cur + flow * f)
      else if (mode === 'lower') t[i] = Math.max(-3.2, cur - flow * f)
      else t[i] = cur * (1 - flow * f)
    }
  }
}

/** sollevamento morbido (gauss) usato dal generatore di mondi */
export function terrainBump(
  t: Terrain,
  cx: number,
  cz: number,
  radius: number,
  height: number
): void {
  const ix = Math.round(cx)
  const iz = Math.round(cz)
  const ri = Math.ceil(radius * 1.6)
  for (let dz = -ri; dz <= ri; dz++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const x = ix + dx
      const z = iz + dz
      if (Math.abs(x) > T_GRID_HALF || Math.abs(z) > T_GRID_HALF) continue
      const d = Math.sqrt(dx * dx + dz * dz) / radius
      if (d >= 1.6) continue
      const g = Math.exp(-d * d * 2.2)
      const i = idx(x, z)
      t[i] = Math.min(8, t[i] + height * g)
    }
  }
}

/** scava una conca: usata per laghi e fiumi */
export function terrainDip(
  t: Terrain,
  cx: number,
  cz: number,
  radius: number,
  depth: number
): void {
  terrainBump(t, cx, cz, radius, -depth)
}

// ---------------- base64 encode / decode ----------------

function toBase64(bytes: Uint8Array): string {
  let s = ''
  const CH = 0x8000
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode(...bytes.subarray(i, i + CH))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/** serializza il terreno; ritorna null se piatto (niente da salvare) */
export function encodeTerrain(t: Terrain | null): string | null {
  if (!t) return null
  let maxAbs = 0
  for (let i = 0; i < t.length; i++) {
    const a = Math.abs(t[i])
    if (a > maxAbs) maxAbs = a
  }
  if (maxAbs < H_STEP / 2) return null
  const q = new Uint8Array(t.length)
  for (let i = 0; i < t.length; i++) {
    const v = Math.round((t[i] - H_MIN) / H_STEP)
    q[i] = Math.max(0, Math.min(255, v))
  }
  return toBase64(q)
}

export function decodeTerrain(b64: string): Terrain {
  const q = fromBase64(b64)
  const t = new Float32Array(T_SIZE * T_SIZE)
  const n = Math.min(q.length, t.length)
  for (let i = 0; i < n; i++) t[i] = (q[i] - H_ZERO) * H_STEP
  return t
}
