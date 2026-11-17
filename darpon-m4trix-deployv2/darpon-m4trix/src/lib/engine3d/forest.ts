// ============================================================
// DARPX ENGINE — BOSCO NOTTRANO (v19)
// Il template horror del trailer: foresta di abeti notturna,
// nebbia grigio-verde, sentiero di terra, radura con falò di
// pietra, fossa rettangolare e torce. Tutto procedurale con
// seed FISSO: layout e collider coincidono sempre.
// Gli alberi usano InstancedMesh: centinaia di tronchi e chiome
// in poche draw call, i collider restano AABB semplici.
// ============================================================

import * as THREE from 'three'
import { pbrMat } from '@/lib/pbr'
import type { ColBox } from './prefabs'

// ---------------- prng deterministico ----------------

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------- materiali (pbrMat è in cache: condivisibili) ----------------

export function barkMat(): THREE.MeshStandardMaterial {
  return pbrMat('legno', '#3d3226', { roughness: 0.95, rx: 1, ry: 4 })
}

export function firMat(): THREE.MeshStandardMaterial {
  return pbrMat('foglie', '#1e2e22', { roughness: 0.9, rx: 2, ry: 3 })
}

export function grassGroundMat(): THREE.MeshStandardMaterial {
  return pbrMat('erba', '#46543a', { roughness: 1, rx: 14, ry: 14 })
}

export function dirtMat(): THREE.MeshStandardMaterial {
  return pbrMat('ghiaia', '#4d4234', { roughness: 1, rx: 3, ry: 2 })
}

export function grayStoneMat(): THREE.MeshStandardMaterial {
  return pbrMat('pietra', '#7d8284', { roughness: 0.92, rx: 2, ry: 2 })
}

export function flameMat(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: '#ff9a3c',
    emissive: new THREE.Color('#ff7a1e'),
    emissiveIntensity: 3.2,
    roughness: 0.4,
    transparent: true,
    opacity: 0.92,
  })
}

// ---------------- layout procedurale (seed fisso!) ----------------

export const BOSCO_SEED = 20261116
const AREA = 150 // lato del quadrato di foresta
const R_MAX = AREA * 0.5 - 3

export type TreeSpot = { x: number; z: number; s: number; h: number; rot: number }

/** il sentiero serpeggia da ovest a est passando per la radura */
export function pathAt(x: number): number {
  return Math.sin(x * 0.055) * 9 + Math.sin(x * 0.021 + 1.7) * 4
}

export const CAMP = { x: 6, z: pathAt(6) } // radura del falò
export const PIT = { x: -26, z: pathAt(-26) + 13 } // la fossa rettangolare

function onPath(x: number, z: number, halfW: number): boolean {
  const px = pathAt(x)
  return Math.abs(z - px) < halfW
}

/** posizioni degli alberi (deterministiche) */
export function treeSpots(): TreeSpot[] {
  const r = rng(BOSCO_SEED)
  const out: TreeSpot[] = []
  let tries = 0
  while (out.length < 240 && tries < 4000) {
    tries++
    const x = (r() * 2 - 1) * R_MAX
    const z = (r() * 2 - 1) * R_MAX
    if (Math.hypot(x, z) > 74) continue // restiamo dentro il disco di terreno (r.88)
    const dist0 = Math.hypot(x, z)
    const distC = Math.hypot(x - CAMP.x, z - CAMP.z)
    const distP = Math.hypot(x - PIT.x, z - PIT.z)
    // radure libere: origine (spawn), falò, fossa, sentiero
    if (dist0 < 11) continue
    if (distC < 9) continue
    if (distP < 6.5) continue
    if (onPath(x, z, 3.4)) continue
    // troppo vicino a un altro albero?
    let ok = true
    for (const t of out) {
      if ((t.x - x) * (t.x - x) + (t.z - z) * (t.z - z) < 10.2) {
        ok = false
        break
      }
    }
    if (!ok) continue
    out.push({
      x,
      z,
      s: 0.75 + r() * 0.8, // scala complessiva
      h: 0.9 + r() * 0.35, // altezza chioma extra
      rot: r() * Math.PI * 2,
    })
  }
  return out
}

