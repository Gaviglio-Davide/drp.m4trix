'use client'

// ============================================================
// ASSET DEL MONDO · v7 REMASTER REALISTICO
// ------------------------------------------------------------
// Tutti gli edifici e gli elementi naturali sono ricostruiti con
// geometrie dettagliate + texture PBR procedurali (vedi lib/pbr).
// Per tenere il sito veloce ogni asset viene assemblato con la
// classe Bag: le geometrie dello stesso materiale vengono FUSE in
// un'unica mesh → una casa realistica resta ~5 draw call.
// I pezzi del designer di strutture ora appoggiano SUL BORDO della
// cella (non più al centro): le mura seguono la linea del quadrato
// e la simmetria è rispettata.
// Nuovi pezzi da ESTERNO stile HomeByMe: recinzione, siepe,
// vialetto, aiuola, panchina (nel designer) e in più pergolato,
// fontana e vaso tra gli oggetti del mondo.
// ============================================================

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { PALETTE, ROOF_PALETTE } from './world-store'
import { pbrMat } from './pbr'
import { jitter } from '@/lib/darpx3d/parts'
import { makeRng } from '@/lib/darpx3d/rng'

export type RoadLinks = { n: boolean; e: boolean; s: boolean; w: boolean }

export type AssetRenderProps = {
  color: number
  rot: number
  links?: RoadLinks
  scale?: number // moltiplicatore dimensione (solo modelli GLB)
}

export type AssetDef = {
  id: string
  label: string
  icon: string
  desc?: string
  walkable?: boolean
  walkHeight?: number // altezza della superficie calpestabile (modalità Gioca)
  isGlb?: boolean
  glbUrl?: string
  render: (props: AssetRenderProps) => ReactNode
}

// ---------- shared helpers ----------

function roofColorOf(color: number) {
  return ROOF_PALETTE[color % ROOF_PALETTE.length]
}

function wallColorOf(color: number) {
  return PALETTE[color % PALETTE.length]
}

function trimShade(hex: string, amt: number) {
  const c = new THREE.Color(hex)
  const hsl = { h: 0, s: 0, l: 0 }
  c.getHSL(hsl)
  c.setHSL(hsl.h, hsl.s, THREE.MathUtils.clamp(hsl.l + amt, 0.05, 0.95))
  return `#${c.getHexString()}`
}

// ---------- Bag: assembla geometrie fuse per materiale ----------

type Xf = {
  p?: [number, number, number]
  r?: [number, number, number]
  s?: [number, number, number] | number
}

const _m4 = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _e = new THREE.Euler()
const _v = new THREE.Vector3()
const _one = new THREE.Vector3(1, 1, 1)

class Bag {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>()

  add(geo: THREE.BufferGeometry, mat: THREE.Material, xf: Xf = {}) {
    const p = xf.p ?? [0, 0, 0]
    const r = xf.r ?? [0, 0, 0]
    const s = typeof xf.s === 'number' ? [xf.s, xf.s, xf.s] : (xf.s ?? [1, 1, 1])
    _e.set(r[0], r[1], r[2])
    _q.setFromEuler(_e)
    _m4.compose(_v.set(p[0], p[1], p[2]), _q, new THREE.Vector3(s[0], s[1], s[2]))
    geo.applyMatrix4(_m4)
    const list = this.parts.get(mat)
    if (list) list.push(geo)
    else this.parts.set(mat, [geo])
  }

  /** fonde tutto e restituisce un gruppo pronto (con ombre) */
  build(castShadow = true): THREE.Group {
    const g = new THREE.Group()
    for (const [mat, geos] of this.parts) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.castShadow = castShadow
      mesh.receiveShadow = true
      g.add(mesh)
    }
    return g
  }
}

/** prisma triangolare (frontone/falcone del tetto) */
function gableGeo(w: number, h: number, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.moveTo(-w / 2, 0)
  shape.lineTo(w / 2, 0)
  shape.lineTo(0, h)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  g.translate(0, 0, -depth / 2)
  return g
}

/** tetto a due falde con coppi, gronda e colmo (falce lungo X) */
function addGableRoof(
  bag: Bag,
  w: number,
  d: number,
  yTop: number,
  rise: number,
  roof: string
) {
  const ovh = 0.07
  const half = d / 2 + ovh
  const L = Math.hypot(half, rise) + 0.02
  const ang = Math.atan2(rise, half)
  const slab = new THREE.BoxGeometry(w + ovh * 2, 0.045, L)
  const mat = pbrMat('coppi', roof, { roughness: 0.82, rx: (w + 0.14) / 0.8, ry: L / 0.8 })
  bag.add(slab, mat, { p: [0, yTop + rise / 2 + 0.01, half / 2], r: [ang, 0, 0] })
  bag.add(slab.clone(), mat, { p: [0, yTop + rise / 2 + 0.01, -half / 2], r: [-ang, 0, 0] })
  // colmo
  bag.add(
    new THREE.BoxGeometry(w + ovh * 2 + 0.03, 0.06, 0.12),
    pbrMat('coppi', trimShade(roof, -0.06), { roughness: 0.85 }),
    { p: [0, yTop + rise + 0.035, 0] }
  )
}

/** finestra con telaio, davanzale, vetro e architrave (locale: guarda +Z, poi viene ruotata sulla faccia) */
function addWindow(
  bag: Bag,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  face: 'z+' | 'z-' | 'x+' | 'x-'
) {
  const rotY =
    face === 'z+' ? 0 : face === 'z-' ? Math.PI : face === 'x+' ? Math.PI / 2 : -Math.PI / 2
  // offset locale (lx lungo la facciata, lz verso l'esterno) → mondo
  const off = (lx: number, lz: number): [number, number] =>
    face === 'z+' ? [lx, lz] : face === 'z-' ? [-lx, -lz] : face === 'x+' ? [lz, -lx] : [-lz, lx]
  const at = (lx: number, ly: number, lz: number): Xf => {
    const [wx, wz] = off(lx, lz)
    return { p: [x + wx, y + ly, z + wz], r: [0, rotY, 0] }
  }
  const wood = pbrMat('legno', '#6e4a2c', { roughness: 0.85 })
  const wallWood = pbrMat('legno', '#7d5836', { roughness: 0.9 })
  const t = 0.035
  // telaio: sopra, sotto, due montanti + traversa centrale
  bag.add(new THREE.BoxGeometry(w, t, 0.07), wood, at(0, h / 2, 0.01))
  bag.add(new THREE.BoxGeometry(w, t, 0.07), wood, at(0, -h / 2, 0.01))
  bag.add(new THREE.BoxGeometry(t, h, 0.07), wood, at(-w / 2 + t / 2, 0, 0.01))
  bag.add(new THREE.BoxGeometry(t, h, 0.07), wood, at(w / 2 - t / 2, 0, 0.01))
  bag.add(new THREE.BoxGeometry(t * 0.7, h - t * 2, 0.05), wood, at(0, 0, 0.005))
  // vetro
  bag.add(
    new THREE.BoxGeometry(w - t * 2, h - t * 2, 0.02),
    new THREE.MeshStandardMaterial({
      color: '#9fb8c4',
      emissive: '#c8b478',
      emissiveIntensity: 0.22,
      roughness: 0.15,
      metalness: 0.1,
    }),
    at(0, 0, 0.025)
  )
  // davanzale in pietra
  bag.add(
    new THREE.BoxGeometry(w + 0.06, 0.035, 0.1),
    pbrMat('pietra', '#b3a894', { roughness: 0.9 }),
    at(0, -h / 2 - 0.03, 0.03)
  )
  // architrave in legno sopra
  bag.add(new THREE.BoxGeometry(w + 0.08, 0.045, 0.09), wallWood, at(0, h / 2 + 0.045, 0.02))
}

