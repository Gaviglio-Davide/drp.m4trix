// ============================================================
// Darpx3D · detail — dettagli che danno vita ai modelli:
// occhi (con pupilla), corna, squame, spuntoni dorsali, artigli,
// gemme, cuciture. Ogni funzione aggiunge mesh a un Group.
// ============================================================

import * as THREE from 'three'
import type { RNG } from './rng'
import type { MatBag } from './materials'
import { addPart, cone, blob, surfacePoints, place, taperedCyl } from './parts'

/** occhio con sclera + pupilla verticale (rettile) o tonda (mammifero) */
export function eye(
  parent: THREE.Group,
  mats: MatBag,
  pos: THREE.Vector3,
  r: number,
  opts: { slit?: boolean; color?: THREE.ColorRepresentation } = {}
): void {
  const sclera = new THREE.MeshStandardMaterial({
    color: opts.color ?? (opts.slit ? '#e8c93a' : '#f2f0e8'),
    roughness: 0.25,
    emissive: opts.color ?? '#000000',
    emissiveIntensity: 0.06,
  })
  const g = blob(r, r, r * 0.7, 10)
  place(g, { pos: [pos.x, pos.y, pos.z] })
  addPart(parent, g, sclera, 'Occhio')
  const pupilMat = new THREE.MeshStandardMaterial({ color: '#0d0d10', roughness: 0.2 })
  const pr = r * (opts.slit ? 0.34 : 0.42)
  const pg = opts.slit ? blob(pr * 0.45, pr * 1.35, pr * 0.3, 8) : blob(pr, pr, pr * 0.3, 8)
  place(pg, { pos: [pos.x, pos.y, pos.z] })
  // la pupilla è leggermente estrusa verso l'esterno: la chiamante decide il lato
  const dir = new THREE.Vector3(pos.x, pos.y, 0).normalize().multiplyScalar(r * 0.78)
  place(pg, { pos: [dir.x, dir.y, dir.z] })
  addPart(parent, pg, pupilMat, 'Pupilla')
}

/** coppia di occhi su una testa (cerca il davanti = +Z) */
export function eyePair(
  parent: THREE.Group,
  mats: MatBag,
  headCenter: THREE.Vector3,
  headR: number,
  opts: { slit?: boolean; wide?: number; color?: THREE.ColorRepresentation } = {}
): void {
  const wide = opts.wide ?? 0.5
  const r = headR * (opts.slit ? 0.24 : 0.3)
  eye(parent, mats, new THREE.Vector3(headCenter.x - headR * wide, headCenter.y + headR * 0.28, headCenter.z + headR * 0.72), r, opts)
  eye(parent, mats, new THREE.Vector3(headCenter.x + headR * wide, headCenter.y + headR * 0.28, headCenter.z + headR * 0.72), r, opts)
}

/** corna curve (due, simmetriche): tubo sottile piegato all'indietro */
export function hornPair(
  parent: THREE.Group,
  mats: MatBag,
  base: THREE.Vector3,
  len: number,
  opts: { spread?: number; up?: number; back?: number; thick?: number } = {}
): void {
  const spread = opts.spread ?? 0.35
  const up = opts.up ?? 1
  const back = opts.back ?? 0.8
  const thick = opts.thick ?? len * 0.18
  for (const side of [-1, 1]) {
    const p0 = base.clone().add(new THREE.Vector3(side * spread * len * 0.3, 0, 0))
    const p1 = p0.clone().add(new THREE.Vector3(side * spread * len * 0.5, up * len * 0.45, back * len * 0.2))
    const p2 = p1.clone().add(new THREE.Vector3(side * spread * len * 0.35, up * len * 0.3, back * len * 0.5))
    const geo = taperedCyl(thick * 0.55, thick, len * 0.55, 8, 1, false)
    // orienta lungo p0→p2
    orientBetween(geo, p0, p2, len * 0.62)
    addPart(parent, geo, mats.horn, side < 0 ? 'Corna sx' : 'Corna dx')
  }
}