/** massi sparsi (fuori dal sentiero e dalle radure) */
export function rockSpots(): { x: number; z: number; s: number; rot: number }[] {
  const r = rng(BOSCO_SEED + 77)
  const out: { x: number; z: number; s: number; rot: number }[] = []
  let tries = 0
  while (out.length < 70 && tries < 1200) {
    tries++
    const x = (r() * 2 - 1) * R_MAX
    const z = (r() * 2 - 1) * R_MAX
    if (Math.hypot(x, z) > 74) continue // dentro il terreno
    if (Math.hypot(x, z) < 9) continue
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 8) continue
    if (onPath(x, z, 2.6)) continue
    out.push({ x, z, s: 0.35 + r() * 1.15, rot: r() * Math.PI * 2 })
  }
  return out
}

/** cespugi bassi (attraversabili) */
export function bushSpots(): { x: number; z: number; s: number; rot: number }[] {
  const r = rng(BOSCO_SEED + 133)
  const out: { x: number; z: number; s: number; rot: number }[] = []
  let tries = 0
  while (out.length < 110 && tries < 1600) {
    tries++
    const x = (r() * 2 - 1) * R_MAX
    const z = (r() * 2 - 1) * R_MAX
    if (Math.hypot(x, z) > 76) continue // dentro il terreno
    if (Math.hypot(x, z) < 7) continue
    if (onPath(x, z, 2.2)) continue
    out.push({ x, z, s: 0.5 + r() * 0.8, rot: r() * Math.PI * 2 })
  }
  return out
}

/** ceppi e tronchi caduti lungo il sentiero */
export function logSpots(): { x: number; z: number; rot: number; kind: 'ceppo' | 'caduto' }[] {
  const r = rng(BOSCO_SEED + 51)
  const out: { x: number; z: number; rot: number; kind: 'ceppo' | 'caduto' }[] = []
  for (let x = -52; x <= 52; x += 13) {
    const z = pathAt(x) + (r() * 2 - 1) * 8 + 5
    if (Math.hypot(x, z) < 9 || Math.hypot(x - CAMP.x, z - CAMP.z) < 7.5) continue
    out.push({ x: x + (r() * 2 - 1) * 2, z, rot: r() * Math.PI * 2, kind: r() > 0.45 ? 'ceppo' : 'caduto' })
  }
  return out
}

/** paletti-torcia che accompagnano il sentiero (luce finta: emissivo+bloom) */
export function torchSpots(): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = []
  for (let x = -44; x <= 44; x += 11) {
    const side = Math.sin(x * 1.7) > 0 ? 1 : -1
    out.push({ x, z: pathAt(x) + side * 3.2 })
  }
  return out
}

/** collider del bosco: i tronchi (AABB per albero) */
export function forestColliders(): ColBox[] {
  const out: ColBox[] = []
  for (const t of treeSpots()) {
    const w = 0.5 * t.s
    out.push({ c: [t.x, 5 * t.s, t.z], s: [w, 10 * t.s, w] })
  }
  for (const rk of rockSpots()) {
    if (rk.s < 0.75) continue // i sassolini si scavalcano
    const w = 1.15 * rk.s
    out.push({ c: [rk.x, 0.45 * rk.s, rk.z], s: [w, 0.9 * rk.s, w] })
  }
  return out
}

// ---------------- costruzione della scena ----------------

/**
 * Costruisce l'INTERO bosco come un gruppo THREE:
 * terreno erboso, 240 abeti instanziati, massi, cespugi,
 * sentiero di terra battuta, radura del falò, fossa e torce.
 */