/** porta in legno con telaio, gradino e maniglia */
function addDoor(bag: Bag, x: number, y: number, z: number, w: number, h: number) {
  const wood = pbrMat('legno', '#5d4033', { roughness: 0.88, rx: 0.6, ry: 1.2 })
  const woodL = pbrMat('legno', '#6b4a38', { roughness: 0.9 })
  // telaio
  bag.add(new THREE.BoxGeometry(w + 0.09, 0.06, 0.1), woodL, { p: [x, y + h / 2 + 0.03, z] })
  bag.add(new THREE.BoxGeometry(0.045, h, 0.1), woodL, { p: [x - w / 2 - 0.02, y, z] })
  bag.add(new THREE.BoxGeometry(0.045, h, 0.1), woodL, { p: [x + w / 2 + 0.02, y, z] })
  // battente (2 pannelli + traversa)
  bag.add(new THREE.BoxGeometry(w, h - 0.04, 0.05), wood, { p: [x, y, z] })
  bag.add(new THREE.BoxGeometry(w - 0.1, 0.03, 0.06), woodL, { p: [x, y + h * 0.18, z + 0.008] })
  // maniglia in ferro
  bag.add(
    new THREE.SphereGeometry(0.022, 8, 6),
    pbrMat('metallo', '#3a3a3e', { metalness: 0.85, roughness: 0.4 }),
    { p: [x + w / 2 - 0.07, y - 0.02, z + 0.04] }
  )
  // gradino in pietra
  bag.add(
    new THREE.BoxGeometry(w + 0.16, 0.05, 0.14),
    pbrMat('pietraSquadrata', '#a89a8a', { roughness: 0.95 }),
    { p: [x, y - h / 2 - 0.01, z + 0.05] }
  )
}

// ============================================================
// EDIFICI PROCEDURALI · stile realistico
// ============================================================

function buildCasa(color: number): THREE.Group {
  const bag = new Bag()
  const wall = wallColorOf(color)
  const roof = roofColorOf(color)
  const plinth = pbrMat('pietraSquadrata', '#a89a8a', { roughness: 0.95 })
  const walls = pbrMat('intonaco', wall, { roughness: 0.92 })
  // zoccolo
  bag.add(new THREE.BoxGeometry(0.92, 0.13, 0.92), plinth, { p: [0, 0.065, 0] })
  // pareti
  bag.add(new THREE.BoxGeometry(0.82, 0.58, 0.82), walls, { p: [0, 0.13 + 0.29, 0] })
  // porta + finestre sulla facciata
  addDoor(bag, 0, 0.13 + 0.21, 0.415, 0.2, 0.42)
  addWindow(bag, -0.26, 0.13 + 0.34, 0.415, 0.15, 0.16, 'z+')
  addWindow(bag, 0.26, 0.13 + 0.34, 0.415, 0.15, 0.16, 'z+')
  addWindow(bag, 0.415, 0.13 + 0.34, -0.2, 0.14, 0.15, 'x+')
  addWindow(bag, -0.415, 0.13 + 0.34, 0.18, 0.14, 0.15, 'x-')
  // frontoni + tetto
  const yTop = 0.71
  const rise = 0.33
  bag.add(gableGeo(0.8, rise, 0.05), walls, { p: [0.385, yTop, 0], r: [0, 0, 0] })
  bag.add(gableGeo(0.8, rise, 0.05), walls, { p: [-0.385, yTop, 0], r: [0, 0, 0] })
  addGableRoof(bag, 0.82, 0.82, yTop, rise, roof)
  // comignolo in mattoni
  const brick = pbrMat('mattoni', '#a05a48', { roughness: 0.95, rx: 0.35, ry: 0.6 })
  bag.add(new THREE.BoxGeometry(0.11, 0.34, 0.11), brick, { p: [0.24, yTop + rise + 0.02, -0.16] })
  bag.add(new THREE.BoxGeometry(0.15, 0.045, 0.15), pbrMat('pietra', '#8d8478', { roughness: 0.95 }), {
    p: [0.24, yTop + rise + 0.2, -0.16],
  })
  return bag.build()
}

function buildCasatorre(color: number): THREE.Group {
  const bag = new Bag()
  const wall = wallColorOf(color)
  const roof = roofColorOf(color)
  const plinth = pbrMat('pietraSquadrata', '#a1938a', { roughness: 0.95 })
  const walls = pbrMat('intonaco', wall, { roughness: 0.92 })
  const band = pbrMat('pietraSquadrata', trimShade(wall, -0.1), { roughness: 0.95 })
  // zoccolo + corpo su due piani
  bag.add(new THREE.BoxGeometry(0.86, 0.14, 0.86), plinth, { p: [0, 0.07, 0] })
  bag.add(new THREE.BoxGeometry(0.78, 1.06, 0.78), walls, { p: [0, 0.14 + 0.53, 0] })
  // corsa di pietra tra i piani + gronda
  bag.add(new THREE.BoxGeometry(0.84, 0.05, 0.84), band, { p: [0, 0.68, 0] })
  bag.add(new THREE.BoxGeometry(0.84, 0.05, 0.84), band, { p: [0, 1.22, 0] })
  // porta e finestre (2 piani)
  addDoor(bag, 0, 0.14 + 0.22, 0.395, 0.2, 0.44)
  addWindow(bag, -0.25, 0.14 + 0.36, 0.395, 0.15, 0.17, 'z+')
  addWindow(bag, 0.25, 0.14 + 0.36, 0.395, 0.15, 0.17, 'z+')
  addWindow(bag, -0.22, 0.14 + 0.88, 0.395, 0.15, 0.17, 'z+')
  addWindow(bag, 0.22, 0.14 + 0.88, 0.395, 0.15, 0.17, 'z+')
  addWindow(bag, 0.395, 0.14 + 0.62, -0.18, 0.13, 0.15, 'x+')
  addWindow(bag, -0.395, 0.14 + 0.62, 0.16, 0.13, 0.15, 'x-')
  // tetto
  const yTop = 1.22
  const rise = 0.3
  bag.add(gableGeo(0.76, rise, 0.05), walls, { p: [0.365, yTop, 0] })
  bag.add(gableGeo(0.76, rise, 0.05), walls, { p: [-0.365, yTop, 0] })
  addGableRoof(bag, 0.78, 0.78, yTop, rise, roof)
  // abbaino piccolo sul tetto
  bag.add(new THREE.BoxGeometry(0.16, 0.18, 0.16), walls, { p: [0, yTop + 0.12, 0.22] })
  bag.add(
    new THREE.BoxGeometry(0.2, 0.03, 0.2),
    pbrMat('coppi', trimShade(roof, -0.08), { roughness: 0.85 }),
    { p: [0, yTop + 0.23, 0.22], r: [0.3, 0, 0] }
  )
  return bag.build()
}

function buildTorre(color: number): THREE.Group {
  const bag = new Bag()
  const wall = wallColorOf(color)
  const roof = roofColorOf(color)
  const stone = pbrMat('pietraSquadrata', wall, { roughness: 0.95, rx: 0.8, ry: 2.4 })
  const stoneD = pbrMat('pietraSquadrata', trimShade(wall, -0.12), { roughness: 0.95 })
  // base a scarpa
  bag.add(new THREE.CylinderGeometry(0.44, 0.48, 0.18, 14), stoneD, { p: [0, 0.09, 0] })
  // fusto
  bag.add(new THREE.CylinderGeometry(0.34, 0.38, 1.62, 14), stone, { p: [0, 0.18 + 0.81, 0] })
  // cornicione
  bag.add(new THREE.CylinderGeometry(0.41, 0.36, 0.09, 14), stoneD, { p: [0, 1.86, 0] })
  // merlatura (8 beccatelli)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    bag.add(new THREE.BoxGeometry(0.1, 0.14, 0.08), stoneD, {
      p: [Math.cos(a) * 0.37, 1.98, Math.sin(a) * 0.37],
      r: [0, -a, 0],
    })
  }
  // feritoie
  const slit = new THREE.MeshStandardMaterial({ color: '#241f1c', roughness: 1 })
  for (const [sx, sz] of [[0, 0.35], [0.35, 0], [0, -0.35], [-0.35, 0]] as const) {
    bag.add(new THREE.BoxGeometry(0.05, 0.26, 0.05), slit, { p: [sx, 1.15, sz] })
  }
  // bandiera
  const pole = pbrMat('legno', '#4a3626', { roughness: 0.9 })
  bag.add(new THREE.CylinderGeometry(0.016, 0.016, 0.42, 6), pole, { p: [0, 2.12, 0] })
  bag.add(
    new THREE.BoxGeometry(0.2, 0.12, 0.012),
    new THREE.MeshStandardMaterial({ color: '#a83232', roughness: 0.9, side: THREE.DoubleSide }),
    { p: [0.11, 2.24, 0] }
  )
  // tetto conico (sotto la bandiera, sopra i merli? no: torre aperta con merli)
  void roof
  return bag.build()
}