/** orecchie (conidi appiattiti) */
export function earPair(
  parent: THREE.Group,
  mats: MatBag,
  base: THREE.Vector3,
  size: number,
  spread = 0.5
): void {
  for (const side of [-1, 1]) {
    const g = cone(size * 0.45, size, 6)
    place(g, {
      pos: [base.x + side * size * spread, base.y + size * 0.35, -size * 0.15],
      rot: [Math.PI * 0.12, 0, side * -0.7],
      scale: [1, 1, 0.55],
    })
    addPart(parent, g, mats.secondary, side < 0 ? 'Orecchio sx' : 'Orecchio dx')
  }
}

/** cresta di spuntoni lungo la schiena (drago/rettile) */
export function dorsalSpikes(
  parent: THREE.Group,
  mats: MatBag,
  curve: THREE.CatmullRomCurve3,
  count: number,
  size: number,
  opts: { taper?: number; emissive?: boolean } = {}
): void {
  const taper = opts.taper ?? 0.5
  const mat = opts.emissive ? mats.accent : mats.horn
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    // normale "in su" rispetto alla tangente
    const up = new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(tan, up).normalize()
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0)
    const realUp = new THREE.Vector3().crossVectors(side, tan).normalize()
    const s = size * (1 - taper * t)
    const g = cone(s * 0.4, s, 5)
    // orienta il cono (asse Y) lungo realUp
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), realUp)
    const flat = new THREE.Quaternion().setFromAxisAngle(realUp, 0)
    const m = new THREE.Matrix4().compose(
      p.clone().add(realUp.clone().multiplyScalar(s * 0.42)),
      q.multiply(flat),
      new THREE.Vector3(1, 1, 0.45)
    )
    g.applyMatrix4(m)
    addPart(parent, g, mat, `Spuntone ${i + 1}`)
  }
}

/** squame: piccole scaglie emisferiche sparse su una geometria corpo */
export function scales(
  parent: THREE.Group,
  mats: MatBag,
  bodyGeo: THREE.BufferGeometry,
  rng: RNG,
  count: number,
  opts: { size?: number; onlyTop?: boolean; center?: THREE.Vector3 } = {}
): void {
  const size = opts.size ?? 0.06
  const pts = surfacePoints(bodyGeo, count, rng)
  const mat = new THREE.MeshStandardMaterial({
    color: mats.primary.color.clone().multiplyScalar(0.82),
    roughness: 0.5,
    metalness: 0.3,
  })
  const geos: THREE.BufferGeometry[] = []
  for (const p of pts) {
    if (opts.onlyTop && opts.center && p.y < opts.center.y) continue
    const g = blob(size, size * 0.55, size, 6)
    place(g, { pos: [p.x, p.y, p.z] })
    geos.push(g)
  }
  if (!geos.length) return
  // raggruppa in una mesh multi-geometria per non esplodere i draw call
  for (let i = 0; i < geos.length; i += 80) {
    const chunk = geos.slice(i, i + 80)
    const merged = mergeChunk(chunk)
    if (merged) addPart(parent, merged, mat, `Squame ${Math.floor(i / 80) + 1}`)
  }
}

function mergeChunk(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  // piccola utility locale (evita dipendenza circolare con parts.mergeAll)
  const cleaned = geos.map(g => g)
  // usa la stessa logica di parts: riesporta come singolo non-indexed
  const posArr: number[] = []
  const norArr: number[] = []
  for (const g of cleaned) {
    const ng = g.toNonIndexed()
    const p = ng.attributes.position.array as Float32Array
    const n = ng.attributes.normal.array as Float32Array
    for (let i = 0; i < p.length; i++) posArr.push(p[i])
    for (let i = 0; i < n.length; i++) norArr.push(n[i])
  }
  const out = new THREE.BufferGeometry()
  out.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3))
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norArr, 3))
  return out
}