export function buildBoscoGroup(anims: ((t: number, dt: number) => void)[]): THREE.Group {
  const g = new THREE.Group()
  const r = rng(BOSCO_SEED + 9)

  // ---------- terreno erboso ----------
  const ground = new THREE.Mesh(new THREE.CircleGeometry(88, 56), grassGroundMat())
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  g.add(ground)

  // ---------- sentiero di terra battuta ----------
  const pathGeo = new THREE.PlaneGeometry(1, 1)
  for (let x = -60; x <= 60; x += 1.6) {
    const z = pathAt(x)
    const seg = new THREE.Mesh(pathGeo, dirtMat())
    seg.rotation.x = -Math.PI / 2
    seg.rotation.z = -Math.cos(x * 0.055) * 9 * 0.055 - Math.cos(x * 0.021 + 1.7) * 4 * 0.021
    seg.position.set(x, 0.02, z)
    const w = 4.6 + Math.sin(x * 0.7) * 0.8
    seg.scale.set(w, 2.4, 1)
    seg.receiveShadow = true
    g.add(seg)
  }

  // ---------- ABETI: tronchi instanziati + 3 livelli di chioma ----------
  const trees = treeSpots()
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.3, 6.4, 7)
  const cone1 = new THREE.ConeGeometry(2.15, 4.6, 8)
  const cone2 = new THREE.ConeGeometry(1.65, 4.1, 8)
  const cone3 = new THREE.ConeGeometry(1.1, 3.4, 8)

  const trunkIM = new THREE.InstancedMesh(trunkGeo, barkMat(), trees.length)
  const c1IM = new THREE.InstancedMesh(cone1, firMat(), trees.length)
  const c2IM = new THREE.InstancedMesh(cone2, firMat(), trees.length)
  const c3IM = new THREE.InstancedMesh(cone3, firMat(), trees.length)
  trunkIM.castShadow = true
  c1IM.castShadow = true
  c2IM.castShadow = true
  c3IM.castShadow = true
  c1IM.receiveShadow = true

  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const eu = new THREE.Euler()
  const v = new THREE.Vector3()
  const sv = new THREE.Vector3()
  trees.forEach((t, i) => {
    const H = 6.4 * t.s // altezza tronco
    eu.set(0, t.rot, 0)
    q.setFromEuler(eu)
    // tronco
    m.compose(v.set(t.x, H / 2, t.z), q, sv.set(t.s, t.s, t.s))
    trunkIM.setMatrixAt(i, m)
    // chioma: tre coni sovrapposti con leggero scostamento casuale
    const jit = [r() * 0.3 - 0.15, r() * 0.3 - 0.15, r() * 0.3 - 0.15]
    const y1 = H * 0.78
    const y2 = H * 0.78 + 2.1 * t.s
    const y3 = H * 0.78 + 3.9 * t.s
    m.compose(v.set(t.x + jit[0], y1 * t.h, t.z + jit[2]), q, sv.set(t.s, t.s * t.h, t.s))
    c1IM.setMatrixAt(i, m)
    m.compose(v.set(t.x + jit[1], y2 * t.h, t.z + jit[2]), q, sv.set(t.s, t.s * t.h, t.s))
    c2IM.setMatrixAt(i, m)
    m.compose(v.set(t.x, y3 * t.h, t.z), q, sv.set(t.s, t.s * t.h, t.s))
    c3IM.setMatrixAt(i, m)
  })
  g.add(trunkIM, c1IM, c2IM, c3IM)

  // ---------- massi instanziati ----------
  const rocks = rockSpots()
  const rockGeo = new THREE.DodecahedronGeometry(1, 0)
  const rockIM = new THREE.InstancedMesh(rockGeo, grayStoneMat(), rocks.length)
  rockIM.castShadow = true
  rockIM.receiveShadow = true
  rocks.forEach((rk, i) => {
    eu.set(r() * 0.4 - 0.2, rk.rot, r() * 0.4 - 0.2)
    q.setFromEuler(eu)
    m.compose(v.set(rk.x, 0.35 * rk.s, rk.z), q, sv.set(rk.s, rk.s * 0.72, rk.s))
    rockIM.setMatrixAt(i, m)
  })
  g.add(rockIM)

  // ---------- cespugi instanziati (3 sfere per cespuglio → 3 IM) ----------
  const bushes = bushSpots()
  const bushGeo = new THREE.IcosahedronGeometry(0.55, 1)
  const bIMs = [0, 1, 2].map(() => new THREE.InstancedMesh(bushGeo, firMat(), bushes.length))
  bushes.forEach((b, i) => {
    for (let k = 0; k < 3; k++) {
      const ox = (r() * 2 - 1) * 0.35 * b.s
      const oz = (r() * 2 - 1) * 0.35 * b.s
      eu.set(0, b.rot + k * 2.1, 0)
      q.setFromEuler(eu)
      m.compose(
        v.set(b.x + ox, (0.32 + k * 0.1) * b.s, b.z + oz),
        q,
        sv.set(b.s * (1 + k * 0.12), b.s * 0.7, b.s * (1 + k * 0.12))
      )
      bIMs[k].setMatrixAt(i, m)
    }
  })
  bIMs.forEach(im => g.add(im))

  // ---------- ceppi e tronchi caduti ----------
  for (const lg of logSpots()) {
    if (lg.kind === 'ceppo') {
      const st = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.9, 10), barkMat())
      st.position.set(lg.x, 0.45, lg.z)
      st.rotation.y = lg.rot
      st.castShadow = true
      st.receiveShadow = true
      g.add(st)
    } else {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 3.6, 9), barkMat())
      log.rotation.z = Math.PI / 2
      log.rotation.y = lg.rot
      log.position.set(lg.x, 0.28, lg.z)
      log.castShadow = true
      g.add(log)
    }
  }

  // ---------- RADURA DEL FALÒ (pietra circolare + tripline + fiamme) ----------
  g.add(...buildCampfireParts(CAMP.x, CAMP.z, anims, true))

  // ---------- FOSSA rettangolare (come nel trailer) ----------
  const pitW = 3.4
  const pitD = 2.2
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(pitW, pitD), new THREE.MeshBasicMaterial({ color: '#241a10' }))
  hole.rotation.x = -Math.PI / 2
  hole.position.set(PIT.x, 0.03, PIT.z)
  g.add(hole)
  // bordo di terra smossa
  for (let i = 0; i < 14; i++) {
    const side = i % 4
    const along = (r() * 2 - 1) * (side < 2 ? pitW : pitD) * 0.45
    const off = side < 2 ? (side === 0 ? -1 : 1) * (pitD / 2 + 0.25) : 0
    const zz = side < 2 ? PIT.z + off : PIT.z + along
    const xx = side < 2 ? PIT.x + along : PIT.x + (side === 2 ? -1 : 1) * (pitW / 2 + 0.25)
    const clump = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), dirtMat())
    clump.position.set(xx, 0.14, zz)
    clump.scale.set(1 + r(), 0.6, 1 + r() * 0.6)
    clump.castShadow = true
    g.add(clump)
  }
  // due assi di legno lungo il bordo (cassaio abbandonato)
  const plankGeo = new THREE.BoxGeometry(pitW + 0.7, 0.09, 0.22)
  const plankMat = pbrMat('legno', '#5e4226', { roughness: 0.85, rx: 2, ry: 1 })
  for (const zz of [PIT.z - pitD / 2 - 0.12, PIT.z + pitD / 2 + 0.12]) {
    const p = new THREE.Mesh(plankGeo, plankMat)
    p.position.set(PIT.x, 0.09, zz)
    p.rotation.y = r() * 0.08 - 0.04
    p.castShadow = true
    g.add(p)
  }

  // ---------- torce lungo il sentiero ----------
  for (const tp of torchSpots()) {
    g.add(...buildTorchParts(tp.x, tp.z, anims))
  }

  return g
}