// ============================================================
// NATURA · alberi, cespugli e rocce con geometria organica
// ============================================================

function jittered(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  return jitter(geo, amount, makeRng(seed))
}

function buildAlbero(): THREE.Group {
  const bag = new Bag()
  const bark = pbrMat('legno', '#5d4430', { roughness: 0.95, rx: 0.5, ry: 1.5 })
  const leafA = pbrMat('foglie', '#4e7c3c', { roughness: 0.95 })
  const leafB = pbrMat('foglie', '#5c8a46', { roughness: 0.95 })
  const leafC = pbrMat('foglie', '#456f38', { roughness: 0.95 })
  // tronco conico rastremato + ramo
  bag.add(jittered(new THREE.CylinderGeometry(0.06, 0.1, 0.62, 8), 0.012, 31), bark, { p: [0, 0.31, 0] })
  bag.add(jittered(new THREE.CylinderGeometry(0.03, 0.05, 0.34, 6), 0.01, 37), bark, {
    p: [0.12, 0.62, 0.04],
    r: [0, 0, -0.7],
  })
  // chioma: 4 blob sovrapposti con rilievo organico
  bag.add(jittered(new THREE.IcosahedronGeometry(0.3, 2), 0.045, 41), leafA, { p: [0, 0.86, 0], s: [1, 0.92, 1] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.2, 2), 0.04, 43), leafB, { p: [0.19, 1.0, 0.1] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.18, 2), 0.04, 47), leafC, { p: [-0.17, 0.98, -0.08] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.16, 2), 0.035, 53), leafB, { p: [0.02, 1.12, -0.05] })
  return bag.build()
}

function buildPino(): THREE.Group {
  const bag = new Bag()
  const bark = pbrMat('legno', '#4e3a2a', { roughness: 0.95, rx: 0.4, ry: 1.2 })
  const needleA = pbrMat('foglie', '#33552e', { roughness: 0.95 })
  const needleB = pbrMat('foglie', '#3d6336', { roughness: 0.95 })
  bag.add(jittered(new THREE.CylinderGeometry(0.055, 0.085, 0.4, 8), 0.01, 61), bark, { p: [0, 0.2, 0] })
  const layers: [number, number, number][] = [
    [0.3, 0.44, 0.52],
    [0.25, 0.4, 0.82],
    [0.19, 0.34, 1.08],
    [0.12, 0.26, 1.3],
  ]
  layers.forEach(([r, h, y], i) => {
    bag.add(
      jittered(new THREE.ConeGeometry(r, h, 9), 0.03, 67 + i * 4),
      i % 2 ? needleB : needleA,
      { p: [0, y, 0] }
    )
  })
  return bag.build()
}

function buildCespuglio(color: number): THREE.Group {
  const bag = new Bag()
  const c = trimShade(wallColorOf(color), -0.15)
  const m1 = pbrMat('foglie', c, { roughness: 0.95 })
  const m2 = pbrMat('foglie', trimShade(c, -0.07), { roughness: 0.95 })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.23, 2), 0.05, 71), m1, { p: [0, 0.17, 0], s: [1, 0.75, 1] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.14, 2), 0.04, 73), m2, { p: [0.15, 0.11, 0.09], s: [1, 0.7, 1] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.11, 2), 0.035, 79), m2, { p: [-0.13, 0.09, 0.12], s: [1, 0.65, 1] })
  return bag.build()
}

function buildRoccia(): THREE.Group {
  const bag = new Bag()
  const m = pbrMat('pietra', '#8d8a84', { roughness: 0.98 })
  const m2 = pbrMat('pietra', '#7c7973', { roughness: 0.98 })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.27, 2), 0.07, 83), m, {
    p: [0, 0.13, 0],
    s: [1, 0.55, 0.85],
    r: [0.2, 0.5, 0.1],
  })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.13, 1), 0.045, 89), m2, { p: [0.2, 0.06, 0.12], s: [1, 0.6, 1] })
  return bag.build()
}

function buildCollina(big: boolean): THREE.Group {
  const bag = new Bag()
  const grass = pbrMat('erba', big ? '#6f9e52' : '#7cae5e', { roughness: 1, rx: 2, ry: 2 })
  const grass2 = pbrMat('erba', big ? '#7fae5e' : '#8abd69', { roughness: 1, rx: 2, ry: 2 })
  const rock = pbrMat('pietra', '#9a9a94', { roughness: 1 })
  const R = big ? 0.55 : 0.52
  bag.add(jittered(new THREE.SphereGeometry(R, 18, 12), big ? 0.06 : 0.04, big ? 97 : 101), grass, {
    p: [0, big ? 0.4 : 0.17, 0],
    s: [1, big ? 1.45 : 0.68, 1],
  })
  bag.add(jittered(new THREE.SphereGeometry(0.24, 12, 9), 0.04, 103), grass2, {
    p: [0.17, big ? 0.72 : 0.34, 0.12],
    s: [1, 0.72, 1],
  })
  if (big) {
    bag.add(jittered(new THREE.IcosahedronGeometry(0.19, 1), 0.05, 107), rock, {
      p: [0.04, 1.02, -0.02],
      r: [0.3, 0.4, 0.15],
    })
    // pini sul pendio
    const bark = pbrMat('legno', '#4e3a2a', { roughness: 0.95 })
    const needle = pbrMat('foglie', '#33552e', { roughness: 0.95 })
    for (const [px, pz, s] of [[-0.26, 0.16, 0.7], [0.26, 0.18, 0.6]] as const) {
      bag.add(new THREE.CylinderGeometry(0.03, 0.045, 0.2, 6), bark, { p: [px, 0.62 + 0.1 * s, pz] })
      bag.add(new THREE.ConeGeometry(0.12 * s, 0.3 * s, 8), needle, { p: [px, 0.62 + 0.1 * s + 0.2 * s, pz] })
    }
  }
  return bag.build()
}

// ============================================================
// MURI, STRADE, LAMPIONI, PORTONI (remaster)
// ============================================================

function buildMuretto(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietra', c, { roughness: 0.98, rx: 1.4, ry: 0.7 })
  const coping = pbrMat('pietraSquadrata', trimShade(c, -0.08), { roughness: 0.95, rx: 1.4 })
  bag.add(new THREE.BoxGeometry(0.98, 0.42, 0.2), stone, { p: [0, 0.21, 0] })
  bag.add(new THREE.BoxGeometry(1.0, 0.06, 0.26), coping, { p: [0, 0.45, 0] })
  return bag.build()
}

function buildMuroAlto(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietraSquadrata', c, { roughness: 0.95, rx: 1.2, ry: 2 })
  const stoneD = pbrMat('pietraSquadrata', trimShade(c, -0.1), { roughness: 0.95, rx: 1.2 })
  // basamento + cortina + merli sui 4 angoli + camminamento
  bag.add(new THREE.BoxGeometry(1.0, 0.14, 1.0), stoneD, { p: [0, 0.07, 0] })
  bag.add(new THREE.BoxGeometry(0.92, 1.5, 0.92), stone, { p: [0, 0.14 + 0.75, 0] })
  bag.add(new THREE.BoxGeometry(0.98, 0.06, 0.98), stoneD, { p: [0, 1.68, 0] })
  for (const [mx, mz] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]] as const) {
    bag.add(new THREE.BoxGeometry(0.22, 0.22, 0.22), stoneD, { p: [mx, 1.82, mz] })
  }
  return bag.build()
}