/** artigli/rotelle di piede: 3 unghie coniche per zampa */
export function claws(
  parent: THREE.Group,
  mats: MatBag,
  ankle: THREE.Vector3,
  size: number
): void {
  for (const [dx, dz] of [[-0.4, 0.55], [0, 0.72], [0.4, 0.55]] as const) {
    const g = cone(size * 0.3, size, 5)
    place(g, {
      pos: [ankle.x + dx * size, ankle.y + size * 0.08, ankle.z + dz * size],
      rot: [Math.PI * 0.92, 0, 0],
      scale: [1, 1, 0.6],
    })
    addPart(parent, g, mats.horn, 'Artiglio')
  }
}

/** zoccolo (cavallo/bovino) */
export function hoof(parent: THREE.Group, mats: MatBag, ankle: THREE.Vector3, size: number): void {
  const g = taperedCyl(size * 0.5, size * 0.58, size * 0.75, 8)
  place(g, { pos: [ankle.x, ankle.y - size * 0.32, ankle.z] })
  addPart(parent, g, mats.byId('ferro'), 'Zoccolo')
}

/** gemma incastonata (elsa, petto, bastone) */
export function gem(
  parent: THREE.Group,
  mats: MatBag,
  pos: THREE.Vector3,
  size: number,
  color?: THREE.ColorRepresentation
): void {
  const mat = new THREE.MeshStandardMaterial({
    color: color ?? '#b43a6a',
    roughness: 0.1,
    metalness: 0.2,
    emissive: color ?? '#7a1f4a',
    emissiveIntensity: 0.5,
  })
  const g = new THREE.OctahedronGeometry(size, 0)
  place(g, { pos: [pos.x, pos.y, pos.z], rot: [0, Math.PI * 0.25, 0], scale: [1, 1.5, 1] })
  addPart(parent, g, mat, 'Gemma')
}

/** coda a pennello (cavallo/leone): ciuffo di coni */
export function tailTuft(
  parent: THREE.Group,
  mats: MatBag,
  tip: THREE.Vector3,
  size: number,
  dir: THREE.Vector3
): void {
  const mat = new THREE.MeshStandardMaterial({
    color: mats.secondary.color.clone().multiplyScalar(0.55),
    roughness: 1,
  })
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2
    const g = cone(size * 0.35, size * (1.6 + 0.3 * Math.sin(i * 2.1)), 5)
    const off = new THREE.Vector3(Math.cos(a) * size * 0.42, Math.sin(a) * size * 0.42, 0)
    // orienta il cono lungo dir con leggera divergenza
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
    const m = new THREE.Matrix4().compose(
      tip.clone().add(off.multiplyScalar(0.5)),
      q,
      new THREE.Vector3(1, 1, 1)
    )
    g.applyMatrix4(m)
    addPart(parent, g, mat, 'Ciuffo coda')
  }
}

/** orientare una geometria cilindrica (asse Y) tra due punti */
export function orientBetween(
  geo: THREE.BufferGeometry,
  a: THREE.Vector3,
  b: THREE.Vector3,
  length: number
): void {
  geo.computeBoundingBox()
  const geoH = Math.max(0.001, (geo.boundingBox!.max.y - geo.boundingBox!.min.y))
  const dir = b.clone().sub(a).normalize()
  const mid = a.clone().lerp(b, 0.5)
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir)
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, length / geoH, 1))
  geo.applyMatrix4(m)
}

/** piastra pettorale / cuore luminoso (robot/golem) */
export function coreGlow(parent: THREE.Group, mats: MatBag, pos: THREE.Vector3, size: number): void {
  const g = new THREE.CylinderGeometry(size * 0.62, size * 0.62, size * 0.3, 6)
  place(g, { pos: [pos.x, pos.y, pos.z], rot: [Math.PI / 2, 0, 0] })
  addPart(parent, g, mats.accent, 'Nucleo')
}