/** le parti del falò: cerchio di pietre, tripline, fiamme animate, luce */
export function buildCampfireParts(
  cx: number,
  cz: number,
  anims: ((t: number, dt: number) => void)[],
  withLight: boolean
): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []
  const r = rng(Math.round(cx * 100 + cz * 13 + BOSCO_SEED))
  // cerchio di pietre
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + r() * 0.1, 0), grayStoneMat())
    st.position.set(cx + Math.cos(a) * 1.15, 0.16, cz + Math.sin(a) * 1.15)
    st.rotation.set(r(), r() * 6, r())
    st.castShadow = true
    parts.push(st)
  }
  // tripline di legna
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.5, 6), barkMat())
    stick.position.set(cx + Math.cos(a) * 0.32, 0.5, cz + Math.sin(a) * 0.32)
    stick.rotation.set(Math.sin(a) * 0.7, a, Math.cos(a) * 0.7)
    stick.castShadow = true
    parts.push(stick)
  }
  // fiamme (2 coni emissivi animati)
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 7), flameMat())
  f1.position.set(cx, 0.62, cz)
  const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 6), flameMat())
  f2.position.set(cx + 0.1, 0.78, cz + 0.06)
  parts.push(f1, f2)
  // braci luminose
  const ember = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#ff6a1e', emissive: new THREE.Color('#ff520e'), emissiveIntensity: 2.2 })
  )
  ember.scale.y = 0.4
  ember.position.set(cx, 0.14, cz)
  parts.push(ember)
  // luce tremolante
  if (withLight) {
    const l = new THREE.PointLight('#ff8c3a', 26, 22, 1.9)
    l.position.set(cx, 1.05, cz)
    l.castShadow = true
    l.shadow.mapSize.set(512, 512)
    parts.push(l)
    anims.push(t => {
      const fl = 22 + Math.sin(t * 11.3) * 4 + Math.sin(t * 27.7 + 1.3) * 3
      l.intensity = fl
      const s1 = 1 + Math.sin(t * 9.1) * 0.09
      f1.scale.set(s1, 1 + Math.sin(t * 7.7 + 0.4) * 0.14, s1)
      f2.scale.set(s1, 1 + Math.sin(t * 12.9 + 1.1) * 0.18, s1)
    })
  } else {
    anims.push(t => {
      const s1 = 1 + Math.sin(t * 9.1 + cx) * 0.08
      f1.scale.set(s1, 1 + Math.sin(t * 7.7 + 0.4 + cx) * 0.12, s1)
    })
  }
  return parts
}