function buildStrada(links?: RoadLinks): THREE.Group {
  const L = links ?? { n: false, e: false, s: false, w: false }
  const bag = new Bag()
  const cobble = pbrMat('ciottoli', '#8d8578', { roughness: 0.95 })
  const curb = pbrMat('pietraSquadrata', '#7d7568', { roughness: 0.95, rx: 1.2 })
  bag.add(new THREE.BoxGeometry(0.96, 0.04, 0.96), cobble, { p: [0, 0.021, 0] })
  const arm = (x: number, z: number, w: number, d: number) =>
    bag.add(new THREE.BoxGeometry(w, 0.04, d), cobble, { p: [x, 0.021, z] })
  if (L.n) arm(0, -0.5, 0.42, 0.52)
  if (L.s) arm(0, 0.5, 0.42, 0.52)
  if (L.e) arm(0.5, 0, 0.52, 0.42)
  if (L.w) arm(-0.5, 0, 0.52, 0.42)
  // cordoli sui lati SENZA collegamento
  if (!L.n) bag.add(new THREE.BoxGeometry(0.96, 0.055, 0.05), curb, { p: [0, 0.027, -0.46] })
  if (!L.s) bag.add(new THREE.BoxGeometry(0.96, 0.055, 0.05), curb, { p: [0, 0.027, 0.46] })
  if (!L.e) bag.add(new THREE.BoxGeometry(0.05, 0.055, 0.96), curb, { p: [0.46, 0.027, 0] })
  if (!L.w) bag.add(new THREE.BoxGeometry(0.05, 0.055, 0.96), curb, { p: [-0.46, 0.027, 0] })
  return bag.build(false) // piatta: non proietta ombra
}

function buildStradaRialzata(): THREE.Group {
  const bag = new Bag()
  const stone = pbrMat('pietraSquadrata', '#a8a29a', { roughness: 0.95, rx: 1.2, ry: 0.6 })
  const top = pbrMat('ciottoli', '#8d8578', { roughness: 0.95 })
  const parapet = pbrMat('pietra', '#98928a', { roughness: 0.98, rx: 1.4 })
  bag.add(new THREE.BoxGeometry(0.98, 0.5, 0.98), stone, { p: [0, 0.25, 0] })
  bag.add(new THREE.BoxGeometry(0.9, 0.07, 0.9), top, { p: [0, 0.535, 0] })
  for (const x of [-0.42, 0.42]) {
    bag.add(new THREE.BoxGeometry(0.09, 0.16, 0.98), parapet, { p: [x, 0.63, 0] })
  }
  return bag.build()
}

function buildPortone(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietraSquadrata', c, { roughness: 0.95, rx: 0.5, ry: 1.6 })
  const stoneD = pbrMat('pietraSquadrata', trimShade(c, -0.1), { roughness: 0.95 })
  const wood = pbrMat('legno', '#5d4033', { roughness: 0.9, rx: 0.5, ry: 1 })
  // pilastri con capitello
  for (const x of [-0.36, 0.36]) {
    bag.add(new THREE.BoxGeometry(0.24, 1.0, 0.24), stone, { p: [x, 0.5, 0] })
    bag.add(new THREE.BoxGeometry(0.3, 0.07, 0.3), stoneD, { p: [x, 1.03, 0] })
    bag.add(new THREE.BoxGeometry(0.3, 0.08, 0.3), stoneD, { p: [x, 0.05, 0] })
  }
  // arco (semitoro) + riempimento
  bag.add(new THREE.TorusGeometry(0.31, 0.075, 8, 14, Math.PI), stone, { p: [0, 0.86, 0] })
  bag.add(new THREE.BoxGeometry(0.62, 0.12, 0.24), stone, { p: [0, 1.06, 0] })
  // merletti sopra
  for (const x of [-0.36, 0, 0.36]) {
    bag.add(new THREE.BoxGeometry(0.14, 0.12, 0.2), stoneD, { p: [x, 1.17, 0] })
  }
  // doppio battente in legno
  bag.add(new THREE.BoxGeometry(0.26, 0.72, 0.05), wood, { p: [-0.14, 0.36, 0] })
  bag.add(new THREE.BoxGeometry(0.26, 0.72, 0.05), wood, { p: [0.14, 0.36, 0] })
  // rinforvi in ferro
  const iron = pbrMat('metallo', '#3a3a3e', { metalness: 0.8, roughness: 0.5 })
  bag.add(new THREE.BoxGeometry(0.56, 0.04, 0.06), iron, { p: [0, 0.55, 0.01] })
  bag.add(new THREE.BoxGeometry(0.56, 0.04, 0.06), iron, { p: [0, 0.2, 0.01] })
  return bag.build()
}

function buildLampioncino(): THREE.Group {
  const bag = new Bag()
  const iron = pbrMat('metallo', '#2f2b28', { metalness: 0.7, roughness: 0.55 })
  const glass = new THREE.MeshStandardMaterial({
    color: '#ffd98a',
    emissive: '#ffb84c',
    emissiveIntensity: 1.1,
    roughness: 0.25,
  })
  bag.add(new THREE.CylinderGeometry(0.07, 0.09, 0.05, 10), iron, { p: [0, 0.025, 0] })
  bag.add(new THREE.CylinderGeometry(0.022, 0.032, 0.86, 8), iron, { p: [0, 0.47, 0] })
  bag.add(new THREE.CylinderGeometry(0.018, 0.018, 0.2, 6), iron, { p: [0, 0.94, 0], r: [0, 0, Math.PI / 2] })
  // lanterna appesa
  bag.add(new THREE.BoxGeometry(0.1, 0.14, 0.1), glass, { p: [0.1, 0.83, 0] })
  bag.add(new THREE.ConeGeometry(0.09, 0.07, 4), iron, { p: [0.1, 0.93, 0], r: [0, Math.PI / 4, 0] })
  return bag.build()
}

// ============================================================
// ESTERNI STILE HOMEBYME (nuovi)
// ============================================================

function buildStaccionata(color: number): THREE.Group {
  const bag = new Bag()
  const wood = pbrMat('legno', trimShade(wallColorOf(color), -0.08), { roughness: 0.9, rx: 1.4, ry: 0.5 })
  const woodD = pbrMat('legno', '#5d4430', { roughness: 0.92, rx: 1.4 })
  // paletti con punta
  for (const x of [-0.44, 0, 0.44]) {
    bag.add(new THREE.BoxGeometry(0.07, 0.46, 0.07), wood, { p: [x, 0.23, 0] })
    bag.add(new THREE.ConeGeometry(0.05, 0.07, 4), woodD, { p: [x, 0.49, 0], r: [0, Math.PI / 4, 0] })
  }
  // traverse
  bag.add(new THREE.BoxGeometry(1.0, 0.06, 0.045), woodD, { p: [0, 0.36, 0] })
  bag.add(new THREE.BoxGeometry(1.0, 0.06, 0.045), woodD, { p: [0, 0.16, 0] })
  return bag.build()
}

function buildSiepe(): THREE.Group {
  const bag = new Bag()
  const leaf = pbrMat('foglie', '#3f6b34', { roughness: 0.95, rx: 2, ry: 1.4 })
  const leafL = pbrMat('foglie', '#4a7a3c', { roughness: 0.95, rx: 2, ry: 1.4 })
  bag.add(
    jittered(new THREE.BoxGeometry(0.94, 0.58, 0.62, 4, 3, 3), 0.035, 109),
    leaf,
    { p: [0, 0.29, 0] }
  )
  bag.add(
    jittered(new THREE.BoxGeometry(0.9, 0.12, 0.58, 3, 2, 2), 0.03, 113),
    leafL,
    { p: [0, 0.6, 0] }
  )
  return bag.build()
}

function buildVialetto(): THREE.Group {
  const bag = new Bag()
  const gravel = pbrMat('ghiaia', '#b0a48e', { roughness: 0.98 })
  bag.add(new THREE.BoxGeometry(0.96, 0.045, 0.96), gravel, { p: [0, 0.022, 0] })
  // bordo in pietra irregolare
  const stone = pbrMat('pietra', '#9a9186', { roughness: 0.98, rx: 1.6 })
  bag.add(new THREE.BoxGeometry(0.98, 0.05, 0.07), stone, { p: [0, 0.025, -0.45] })
  bag.add(new THREE.BoxGeometry(0.98, 0.05, 0.07), stone, { p: [0, 0.025, 0.45] })
  return bag.build(false)
}

function buildAiuola(color: number): THREE.Group {
  const bag = new Bag()
  const tint = wallColorOf(color)
  const soil = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 1 })
  const stone = pbrMat('pietra', '#a89a8a', { roughness: 0.98, rx: 1.6 })
  // terreno + bordo
  bag.add(new THREE.BoxGeometry(0.8, 0.07, 0.8), soil, { p: [0, 0.035, 0] })
  bag.add(new THREE.BoxGeometry(0.94, 0.09, 0.1), stone, { p: [0, 0.045, -0.42] })
  bag.add(new THREE.BoxGeometry(0.94, 0.09, 0.1), stone, { p: [0, 0.045, 0.42] })
  bag.add(new THREE.BoxGeometry(0.1, 0.09, 0.94), stone, { p: [-0.42, 0.045, 0] })
  bag.add(new THREE.BoxGeometry(0.1, 0.09, 0.94), stone, { p: [0.42, 0.045, 0] })
  // fiori (stelo + corolla colorata)
  const spots: [number, number, string][] = [
    [-0.22, -0.18, '#d9534f'],
    [0.16, -0.24, '#e3b93e'],
    [0.26, 0.14, '#c2368f'],
    [-0.12, 0.22, '#e087ab'],
    [0.02, -0.02, '#e0762e'],
    [-0.3, 0.08, '#f2f2ee'],
  ]
  const stem = pbrMat('foglie', '#3f6b34', { roughness: 0.95 })
  for (const [fx, fz, fc] of spots) {
    bag.add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 5), stem, { p: [fx, 0.15, fz] })
    bag.add(
      new THREE.SphereGeometry(0.045, 8, 6),
      new THREE.MeshStandardMaterial({ color: fc, roughness: 0.8 }),
      { p: [fx, 0.24, fz] }
    )
  }
  void tint
  return bag.build(false)
}

function buildPanchina(color: number): THREE.Group {
  const bag = new Bag()
  const wood = pbrMat('legno', trimShade(wallColorOf(color), -0.05), { roughness: 0.9, rx: 1.2, ry: 0.4 })
  const iron = pbrMat('metallo', '#2f2b28', { metalness: 0.7, roughness: 0.5 })
  // gambe in ferro
  for (const x of [-0.34, 0.34]) {
    bag.add(new THREE.BoxGeometry(0.05, 0.24, 0.34), iron, { p: [x, 0.12, 0] })
    bag.add(new THREE.BoxGeometry(0.05, 0.22, 0.05), iron, { p: [x, 0.33, -0.15], r: [-0.25, 0, 0] })
  }
  // seduta (3 listelli)
  for (const z of [-0.11, 0, 0.11]) {
    bag.add(new THREE.BoxGeometry(0.86, 0.035, 0.08), wood, { p: [0, 0.25, z] })
  }
  // schienale (2 listelli inclinati)
  for (const y of [0.38, 0.5]) {
    bag.add(new THREE.BoxGeometry(0.86, 0.07, 0.03), wood, { p: [0, y, -0.21], r: [0.22, 0, 0] })
  }
  return bag.build()
}

function buildPergolato(color: number): THREE.Group {
  const bag = new Bag()
  const wood = pbrMat('legno', trimShade(wallColorOf(color), -0.1), { roughness: 0.9, rx: 1.4, ry: 0.4 })
  const leaf = pbrMat('foglie', '#4a7a3c', { roughness: 0.95, rx: 1.6, ry: 0.5 })
  // 4 montanti
  for (const [px, pz] of [[-0.36, -0.36], [0.36, -0.36], [-0.36, 0.36], [0.36, 0.36]] as const) {
    bag.add(new THREE.BoxGeometry(0.09, 1.0, 0.09), wood, { p: [px, 0.5, pz] })
  }
  // 2 travi principali + 4 traverse
  for (const z of [-0.36, 0.36]) {
    bag.add(new THREE.BoxGeometry(0.94, 0.08, 0.08), wood, { p: [0, 1.02, z] })
  }
  for (const x of [-0.36, -0.12, 0.12, 0.36]) {
    bag.add(new THREE.BoxGeometry(0.07, 0.06, 0.9), wood, { p: [x, 1.08, 0] })
  }
  // vite sul montante + tralcio in cima
  bag.add(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), leaf, { p: [-0.36, 0.5, 0.34], r: [0.06, 0, 0.06] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.13, 1), 0.03, 127), leaf, { p: [-0.3, 1.06, 0.3] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.1, 1), 0.03, 131), leaf, { p: [0.18, 1.1, -0.3] })
  return bag.build()
}

function buildFontana(color: number): THREE.Group {
  const bag = new Bag()
  const stone = pbrMat('pietraSquadrata', wallColorOf(color), { roughness: 0.9, rx: 1.6, ry: 0.5 })
  const stoneD = pbrMat('pietra', '#8d8478', { roughness: 0.98 })
  const water = new THREE.MeshStandardMaterial({
    color: '#3f7f96',
    roughness: 0.12,
    metalness: 0.15,
    emissive: '#1a4a5a',
    emissiveIntensity: 0.15,
  })
  // vasca esterna + acqua
  bag.add(new THREE.CylinderGeometry(0.42, 0.46, 0.16, 16), stone, { p: [0, 0.08, 0] })
  bag.add(new THREE.CylinderGeometry(0.38, 0.38, 0.03, 16), water, { p: [0, 0.15, 0] })
  // colonna + vaschetta + getto
  bag.add(new THREE.CylinderGeometry(0.05, 0.07, 0.34, 10), stoneD, { p: [0, 0.32, 0] })
  bag.add(new THREE.CylinderGeometry(0.16, 0.1, 0.07, 12), stone, { p: [0, 0.52, 0] })
  bag.add(new THREE.CylinderGeometry(0.03, 0.045, 0.18, 8), water, { p: [0, 0.63, 0] })
  bag.add(new THREE.SphereGeometry(0.045, 8, 6), water, { p: [0, 0.73, 0] })
  return bag.build()
}

function buildVaso(color: number): THREE.Group {
  const bag = new Bag()
  const terracotta = pbrMat('mattoni', '#b06a4a', { roughness: 0.95, rx: 0.8, ry: 0.5 })
  const soil = new THREE.MeshStandardMaterial({ color: '#4a3826', roughness: 1 })
  const leaf = pbrMat('foglie', '#4a7a3c', { roughness: 0.95, rx: 1.4, ry: 1 })
  const c = wallColorOf(color)
  bag.add(new THREE.CylinderGeometry(0.2, 0.15, 0.26, 12), terracotta, { p: [0, 0.13, 0] })
  bag.add(new THREE.CylinderGeometry(0.225, 0.225, 0.05, 12), terracotta, { p: [0, 0.27, 0] })
  bag.add(new THREE.CylinderGeometry(0.185, 0.185, 0.03, 12), soil, { p: [0, 0.28, 0] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.16, 2), 0.04, 137), leaf, { p: [0, 0.42, 0], s: [1, 0.9, 1] })
  bag.add(jittered(new THREE.IcosahedronGeometry(0.1, 1), 0.03, 139), pbrMat('foglie', c, { roughness: 0.95 }), { p: [0.09, 0.5, 0.05] })
  // fiore
  bag.add(
    new THREE.SphereGeometry(0.035, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#e3b93e', roughness: 0.8 }),
    { p: [-0.08, 0.55, -0.04] }
  )
  return bag.build()
}

// ============================================================
// Componenti React (con cache delle geometrie fuse)
// ============================================================

const builtCache = new Map<string, THREE.Group>()

function cachedBuild(key: string, make: () => THREE.Group): THREE.Group {
  let g = builtCache.get(key)
  if (!g) {
    g = make()
    builtCache.set(key, g)
  }
  // ogni istanza clona la gerarchia (geometrie e materiali RESTANO condivisi)
  return g.clone()
}

function AssetFromBuilder({
  builder,
  color,
  rot,
  cacheKey,
}: {
  builder: (color: number) => THREE.Group
  color: number
  rot: number
  cacheKey: string
}) {
  const obj = useMemo(() => cachedBuild(`${cacheKey}:${color}`, () => builder(color)), [builder, color, cacheKey])
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <primitive object={obj} dispose={null} />
    </group>
  )
}