/** paletto-torcia: palo + tazza di legna + piccola fiamma (solo emissivo) */
export function buildTorchParts(x: number, z: number, anims: ((t: number, dt: number) => void)[]): THREE.Object3D[] {
  const parts: THREE.Object3D[] = []
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 2.6, 7), barkMat())
  pole.position.set(x, 1.3, z)
  pole.castShadow = true
  parts.push(pole)
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.1, 0.22, 7), barkMat())
  cup.position.set(x, 2.62, z)
  parts.push(cup)
  const fl = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 6), flameMat())
  fl.position.set(x, 2.92, z)
  parts.push(fl)
  anims.push(t => {
    const s = 1 + Math.sin(t * 10.4 + x * 3) * 0.13
    fl.scale.set(s, 1 + Math.sin(t * 8.2 + x) * 0.16, s)
  })
  return parts
}

/** fossa + pietre: collider aggiuntivi per il prefab 'buca-tomba' manuale */
export function pitColliders(): ColBox[] {
  return [
    { c: [0, 0.06, -1.28], s: [4.1, 0.12, 0.28] },
    { c: [0, 0.06, 1.28], s: [4.1, 0.12, 0.28] },
    { c: [-1.9, 0.06, 0], s: [0.28, 0.12, 2.3] },
    { c: [1.9, 0.06, 0], s: [0.28, 0.12, 2.3] },
  ]
}