function Casa({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildCasa} color={color} rot={rot} cacheKey="casa" />
}
function Casatorre({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildCasatorre} color={color} rot={rot} cacheKey="casatorre" />
}
function Torre({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildTorre} color={color} rot={rot} cacheKey="torre" />
}
function Albero({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildAlbero()} color={0} rot={rot} cacheKey="albero" />
}
function Pino({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildPino()} color={0} rot={rot} cacheKey="pino" />
}
function Cespuglio({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildCespuglio} color={color} rot={rot} cacheKey="cespuglio" />
}
function Roccia({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildRoccia()} color={0} rot={rot} cacheKey="roccia" />
}
function Collina({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildCollina(false)} color={0} rot={rot} cacheKey="collina" />
}
function CollinaAlta({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildCollina(true)} color={0} rot={rot} cacheKey="collinaAlta" />
}
function Muro({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildMuretto} color={color} rot={rot} cacheKey="muretto" />
}
function MuroAlto({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildMuroAlto} color={color} rot={rot} cacheKey="muroAlto" />
}
function Strada({ rot, links }: AssetRenderProps) {
  const obj = useMemo(
    () => cachedBuild(`strada:${links ? 'nlk' : 'base'}`, () => buildStrada(links)),
    [links]
  )
  void rot
  return <primitive object={obj} dispose={null} />
}
function StradaRialzata({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildStradaRialzata()} color={0} rot={rot} cacheKey="stradaRialzata" />
}
function Portone({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildPortone} color={color} rot={rot} cacheKey="portone" />
}
function Lampioncino({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildLampioncino} color={0} rot={rot} cacheKey="lampioncino" />
}
function Staccionata({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildStaccionata} color={color} rot={rot} cacheKey="staccionata" />
}
function Siepe({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildSiepe()} color={0} rot={rot} cacheKey="siepe" />
}
function Vialetto({ rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={() => buildVialetto()} color={0} rot={rot} cacheKey="vialetto" />
}
function Aiuola({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildAiuola} color={color} rot={rot} cacheKey="aiuola" />
}
function Panchina({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildPanchina} color={color} rot={rot} cacheKey="panchina" />
}
function Pergolato({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildPergolato} color={color} rot={rot} cacheKey="pergolato" />
}
function Fontana({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildFontana} color={color} rot={rot} cacheKey="fontana" />
}
function Vaso({ color, rot }: AssetRenderProps) {
  return <AssetFromBuilder builder={buildVaso} color={color} rot={rot} cacheKey="vaso" />
}

// ============================================================
// Pezzi da costruzione (designer di strutture)
// ------------------------------------------------------------
// v7: MURI, PORTE E FINESTRE APPONGGIANO SUL BORDO della cella
// (z = -0.5, ruotando si sceglie il lato). Pavimenti e tetti
// restano centrati. Nuovi pezzi da esterno in fondo.
// ============================================================

export type PieceType =
  | 'pavimento'
  | 'muroP'
  | 'portaP'
  | 'finestraP'
  | 'tettoP'
  | 'colonnaP'
  | 'scalaP'
  | 'recinzioneP'
  | 'siepeP'
  | 'vialettoP'
  | 'aiuolaP'
  | 'panchinaP'

export type StructurePiece = {
  p: PieceType
  x: number // colonna
  y: number // livello (0 = terra)
  z: number // riga
  rot: number // 0..3
  color: number
}

/** bordo della cella su cui appoggia il pezzo ruotato (per la logica di collisione) */
export function pieceEdgeOffset(): number {
  return -0.5 // i pezzi "a muro" stanno sulla linea di confine nord (rot 0)
}

function buildPavimentoP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietraSquadrata', c, { roughness: 0.9, rx: 1, ry: 1 })
  bag.add(new THREE.BoxGeometry(0.98, 0.09, 0.98), stone, { p: [0, 0.045, 0] })
  bag.add(new THREE.BoxGeometry(0.9, 0.02, 0.9), pbrMat('pietra', trimShade(c, 0.06), { roughness: 0.9, rx: 1 }), {
    p: [0, 0.1, 0],
  })
  return bag.build(false)
}

function buildMuroP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const brick = pbrMat('mattoni', c, { roughness: 0.92, rx: 1.3, ry: 1.2 })
  const coping = pbrMat('pietraSquadrata', trimShade(c, -0.1), { roughness: 0.92, rx: 1.3 })
  // MURO SUL BORDO della cella: z = -0.5
  bag.add(new THREE.BoxGeometry(1.04, 0.94, 0.15), brick, { p: [0, 0.47, -0.5] })
  bag.add(new THREE.BoxGeometry(1.08, 0.06, 0.21), coping, { p: [0, 0.97, -0.5] })
  return bag.build()
}

function buildPortaP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const brick = pbrMat('mattoni', c, { roughness: 0.92, rx: 1.3, ry: 1.2 })
  const wood = pbrMat('legno', '#5d4033', { roughness: 0.9, rx: 0.5, ry: 1 })
  const woodL = pbrMat('legno', '#6b4a38', { roughness: 0.92 })
  const z = -0.5
  // fregi laterale + architrave (sul bordo)
  bag.add(new THREE.BoxGeometry(0.31, 0.94, 0.15), brick, { p: [-0.365, 0.47, z] })
  bag.add(new THREE.BoxGeometry(0.31, 0.94, 0.15), brick, { p: [0.365, 0.47, z] })
  bag.add(new THREE.BoxGeometry(1.04, 0.24, 0.15), brick, { p: [0, 0.82, z] })
  // battente + telaio
  bag.add(new THREE.BoxGeometry(0.46, 0.07, 0.1), woodL, { p: [0, 0.73, z] })
  bag.add(new THREE.BoxGeometry(0.04, 0.7, 0.1), woodL, { p: [-0.21, 0.35, z] })
  bag.add(new THREE.BoxGeometry(0.04, 0.7, 0.1), woodL, { p: [0.21, 0.35, z] })
  bag.add(new THREE.BoxGeometry(0.38, 0.68, 0.05), wood, { p: [0, 0.34, z] })
  bag.add(
    new THREE.SphereGeometry(0.02, 8, 6),
    pbrMat('metallo', '#3a3a3e', { metalness: 0.85, roughness: 0.4 }),
    { p: [0.13, 0.32, z + 0.04] }
  )
  // gradino
  bag.add(
    new THREE.BoxGeometry(0.56, 0.05, 0.2),
    pbrMat('pietraSquadrata', '#a89a8a', { roughness: 0.95 }),
    { p: [0, 0.025, z + 0.06] }
  )
  return bag.build()
}

function buildFinestraP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const brick = pbrMat('mattoni', c, { roughness: 0.92, rx: 1.3, ry: 1.2 })
  const wood = pbrMat('legno', '#6e4a2c', { roughness: 0.88 })
  const z = -0.5
  // muro sotto + sopra + lati (sul bordo)
  bag.add(new THREE.BoxGeometry(1.04, 0.34, 0.15), brick, { p: [0, 0.17, z] })
  bag.add(new THREE.BoxGeometry(1.04, 0.3, 0.15), brick, { p: [0, 0.85, z] })
  bag.add(new THREE.BoxGeometry(0.28, 0.36, 0.15), brick, { p: [-0.38, 0.5, z] })
  bag.add(new THREE.BoxGeometry(0.28, 0.36, 0.15), brick, { p: [0.38, 0.5, z] })
  // telaio + vetro
  bag.add(new THREE.BoxGeometry(0.6, 0.05, 0.09), wood, { p: [0, 0.31, z] })
  bag.add(new THREE.BoxGeometry(0.6, 0.05, 0.09), wood, { p: [0, 0.69, z] })
  bag.add(new THREE.BoxGeometry(0.05, 0.42, 0.09), wood, { p: [-0.275, 0.5, z] })
  bag.add(new THREE.BoxGeometry(0.05, 0.42, 0.09), wood, { p: [0.275, 0.5, z] })
  bag.add(new THREE.BoxGeometry(0.04, 0.4, 0.06), wood, { p: [0, 0.5, z] })
  bag.add(
    new THREE.BoxGeometry(0.5, 0.32, 0.02),
    new THREE.MeshStandardMaterial({
      color: '#cfe6f0',
      emissive: '#a8cfdf',
      emissiveIntensity: 0.3,
      roughness: 0.15,
    }),
    { p: [0, 0.5, z + 0.02] }
  )
  // davanzale
  bag.add(
    new THREE.BoxGeometry(0.66, 0.04, 0.16),
    pbrMat('pietra', '#b3a894', { roughness: 0.9 }),
    { p: [0, 0.135, z + 0.02] }
  )
  return bag.build()
}

function buildTettoP(color: number): THREE.Group {
  const bag = new Bag()
  const c = roofColorOf(color)
  const roof = pbrMat('coppi', c, { roughness: 0.85, rx: 1.2, ry: 1 })
  bag.add(new THREE.ConeGeometry(0.76, 0.56, 4), roof, { p: [0, 0.28, 0], r: [0, Math.PI / 4, 0] })
  bag.add(
    new THREE.BoxGeometry(0.2, 0.07, 0.2),
    pbrMat('coppi', trimShade(c, -0.08), { roughness: 0.88 }),
    { p: [0, 0.57, 0], r: [0, Math.PI / 4, 0] }
  )
  return bag.build()
}

function buildColonnaP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietraSquadrata', c, { roughness: 0.85, rx: 0.4, ry: 1.2 })
  bag.add(new THREE.BoxGeometry(0.34, 0.1, 0.34), stone, { p: [0, 0.05, 0] })
  bag.add(new THREE.CylinderGeometry(0.105, 0.125, 0.86, 12), stone, { p: [0, 0.55, 0] })
  bag.add(new THREE.BoxGeometry(0.32, 0.09, 0.32), stone, { p: [0, 1.02, 0] })
  return bag.build()
}

function buildScalaP(color: number): THREE.Group {
  const bag = new Bag()
  const c = wallColorOf(color)
  const stone = pbrMat('pietraSquadrata', c, { roughness: 0.9, rx: 1.2, ry: 0.4 })
  for (let i = 0; i < 3; i++) {
    bag.add(new THREE.BoxGeometry(0.98, (i + 1) * 0.32, 0.34), stone, {
      p: [0, ((i + 1) * 0.32) / 2, 0.33 - i * 0.33],
    })
  }
  return bag.build()
}

function buildRecinzioneP(color: number): THREE.Group {
  const bag = new Bag()
  const wood = pbrMat('legno', trimShade(wallColorOf(color), -0.08), { roughness: 0.9, rx: 1.4, ry: 0.5 })
  const z = -0.5
  for (const x of [-0.44, 0, 0.44]) {
    bag.add(new THREE.BoxGeometry(0.07, 0.52, 0.07), wood, { p: [x, 0.26, z] })
    bag.add(new THREE.ConeGeometry(0.05, 0.08, 4), wood, { p: [x, 0.56, z], r: [0, Math.PI / 4, 0] })
  }
  bag.add(new THREE.BoxGeometry(1.02, 0.06, 0.045), wood, { p: [0, 0.4, z] })
  bag.add(new THREE.BoxGeometry(1.02, 0.06, 0.045), wood, { p: [0, 0.18, z] })
  return bag.build()
}

function buildSiepeP(): THREE.Group {
  const bag = new Bag()
  const leaf = pbrMat('foglie', '#3f6b34', { roughness: 0.95, rx: 2, ry: 1.2 })
  bag.add(jittered(new THREE.BoxGeometry(0.94, 0.6, 0.66, 4, 3, 3), 0.035, 149), leaf, { p: [0, 0.3, 0] })
  return bag.build()
}

function buildVialettoP(): THREE.Group {
  const bag = new Bag()
  const gravel = pbrMat('ghiaia', '#b0a48e', { roughness: 0.98 })
  bag.add(new THREE.BoxGeometry(0.98, 0.06, 0.98), gravel, { p: [0, 0.03, 0] })
  return bag.build(false)
}

function buildAiuolaP(color: number): THREE.Group {
  const obj = buildAiuola(color)
  return obj
}

function buildPanchinaP(color: number): THREE.Group {
  return buildPanchina(color)
}

export type PieceDef = {
  id: PieceType
  label: string
  icon: string
  render: (props: { color: number; rot: number }) => ReactNode
}

const PIECE_RENDERERS: Record<PieceType, (props: { color: number; rot: number }) => ReactNode> = {
  pavimento: ({ color, rot }) => <AssetFromBuilder builder={buildPavimentoP} color={color} rot={rot} cacheKey="pPav" />,
  muroP: ({ color, rot }) => <AssetFromBuilder builder={buildMuroP} color={color} rot={rot} cacheKey="pMuro" />,
  portaP: ({ color, rot }) => <AssetFromBuilder builder={buildPortaP} color={color} rot={rot} cacheKey="pPorta" />,
  finestraP: ({ color, rot }) => <AssetFromBuilder builder={buildFinestraP} color={color} rot={rot} cacheKey="pFin" />,
  tettoP: ({ color, rot }) => <AssetFromBuilder builder={buildTettoP} color={color} rot={rot} cacheKey="pTetto" />,
  colonnaP: ({ color, rot }) => <AssetFromBuilder builder={buildColonnaP} color={color} rot={rot} cacheKey="pCol" />,
  scalaP: ({ color, rot }) => <AssetFromBuilder builder={buildScalaP} color={color} rot={rot} cacheKey="pScala" />,
  recinzioneP: ({ color, rot }) => <AssetFromBuilder builder={buildRecinzioneP} color={color} rot={rot} cacheKey="pRec" />,
  siepeP: ({ color, rot }) => <AssetFromBuilder builder={() => buildSiepeP()} color={0} rot={rot} cacheKey="pSiepe" />,
  vialettoP: ({ color, rot }) => <AssetFromBuilder builder={() => buildVialettoP()} color={0} rot={rot} cacheKey="pVia" />,
  aiuolaP: ({ color, rot }) => <AssetFromBuilder builder={buildAiuolaP} color={color} rot={rot} cacheKey="pAiu" />,
  panchinaP: ({ color, rot }) => <AssetFromBuilder builder={buildPanchinaP} color={color} rot={rot} cacheKey="pPan" />,
}

export const PIECE_DEFS: PieceDef[] = [
  { id: 'pavimento', label: 'Pavimento', icon: '🟫', render: PIECE_RENDERERS.pavimento },
  { id: 'muroP', label: 'Muro', icon: '🧱', render: PIECE_RENDERERS.muroP },
  { id: 'portaP', label: 'Porta', icon: '🚪', render: PIECE_RENDERERS.portaP },
  { id: 'finestraP', label: 'Finestra', icon: '🪟', render: PIECE_RENDERERS.finestraP },
  { id: 'tettoP', label: 'Tetto', icon: '🔺', render: PIECE_RENDERERS.tettoP },
  { id: 'colonnaP', label: 'Colonna', icon: '🏛️', render: PIECE_RENDERERS.colonnaP },
  { id: 'scalaP', label: 'Scala', icon: '🪜', render: PIECE_RENDERERS.scalaP },
  { id: 'recinzioneP', label: 'Recinzione', icon: '🚧', render: PIECE_RENDERERS.recinzioneP },
  { id: 'siepeP', label: 'Siepe', icon: '🌿', render: PIECE_RENDERERS.siepeP },
  { id: 'vialettoP', label: 'Vialetto', icon: '🥾', render: PIECE_RENDERERS.vialettoP },
  { id: 'aiuolaP', label: 'Aiuola', icon: '🌷', render: PIECE_RENDERERS.aiuolaP },
  { id: 'panchinaP', label: 'Panchina', icon: '🪑', render: PIECE_RENDERERS.panchinaP },
]

export function getPieceDef(id: PieceType): PieceDef | null {
  return PIECE_DEFS.find(p => p.id === id) ?? null
}

/** Rende una struttura composta salvata (usata anche dal designer) */
export function StructureModel({
  pieces,
  rot = 0,
}: {
  pieces: StructurePiece[]
  rot?: number
}) {
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      {pieces.map((pc, i) => {
        const def = getPieceDef(pc.p)
        if (!def) return null
        return (
          <group key={`${pc.x}-${pc.y}-${pc.z}-${pc.p}-${i}`} position={[pc.x, pc.y, pc.z]}>
            {def.render({ color: pc.color, rot: pc.rot })}
          </group>
        )
      })}
    </group>
  )
}

// ---------- GLB custom ----------

export function GlbModel({ url, rot, scale = 1 }: { url: string; rot: number; scale?: number }) {
  const { scene } = useGLTF(url)
  const cloned = useMemo(() => {
    const c = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const s = (1.4 / maxDim) * Math.min(3, Math.max(0.2, scale))
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y = -box2.min.y
    c.position.x = -(box2.min.x + box2.max.x) / 2
    c.position.z = -(box2.min.z + box2.max.z) / 2
    return c
  }, [scene, scale])
  return (
    <group rotation={[0, (rot * Math.PI) / 2, 0]}>
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

// ---------- registry ----------

export const BUILTIN_ASSETS: AssetDef[] = [
  {
    id: 'casa',
    label: 'Casa',
    icon: '🏠',
    desc: 'Cottage realistico: zoccolo in pietra, muri intonacati, tetto in coppi, comignolo e finestre con telaio.',
    render: Casa,
  },
  {
    id: 'casatorre',
    label: 'Casa a torre',
    icon: '🏘️',
    desc: 'Casa a due piani con corsi in pietra, abbaino sul tetto e doppia fila di finestre.',
    render: Casatorre,
  },
  {
    id: 'torre',
    label: 'Torre',
    icon: '🗼',
    desc: 'Torre di guardia in pietra squadrata con merlatura, feritoie e bandiera.',
    render: Torre,
  },
  {
    id: 'strada',
    label: 'Strada',
    icon: '🛣️',
    desc: 'Strada in sampietrini con cordoli: si collega da sola alle strade vicine e ci si cammina sopra.',
    walkable: true,
    walkHeight: 0.04,
    render: Strada,
  },
  {
    id: 'muro',
    label: 'Muretto',
    icon: '🧱',
    desc: 'Muretto a secco con cimasa in pietra, per recintare giardini e orti.',
    render: Muro,
  },
  {
    id: 'muroAlto',
    label: 'Muro alto',
    icon: '🏰',
    desc: 'Cortina fortificata in blocchi squadrati con merli d\u2019angolo: occupa tutto il quadrato.',
    render: MuroAlto,
  },
  {
    id: 'collina',
    label: 'Collina',
    icon: '⛰️',
    desc: 'Collinetta erbosa su cui puoi salire: spezza la pianura e crea panorami.',
    walkable: true,
    walkHeight: 0.42,
    render: Collina,
  },
  {
    id: 'collinaAlta',
    label: 'Collina alta',
    icon: '🏔️',
    desc: 'Grande altura con cresta rocciosa e pini: la mappa diventa verticale.',
    walkable: true,
    walkHeight: 0.85,
    render: CollinaAlta,
  },
  {
    id: 'stradaRialzata',
    label: 'Strada rialzata',
    icon: '🌉',
    desc: 'Strada sopraelevata in pietra con parapetti: attraversa colline e dislivelli.',
    walkable: true,
    walkHeight: 0.56,
    render: StradaRialzata,
  },
  {
    id: 'portone',
    label: 'Portone',
    icon: '🚪',
    desc: 'Porta cittadina in pietra con arco, doppio battente ligneo e merletti.',
    render: Portone,
  },
  {
    id: 'albero',
    label: 'Albero',
    icon: '🌳',
    desc: 'Quercia con tronco rastremato e chioma frastagliata: perfetta per giardini e viali.',
    render: Albero,
  },
  {
    id: 'pino',
    label: 'Pino',
    icon: '🌲',
    desc: 'Pino a quattro palchi di aghi, ideale per boschi e montagne.',
    render: Pino,
  },
  {
    id: 'cespuglio',
    label: 'Cespuglio',
    icon: '🌿',
    desc: 'Cespuglio pieno e irregolare che prende il colore scelto.',
    render: Cespuglio,
  },
  {
    id: 'roccia',
    label: 'Roccia',
    icon: '🪨',
    desc: 'Masso erratico sfaccettato per laghi, montagne e decorazioni naturali.',
    render: Roccia,
  },
  {
    id: 'lampioncino',
    label: 'Lampioncino',
    icon: '🏮',
    desc: 'Lampada in ferro battuto con lanterna calda appesa: illumina strade e sentieri.',
    render: Lampioncino,
  },
  // ---- ESTERNI stile HomeByMe (v7) ----
  {
    id: 'staccionata',
    label: 'Staccionata',
    icon: '🚧',
    desc: 'Recinzione in legno con paletti a punta: delimita giardini e vialetti.',
    render: Staccionata,
  },
  {
    id: 'siepe',
    label: 'Siepe',
    icon: '🌿',
    desc: 'Siepe boschiva fitta e scolpita: muro verde per bordi e labirinti.',
    render: Siepe,
  },
  {
    id: 'vialetto',
    label: 'Vialetto',
    icon: '🥾',
    desc: 'Sentiero in ghiaia con bordi in pietra: ci si cammina sopra, perfetto tra cancello e porta.',
    walkable: true,
    walkHeight: 0.05,
    render: Vialetto,
  },
  {
    id: 'aiuola',
    label: 'Aiuola',
    icon: '🌷',
    desc: 'Aiuola fiorita con bordo in pietra e fiori colorati: tocco da giardino curato.',
    render: Aiuola,
  },
  {
    id: 'panchina',
    label: 'Panchina',
    icon: '🪑',
    desc: 'Panchina da parco con gambe in ferro e listelli in legno.',
    render: Panchina,
  },
  {
    id: 'pergolato',
    label: 'Pergolato',
    icon: '⛩️',
    desc: 'Pergolato in legno con traliccio e vite: crea zone d\u2019ombra eleganti.',
    render: Pergolato,
  },
  {
    id: 'fontana',
    label: 'Fontana',
    icon: '⛲',
    desc: 'Fontana in pietra con vasca, colonna e getto d\u2019acqua: centro perfetto per piazze e giardini.',
    render: Fontana,
  },
  {
    id: 'vaso',
    label: 'Vaso',
    icon: '🪴',
    desc: 'Vaso in coccio con arbusto e fiore: verde anche su terrazzi e pavimenti.',
    render: Vaso,
  },
]

export type CustomAssetLike = {
  id: string
  name: string
  url?: string
  kind?: 'glb' | 'structure'
  pieces?: StructurePiece[]
}

export function getAssetDef(
  id: string,
  customAssets: CustomAssetLike[]
): AssetDef | null {
  const builtin = BUILTIN_ASSETS.find(a => a.id === id)
  if (builtin) return builtin
  const custom = customAssets.find(a => a.id === id)
  if (!custom) return null
  if (custom.kind === 'structure' && custom.pieces) {
    return {
      id: custom.id,
      label: custom.name,
      icon: '🏗️',
      desc: `Struttura costruita da te con ${custom.pieces.length} pezzi. Posizionala nel mondo come un oggetto normale.`,
      render: props => <StructureModel pieces={custom.pieces!} rot={props.rot} />,
    }
  }
  if (custom.url) {
    return {
      id: custom.id,
      label: custom.name,
      icon: '📦',
      desc: 'Modello 3D caricato da te (solo nel tuo account).',
      isGlb: true,
      glbUrl: custom.url,
      render: props => (
        <GlbModel url={custom.url!} rot={props.rot} scale={props.scale} />
      ),
    }
  }
  return null
}

// ---------- ghost (anteprima semitrasparente) ----------
// v7: CLONA i materiali invece di mutarli — quelli PBR sono
// condivisi in cache e non vanno modificati.

function ghostOf(m: THREE.Material, clones: Map<THREE.Material, THREE.Material>): THREE.Material {
  let c = clones.get(m)
  if (!c) {
    c = m.clone()
    const s = c as THREE.MeshStandardMaterial
    s.transparent = true
    s.opacity = 0.45
    s.depthWrite = false
    clones.set(m, c)
  }
  return c
}

export function GhostGroup({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useEffect(() => {
    if (!ref.current) return
    const clones = new Map<THREE.Material, THREE.Material>()
    ref.current.traverse(o => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        const mat = m.material as THREE.Material | THREE.Material[]
        if (Array.isArray(mat)) {
          m.material = mat.map(mm => ghostOf(mm, clones))
        } else if (mat) {
          m.material = ghostOf(mat, clones)
        }
      }
    })
  })
  return <group ref={ref}>{children}</group>
}

// ---------- pop-in animation wrapper ----------

export function PopIn({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current || t.current >= 1) return
    t.current = Math.min(1, t.current + dt * 3.2)
    const c1 = 1.70158
    const c3 = c1 + 1
    const p = t.current
    const ease = 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
    ref.current.scale.setScalar(Math.max(0.001, ease))
  })
  return <group ref={ref}>{children}</group>
}

export function DieOut({ children }: { children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  const t = useRef(0)
  useFrame((_, dt) => {
    if (!ref.current) return
    t.current = Math.min(1, t.current + dt * 5)
    ref.current.scale.setScalar(Math.max(0.001, 1 - t.current))
    ref.current.rotation.y += dt * 4
  })
  return <group ref={ref}>{children}</group>
}
