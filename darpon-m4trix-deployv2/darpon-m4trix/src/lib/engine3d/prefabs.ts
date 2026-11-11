// ============================================================
// DARPX ENGINE — prefab realistici (v17)
// Ogni prefab costruisce geometria THREE procedurale con
// materiali PBR (niente sprite, niente cartoon): ambienti
// completi, strutture modulari e prop con collisioni.
// Le funzioni build() registrano animazioni (fiamme che
// tremano, occhi che scandagliano, core che pulsano…).
// ============================================================

import * as THREE from 'three'
import {
  hullMat, techMat, grateMat, concreteMat, marbleMat, goldMat, oldGoldMat,
  stoneMat, glassMat, hazardMat, screenMat, containerMat, cofferMat, glowMat,
  signMat, rMat,
} from './materials'
import { pbrMat } from '@/lib/pbr'
import type { RObject, RVec3 } from './types'

export type AnimCb = (t: number, dt: number) => void

/** box di collisione locale: centro + dimensioni */
export type ColBox = { c: RVec3; s: RVec3 }

export type PrefabCat = 'ambiente' | 'struttura' | 'prop'

export type PrefabDef = {
  id: string
  name: string
  cat: PrefabCat
  icon: string
  desc: string
  size: RVec3 // ingombro approssimativo (per ghost e outline)
  colliders: ColBox[]
  build: (anims: AnimCb[]) => THREE.Group
}

// ---------------- helpers geometrici ----------------

const G = () => new THREE.Group()

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

function box(
  w: number, h: number, d: number, mat: THREE.Material,
  x = 0, y = 0, z = 0
): THREE.Mesh {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z)
}

function cyl(
  rt: number, rb: number, h: number, mat: THREE.Material,
  x = 0, y = 0, z = 0, seg = 18, open = false
): THREE.Mesh {
  return mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat, x, y, z)
}

function sph(r: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  return mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), mat, x, y, z)
}

function tor(
  r: number, tube: number, mat: THREE.Material,
  x = 0, y = 0, z = 0, arc = Math.PI * 2, seg = 24
): THREE.Mesh {
  return mesh(new THREE.TorusGeometry(r, tube, 10, seg, arc), mat, x, y, z)
}

function plane(w: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = mesh(new THREE.PlaneGeometry(w, h), mat, x, y, z)
  m.castShadow = false
  return m
}

function light(color: THREE.ColorRepresentation, intensity: number, dist: number, x = 0, y = 0, z = 0): THREE.PointLight {
  const l = new THREE.PointLight(color, intensity, dist, 2)
  l.position.set(x, y, z)
  return l
}

/** rumore deterministico condiviso */
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

// ============================================================
// SOTTO-COSTRUTTORI RIUSABILI
// ============================================================

/** robot di manutenzione con occhio arancione che scandaglia */
function buildRobot(anims: AnimCb[]): THREE.Group {
  const g = G()
  const white = hullMat('#f2f4f8')
  const dark = techMat('#2c313c')
  const orange = glowMat('#ff8c1a', 2.6)
  // base con ruote
  g.add(box(0.5, 0.16, 0.42, dark, 0, 0.1, 0))
  for (const [wx, wz] of [[-0.18, -0.16], [0.18, -0.16], [-0.18, 0.16], [0.18, 0.16]] as const) {
    const w = cyl(0.09, 0.09, 0.05, dark, wx, 0.09, wz, 12)
    w.rotation.x = Math.PI / 2
    g.add(w)
  }
  // corpo
  const body = mesh(new THREE.CapsuleGeometry(0.22, 0.26, 6, 14), white, 0, 0.48, 0)
  g.add(body)
  g.add(tor(0.16, 0.03, orange, 0, 0.42, 0.2))
  // testa + occhio
  const head = G()
  head.position.set(0, 0.82, 0)
  head.add(sph(0.16, white))
  const eye = sph(0.07, orange, 0, 0.01, 0.13, 12)
  eye.castShadow = false
  head.add(eye)
  // antenna
  head.add(cyl(0.012, 0.012, 0.22, dark, 0.1, 0.24, 0, 8))
  head.add(sph(0.03, orange, 0.1, 0.36, 0, 8))
  g.add(head)
  // braccini
  for (const s of [-1, 1]) {
    const arm = cyl(0.035, 0.035, 0.3, dark, s * 0.26, 0.5, 0.05, 8)
    arm.rotation.z = s * 0.5
    g.add(arm)
  }
  // luce dell'occhio
  g.add(light('#ff8c1a', 1.6, 2.4, 0, 0.82, 0.3))
  // animazioni: occhio che scandaglia + corpo che ondeggia
  let phase = Math.random() * Math.PI * 2
  anims.push((t) => {
    phase = t * 1.4
    head.rotation.y = Math.sin(phase) * 0.7
    body.scale.y = 1 + Math.sin(t * 3.1) * 0.03
  })
  return g
}

/** candela con fiamma che trema (+ luce se richiesta) */
function buildCandle(h: number, withLight: boolean, anims: AnimCb[]): THREE.Group {
  const g = G()
  const wax = rMat('flat', { color: '#e8e2d2', rough: 0.6 })
  g.add(cyl(0.05, 0.06, h, wax, 0, h / 2, 0, 10))
  const flame = sph(0.045, glowMat('#ffb43a', 3.2), 0, h + 0.06, 0, 8)
  flame.castShadow = false
  flame.scale.y = 1.7
  g.add(flame)
  let l: THREE.PointLight | null = null
  if (withLight) {
    l = light('#ffa050', 1.4, 4.5, 0, h + 0.15, 0)
    g.add(l)
  }
  const seed = Math.random() * 10
  anims.push((t) => {
    const f = 0.75 + Math.sin(t * 11 + seed) * 0.14 + Math.sin(t * 23 + seed * 2) * 0.08
    flame.scale.set(0.9 + f * 0.18, 1.5 + f * 0.5, 0.9 + f * 0.18)
    if (l) l.intensity = 1.1 + f * 0.7
  })
  return g
}

/** braciere con fuoco */
function buildBrazier(anims: AnimCb[]): THREE.Group {
  const g = G()
  const iron = techMat('#24272e')
  g.add(cyl(0.42, 0.28, 0.3, iron, 0, 0.85, 0, 14))
  g.add(cyl(0.16, 0.2, 0.12, iron, 0, 0.64, 0, 10))
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    const leg = cyl(0.04, 0.05, 0.72, iron, Math.cos(a) * 0.26, 0.36, Math.sin(a) * 0.26, 8)
    leg.rotation.z = Math.cos(a) * 0.25
    leg.rotation.x = -Math.sin(a) * 0.25
    g.add(leg)
  }
  // carbone + fiamma
  g.add(sph(0.2, techMat('#14161c'), 0, 0.96, 0, 10))
  const flame = sph(0.22, glowMat('#ff7a1a', 2.8), 0, 1.12, 0, 10)
  flame.scale.y = 1.6
  g.add(flame)
  const l = light('#ff8c2a', 3.2, 8, 0, 1.3, 0)
  g.add(l)
  const seed = Math.random() * 10
  anims.push((t) => {
    const f = 0.8 + Math.sin(t * 9 + seed) * 0.2
    flame.scale.set(0.9 + f * 0.2, 1.4 + f * 0.6, 0.9 + f * 0.2)
    l.intensity = 2.6 + f * 1.4
  })
  return g
}

/** leone di pietra stilizzato (ai lati dell'altare) */
function buildLion(mat: THREE.Material): THREE.Group {
  const g = G()
  // zampe
  for (const [x, z] of [[-0.22, -0.3], [0.22, -0.3], [-0.22, 0.28], [0.22, 0.28]] as const) {
    g.add(cyl(0.09, 0.11, 0.5, mat, x, 0.25, z, 10))
  }
  // corpo
  const body = mesh(new THREE.CapsuleGeometry(0.24, 0.5, 6, 12), mat, 0, 0.62, 0)
  body.rotation.x = Math.PI / 2
  g.add(body)
  // testa con criniera
  g.add(sph(0.2, mat, 0, 0.78, 0.42))
  g.add(tor(0.26, 0.09, mat, 0, 0.8, 0.4))
  // muso
  g.add(box(0.16, 0.1, 0.12, mat, 0, 0.72, 0.58))
  // coda
  const tail = cyl(0.035, 0.05, 0.5, mat, 0.24, 0.6, -0.52, 8)
  tail.rotation.x = 0.9
  g.add(tail)
  return g
}

/** libreria colma di libri */
function buildShelf(anims: AnimCb[]): THREE.Group {
  void anims
  const g = G()
  const wood = pbrMat('legno', '#5e4226', { roughness: 0.8, rx: 2, ry: 2 })
  const W = 2.2, H = 3.0, D = 0.45
  g.add(box(W, 0.12, D, wood, 0, 0.06, 0))
  g.add(box(0.12, H, D, wood, -W / 2 + 0.06, H / 2, 0))
  g.add(box(0.12, H, D, wood, W / 2 - 0.06, H / 2, 0))
  g.add(box(W, 0.14, D, wood, 0, H, 0))
  g.add(box(W, H, 0.05, wood, 0, H / 2, -D / 2 + 0.03))
  const rnd = rng(31)
  const BOOK_COLORS = ['#7a2a22', '#2a4a7a', '#3a6a3a', '#6a5a2a', '#5a2a5a', '#2a5a6a', '#8a6a3a', '#4a3a2a']
  // libri istanziati (un solo draw call per mensola)
  const rows = 5
  const perRow = 11
  const bookGeo = new THREE.BoxGeometry(0.13, 1, 0.3)
  const inst = new THREE.InstancedMesh(bookGeo, rMat('flat', { color: '#ffffff', rough: 0.85 }), rows * perRow)
  inst.castShadow = true
  const m4 = new THREE.Matrix4()
  const col = new THREE.Color()
  let i = 0
  for (let r = 0; r < rows; r++) {
    const shelfY = 0.12 + r * ((H - 0.3) / rows)
    g.add(box(W - 0.2, 0.05, D - 0.08, wood, 0, shelfY, 0))
    for (let b = 0; b < perRow; b++) {
      const h = 0.24 + rnd() * 0.14
      m4.makeScale(1, h, 1)
      m4.setPosition(-W / 2 + 0.22 + b * ((W - 0.4) / perRow), shelfY + 0.03 + h / 2, 0)
      inst.setMatrixAt(i, m4)
      col.set(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)])
      inst.setColorAt(i, col)
      i++
    }
  }
  g.add(inst)
  return g
}

/** panchina in legno e ferro */
function buildBench(): THREE.Group {
  const g = G()
  const wood = pbrMat('legno', '#6a4a2e', { roughness: 0.85, rx: 1.5, ry: 1 })
  const iron = techMat('#2a2e36')
  for (const s of [-1, 1]) {
    g.add(box(0.08, 0.42, 0.5, iron, s * 0.8, 0.21, 0))
  }
  for (let i = 0; i < 4; i++) g.add(box(1.8, 0.05, 0.11, wood, 0, 0.45, -0.19 + i * 0.13))
  for (let i = 0; i < 3; i++) g.add(box(1.8, 0.11, 0.05, wood, 0, 0.62 + i * 0.13, 0.24))
  return g
}

// ============================================================
// AMBIENTI COMPLETI
// ============================================================

/** corridoio spaziale in metallo bianco (come le reference Bevy) */
function buildCorridor(anims: AnimCb[]): THREE.Group {
  const g = G()
  const L = 26, W = 4.4, H = 3.4
  const wallPanel = rMat('whitePanel', { color: '#eef1f6', rough: 0.36, metal: 0.85, rx: 9, ry: 2 })
  const ceilPanel = rMat('whitePanel', { color: '#dde3ec', rough: 0.42, metal: 0.8, rx: 9, ry: 2 })
  const dark = techMat('#39404d')

  // pavimento a griglia con passerelle laterali
  g.add(box(L, 0.2, W, grateMat('#c8d2e2'), 0, -0.1, 0))
  g.add(box(L, 0.05, 0.55, hullMat('#f4f6fa'), 0, 0.03, W / 2 - 0.35))
  g.add(box(L, 0.05, 0.55, hullMat('#f4f6fa'), 0, 0.03, -W / 2 + 0.35))

  // soffitto
  g.add(box(L, 0.22, W, ceilPanel, 0, H + 0.11, 0))

  // pareti
  for (const s of [-1, 1]) {
    g.add(box(L, H, 0.24, wallPanel, 0, H / 2, s * (W / 2 + 0.12)))
  }

  // costole strutturali ogni 3.25 m (il corridoio corre lungo X)
  const ribStep = 3.25
  for (let x = -L / 2 + 1.5; x <= L / 2 - 1.2; x += ribStep) {
    g.add(box(0.5, 0.34, W + 0.3, dark, x, H - 0.15, 0))
    for (const s of [-1, 1]) {
      g.add(box(0.5, H, 0.5, dark, x, H / 2, s * (W / 2 - 0.1)))
      // spia arancione sulle costole
      const dot = cyl(0.055, 0.055, 0.06, glowMat('#ff8c1a', 2.4), x + 0.26, 2.6, s * (W / 2 - 0.24), 10)
      dot.rotation.z = Math.PI / 2
      g.add(dot)
    }
  }

  // dorsale sul soffitto + bracci meccanici
  g.add(box(L, 0.4, 0.75, dark, 0, H - 0.2, 0))
  for (const x of [-6, 1, 8]) {
    const arm = G()
    arm.position.set(x, H - 0.38, 0)
    const seg1 = box(0.18, 0.5, 0.18, dark, 0, -0.25, 0)
    arm.add(seg1)
    const joint = sph(0.11, hullMat('#dfe4ec'), 0, -0.52, 0, 10)
    arm.add(joint)
    const seg2 = box(0.14, 0.6, 0.14, dark, 0.22, -0.75, 0)
    seg2.rotation.z = -0.5
    arm.add(seg2)
    const claw = tor(0.1, 0.035, dark, 0.38, -1.0, 0)
    arm.add(claw)
    g.add(arm)
  }

  // tubi lungo il corridoio (asse X)
  for (const [z, r, mat] of [
    [-0.85, 0.09, techMat('#8a929e')],
    [-0.6, 0.07, techMat('#5a626e')],
    [-1.05, 0.05, glowMat('#ff8c1a', 1.8)],
  ] as const) {
    const p = cyl(r, r, L - 1, mat, 0, H - 0.5, z, 12)
    p.rotation.z = Math.PI / 2
    p.castShadow = false
    g.add(p)
  }

  // strisce luce bianche
  for (const s of [-1, 1]) {
    const strip = box(L - 0.8, 0.05, 0.14, glowMat('#e8f4ff', 2.6), 0, H - 0.28, s * 1.15)
    strip.castShadow = false
    strip.receiveShadow = false
    g.add(strip)
  }
  // luci vere distribuite lungo il corridoio
  for (const x of [-9, -3, 3, 9]) g.add(light('#dff0ff', 7, 7, x, H - 0.4, 0))
  // accenti arancioni
  g.add(light('#ff8c1a', 2.6, 5, -6, 2.4, 1.6))
  g.add(light('#ff8c1a', 2.6, 5, 6, 2.4, -1.6))

  // cartello REATTORE 1 (come nella reference)
  const sign = box(1.5, 0.75, 0.07, signMat('REATTORE 1', { sub: 'NON TOCCARE · ALTA TENSIONE' }), 0.2, 1.75, -W / 2 + 0.05)
  g.add(sign)
  // griglia di ventilazione sotto il cartello
  const vent = box(1.0, 0.5, 0.06, techMat('#4a505c'), 0.2, 0.95, -W / 2 + 0.05)
  g.add(vent)
  for (let i = 0; i < 5; i++) {
    const slot = box(0.86, 0.03, 0.02, techMat('#20242c'), 0.2, 0.78 + i * 0.09, -W / 2 + 0.09)
    g.add(slot)
  }

  // fondo illuminato (la forte luce in fondo al corridoio, lato +X)
  const endGlow = plane(1.7, 2.7, glowMat('#ffffff', 3.6), L / 2 - 0.35, 1.4, 0)
  endGlow.rotation.y = -Math.PI / 2
  g.add(endGlow)
  const endFrame = box(0.16, 3.1, 2.1, dark, L / 2 - 0.2, 1.55, 0)
  g.add(endFrame)
  g.add(light('#ffffff', 26, 14, L / 2 - 1.2, 1.6, 0))
  // porta di servizio all'inizio (lato −X)
  const backDoor = box(0.14, 2.5, 1.6, techMat('#454c58'), -L / 2 + 0.15, 1.25, 0)
  g.add(backDoor)
  const dl = plane(0.5, 0.5, signMat('EXIT', { bg: '#1a6a3a', fg: '#eafff2' }), -L / 2 + 0.3, 2.7, 0.85)
  dl.rotation.y = Math.PI / 2
  g.add(dl)

  // due robot di manutenzione (come nella reference)
  const r1 = buildRobot(anims)
  r1.position.set(-4, 0, 1.35)
  r1.rotation.y = 2.6
  g.add(r1)
  const r2 = buildRobot(anims)
  r2.position.set(5, 0, -1.35)
  r2.rotation.y = -2.2
  g.add(r2)

  return g
}

/** cattedrale barocca con altare dorato e mare di candele */
function buildCathedral(anims: AnimCb[]): THREE.Group {
  const g = G()
  const L = 30, W = 16, wallH = 10
  const marbleFloor = rMat('marble', { color: '#e2d7be', rough: 0.24, metal: 0.04, rx: 7, ry: 4 })
  const marbleCol = rMat('marble', { color: '#e8ddc4', rough: 0.3, metal: 0.03, rx: 1, ry: 3 })
  const stone = rMat('concrete', { color: '#a89a80', rough: 0.9, metal: 0, rx: 5, ry: 2 })

  // pavimento (navata lungo Z: 16 di larghezza X, 30 di lunghezza Z)
  g.add(box(W, 0.2, L, marbleFloor, 0, -0.1, 0))

  // gradini verso l'altare
  g.add(box(7, 0.18, 3.4, marbleFloor, 0, 0.09, 10.2))
  g.add(box(5.6, 0.18, 2.6, marbleFloor, 0, 0.27, 10.6))
  g.add(box(4.2, 0.18, 1.9, marbleFloor, 0, 0.45, 11))

  // colonne laterali (2 file da 4)
  for (const s of [-1, 1]) {
    for (const z of [-9, -3, 3, 9]) {
      const c = G()
      c.position.set(s * 5, 0, z)
      c.add(box(1.5, 0.5, 1.5, stone, 0, 0.25, 0))
      c.add(box(1.15, 0.28, 1.15, stone, 0, 0.62, 0))
      c.add(cyl(0.42, 0.5, 6.6, marbleCol, 0, 4.05, 0, 22))
      c.add(cyl(0.55, 0.42, 0.22, marbleCol, 0, 7.42, 0, 22))
      c.add(box(1.25, 0.42, 1.25, stone, 0, 7.72, 0))
      c.add(box(0.95, 0.2, 0.95, stone, 0, 8.0, 0))
      g.add(c)
    }
  }

  // archi tra le colonne
  for (const z of [-9, -3, 3, 9]) {
    const a = tor(4.6, 0.3, marbleCol, 0, 7.9, z, Math.PI, 32)
    a.rotation.z = 0
    g.add(a)
  }

  // muri laterali con vetrate (lungo Z)
  for (const s of [-1, 1]) {
    g.add(box(0.5, wallH, L, stone, s * (W / 2 + 0.25), wallH / 2, 0))
    for (const z of [-10, -4.5, 1, 6.5]) {
      const win = plane(1.5, 3.2, glassMat(), s * (W / 2 - 0.005), 5.2, z)
      win.rotation.y = s * -Math.PI / 2
      win.castShadow = false
      g.add(win)
      // cornice dorata ad arco
      const frame = tor(0.95, 0.07, oldGoldMat(), s * (W / 2 - 0.06), 6.7, z, Math.PI, 24)
      frame.rotation.y = Math.PI / 2
      g.add(frame)
      g.add(box(0.1, 3.4, 2.0, stone, s * (W / 2 - 0.05), 5.2, z))
    }
  }

  // fondale ( ingresso) con rosone
  g.add(box(0.5, wallH, W, stone, 0, wallH / 2, -L / 2 - 0.25))
  const rose = mesh(new THREE.CircleGeometry(2.7, 36), glassMat(), 0, 6.4, -L / 2 + 0.02)
  rose.castShadow = false
  g.add(rose)
  const roseRing = tor(2.75, 0.16, oldGoldMat(), 0, 6.4, -L / 2 + 0.06, Math.PI * 2, 40)
  g.add(roseRing)
  g.add(light('#9ab8ff', 5, 15, 0, 6.4, -L / 2 + 1.5))

  // abside dietro l'altare
  g.add(box(0.6, wallH, W, stone, 0, wallH / 2, L / 2 + 0.3))
  const apse = mesh(new THREE.CylinderGeometry(4.4, 4.4, wallH, 26, 1, true, -Math.PI / 2, Math.PI), stone, 0, wallH / 2, L / 2 - 0.5)
  apse.castShadow = false
  g.add(apse)

  // cupola a cassettoni sopra l'altare
  const dome = G()
  dome.position.set(0, 8.6, 8)
  dome.add(cyl(5.0, 5.2, 2.2, stone, 0, 1.1, 0, 26, true))
  const shell = mesh(new THREE.SphereGeometry(5.0, 26, 14, 0, Math.PI * 2, 0, Math.PI / 2), cofferMat(), 0, 2.2, 0)
  dome.add(shell)
  const oculus = tor(1.15, 0.22, oldGoldMat(), 0, 7.35, 0, Math.PI * 2, 30)
  dome.add(oculus)
  dome.add(cyl(1.1, 1.35, 0.7, stone, 0, 7.6, 0, 20))
  dome.add(cyl(0.06, 0.06, 1.1, goldMat(), 0, 8.45, 0, 8))
  const dc = box(0.14, 0.5, 0.05, goldMat(), 0, 9.1, 0)
  const dc2 = box(0.05, 0.14, 0.5, goldMat(), 0, 9.18, 0)
  dc.castShadow = dc2.castShadow = false
  dome.add(dc, dc2)
  g.add(dome)
  // raggio di luce dall'oculus
  const ray = mesh(
    new THREE.ConeGeometry(3.4, 7.4, 22, 1, true),
    rMat('flat', { color: '#ffe8b0', rough: 1, opacity: 0.055, emissive: '#ffe8b0', eInt: 0.35 }),
    0, 4.6, 8
  )
  ray.castShadow = false
  ray.receiveShadow = false
  g.add(ray)
  g.add(light('#ffd9a0', 7, 13, 0, 7.5, 8))

  // ALTARE DORATO
  const altar = G()
  altar.position.set(0, 0.55, 11.2)
  altar.add(box(2.6, 0.95, 1.0, marbleCol, 0, 0.48, 0))
  altar.add(box(2.7, 0.35, 1.1, goldMat(), 0, 1.05, 0))
  // pannello frontale dorato decorato
  altar.add(box(2.62, 0.6, 0.06, oldGoldMat(), 0, 0.5, 0.53))
  for (const s of [-1, 0, 1]) {
    altar.add(cyl(0.09, 0.09, 0.06, goldMat(), s * 0.8, 0.5, 0.57, 10))
  }
  // tabernacolo (calice dorato con croce)
  const tab = G()
  tab.position.set(0, 1.25, 0)
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    pts.push(new THREE.Vector2(0.16 + Math.sin(t * Math.PI) * 0.22 + (1 - t) * 0.1, t * 0.85))
  }
  tab.add(mesh(new THREE.LatheGeometry(pts, 20), goldMat()))
  const c1 = box(0.09, 0.52, 0.035, goldMat(), 0, 1.15, 0)
  const c2 = box(0.035, 0.09, 0.52, goldMat(), 0, 1.22, 0)
  c1.castShadow = c2.castShadow = false
  tab.add(c1, c2)
  tab.add(sph(0.05, glowMat('#ffe9b0', 1.6), 0, 1.45, 0, 10))
  altar.add(tab)
  // candelabri ai lati dell'altare
  for (const s of [-1, 1]) {
    const st = G()
    st.position.set(s * 1.1, 1.1, 0.2)
    st.add(cyl(0.05, 0.09, 0.5, goldMat(), 0, 0.25, 0, 10))
    st.add(cyl(0.16, 0.05, 0.09, goldMat(), 0, 0.52, 0, 12))
    const cd = buildCandle(0.4, true, anims)
    cd.position.set(0, 0.56, 0)
    st.add(cd)
    altar.add(st)
  }
  g.add(altar)
  g.add(light('#ffd9a0', 4, 6, 0, 2.2, 11))

  // LEONI DI PIETRA ai piedi dell'altare (come nella reference)
  for (const s of [-1, 1]) {
    const lion = buildLion(stoneMat('#b0a48c'))
    lion.position.set(s * 2.6, 0.55, 9.4)
    lion.rotation.y = s * 0.35 + Math.PI
    const base = box(1.1, 0.55, 0.9, stone, s * 2.6, 0.28, 9.4)
    g.add(base, lion)
  }

  // MARE DI CANDELE davanti all'altare (come nella reference)
  const rnd = rng(77)
  const CANDLES = 150
  const waxGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.34, 8)
  const waxInst = new THREE.InstancedMesh(waxGeo, rMat('flat', { color: '#efe8d8', rough: 0.65 }), CANDLES)
  waxInst.castShadow = true
  const flameGeo = new THREE.SphereGeometry(0.032, 6, 5)
  const flameInst = new THREE.InstancedMesh(flameGeo, glowMat('#ffb43a', 3), CANDLES)
  const m4 = new THREE.Matrix4()
  const flick = new Float32Array(CANDLES)
  let ci = 0
  const zone = (x0: number, x1: number, z0: number, z1: number, n: number) => {
    for (let i = 0; i < n && ci < CANDLES; i++) {
      const x = x0 + rnd() * (x1 - x0)
      const z = z0 + rnd() * (z1 - z0)
      const y = z > 10 ? (z > 10.7 ? 0.63 : 0.45) : z > 9.8 ? 0.27 : 0.09
      m4.identity()
      m4.setPosition(x, y + 0.17, z)
      waxInst.setMatrixAt(ci, m4)
      m4.setPosition(x, y + 0.38, z)
      flameInst.setMatrixAt(ci, m4)
      flick[ci] = rnd() * 10
      ci++
    }
  }
  zone(-3.4, 3.4, 6.6, 9.6, 70) // gradinate davanti
  zone(-3.0, -1.4, 9.9, 12.4, 40) // lato sinistro dell'altare
  zone(1.4, 3.0, 9.9, 12.4, 40) // lato destro
  g.add(waxInst, flameInst)
  // poche luci vere che tremano (tutte le 150 candele sarebbero troppe)
  for (const [x, z] of [[-2.4, 8.2], [2.4, 8.2], [0, 9.2], [-2.2, 11], [2.2, 11]] as const) {
    const l = light('#ffa050', 2.2, 5.5, x, 0.9, z)
    g.add(l)
    const seed = Math.random() * 9
    anims.push((t) => { l.intensity = 1.9 + Math.sin(t * 10 + seed) * 0.5 })
  }
  // fiammelle che palpitano (l'InstancedMesh condivide il materiale:
  // pulsa l'intensità emissiva globale, le luci vere tremano sopra)
  anims.push((t) => {
    const m = flameInst.material as THREE.MeshStandardMaterial
    m.emissiveIntensity = 2.6 + Math.sin(t * 8) * 0.5 + Math.sin(t * 19) * 0.25
  })

  // banchi
  for (const s of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const b = buildBench()
      b.position.set(s * 2.6, 0, -8.5 + i * 2.3)
      b.rotation.y = Math.PI
      g.add(b)
    }
  }

  return g
}

/** hangar industriale con container e gru */
function buildHangar(anims: AnimCb[]): THREE.Group {
  const g = G()
  const Lx = 34, Lz = 22, H = 9
  const floor = rMat('concrete', { color: '#8e8c86', rough: 0.95, metal: 0, rx: 8, ry: 6 })
  g.add(box(Lx, 0.2, Lz, floor, 0, -0.1, 0))
  // strisce di sicurezza a terra
  g.add(box(8, 0.02, 0.5, hazardMat(), -6, 0.01, 7.5))
  g.add(box(8, 0.02, 0.5, hazardMat(), -6, 0.01, -7.5))

  const steel = techMat('#3d434e')
  const roofMat = rMat('corrugated', { color: '#565e6a', rough: 0.7, metal: 0.5, rx: 8, ry: 3 })

  // colonne + capriate
  for (const x of [-12, 12]) {
    for (const z of [-8, 0, 8]) {
      g.add(box(0.65, H, 0.65, steel, x, H / 2, z))
      g.add(box(0.9, 0.3, 0.9, steel, x, 0.15, z))
    }
  }
  for (const z of [-8, 0, 8]) {
    g.add(box(Lx, 0.5, 0.45, steel, 0, H - 0.3, z))
    for (let x = -12; x <= 12; x += 4) {
      g.add(box(0.3, 1.4, 0.3, steel, x, H - 1.1, z))
      const diag = cyl(0.09, 0.09, 4.4, steel, x + 2, H - 1.4, z, 8)
      diag.rotation.z = Math.PI / 4
      g.add(diag)
    }
  }
  // tetto
  g.add(box(Lx, 0.25, Lz, roofMat, 0, H + 0.1, 0))
  // pareti (fronte aperto)
  g.add(box(0.3, H, Lz, roofMat, -Lx / 2 - 0.2, H / 2, 0))
  g.add(box(0.3, H, Lz, roofMat, Lx / 2 + 0.2, H / 2, 0))
  g.add(box(Lx, H, 0.3, roofMat, 0, H / 2, -Lz / 2 - 0.2))

  // gru a ponte
  g.add(box(0.4, 0.4, Lz - 1, rMat('corrugated', { color: '#c8a02e', rough: 0.6, metal: 0.6, rx: 4, ry: 1 }), 4, H - 1.2, 0))
  g.add(box(1.4, 0.7, 1.1, steel, 4, H - 1.6, 3.2))
  g.add(cyl(0.02, 0.02, 2.6, techMat('#1c2028'), 4, H - 3.2, 3.2, 8))
  g.add(tor(0.16, 0.05, steel, 4, H - 4.5, 3.2, Math.PI * 1.5))
  g.add(box(0.5, 0.35, 0.5, steel, 4, H - 4.75, 3.2))
  const hookLight = light('#ffd9a0', 4, 6, 4, H - 4.9, 3.2)
  g.add(hookLight)

  // riflettori da cantiere (coni di luce)
  for (const [x, z] of [[-10, -6], [10, -6], [-10, 6], [10, 6]] as const) {
    g.add(cyl(0.05, 0.05, 2.6, steel, x, H - 1.9, z, 8))
    const shade = cyl(0.42, 0.16, 0.4, techMat('#22262e'), x, H - 0.65, z, 14)
    shade.rotation.x = 0.5
    g.add(shade)
    const bulb = sph(0.14, glowMat('#ffe9c8', 3), x, H - 0.8, z + 0.1, 10)
    bulb.castShadow = false
    g.add(bulb)
    const cone = mesh(
      new THREE.ConeGeometry(2.6, 7.4, 20, 1, true),
      rMat('flat', { color: '#ffe9c8', rough: 1, opacity: 0.045, emissive: '#ffe9c8', eInt: 0.3 }),
      x, H - 4.4, z + 0.75
    )
    cone.castShadow = false
    cone.receiveShadow = false
    g.add(cone)
    const sl = new THREE.SpotLight('#ffe0b0', 40, 20, 0.62, 0.5, 2)
    sl.position.set(x, H - 0.75, z)
    sl.target.position.set(x, 0, z + 1.4)
    g.add(sl, sl.target)
  }

  // container (come unita-cargo ma integrati)
  const containers: [number, number, number, string][] = [
    [-8, 0, -2, '#2e62c8'], [-8, 0, 1.2, '#b0362a'], [-8, 2.75, -2, '#3a7a4a'],
    [-1.5, 0, -3, '#c8a02e'], [-1.5, 0, 0.2, '#5a6570'], [5.5, 0, -3.5, '#7a3ec0'],
  ]
  for (const [x, y, z, col] of containers) {
    const c = G()
    c.position.set(x, y, z)
    const m = containerMat(col)
    c.add(box(2.6, 2.6, 6.2, m, 0, 1.3, 0))
    for (const cor of [[-1.25, -3.05], [1.25, -3.05], [-1.25, 3.05], [1.25, 3.05]] as const) {
      c.add(box(0.22, 2.7, 0.22, techMat('#2c313a'), cor[0], 1.35, cor[1]))
    }
    c.add(box(2.62, 0.18, 6.22, techMat('#2c313a'), 0, 0.09, 0))
    g.add(c)
  }

  // barili e casse
  const rnd = rng(19)
  for (let i = 0; i < 6; i++) {
    const b = G()
    b.position.set(-13 + rnd() * 4, 0, 4 + rnd() * 4)
    const rust = containerMat('#8a4a2a')
    b.add(cyl(0.42, 0.42, 1.1, rust, 0, 0.55, 0, 14))
    b.add(tor(0.43, 0.03, techMat('#4a3525'), 0, 0.35, 0))
    b.add(tor(0.43, 0.03, techMat('#4a3525'), 0, 0.85, 0))
    g.add(b)
  }
  for (let i = 0; i < 4; i++) {
    const s = 0.8 + rnd() * 0.5
    const c = box(s, s, s, pbrMat('legno', '#8a6a44', { roughness: 0.9, rx: 1, ry: 1 }), 11 + rnd() * 3, s / 2, 4 + rnd() * 5)
    c.rotation.y = rnd() * Math.PI
    g.add(c)
  }
  return g
}

/** sala macchine con reattori pulsanti */
function buildEngineRoom(anims: AnimCb[]): THREE.Group {
  const g = G()
  const Lx = 24, Lz = 18, H = 7
  g.add(box(Lx, 0.2, Lz, grateMat('#9aa2ae'), 0, -0.1, 0))
  const dark = techMat('#2e3440')
  const wallP = rMat('whitePanel', { color: '#4a5260', rough: 0.55, metal: 0.75, rx: 7, ry: 2 })
  g.add(box(Lx, H, 0.3, wallP, 0, H / 2, -Lz / 2))
  g.add(box(0.3, H, Lz, wallP, -Lx / 2, H / 2, 0))
  g.add(box(0.3, H, Lz, wallP, Lx / 2, H / 2, 0))
  g.add(box(Lx, 0.3, Lz, wallP, 0, H, 0))
  // strisce hazard attorno ai reattori
  g.add(box(5.4, 0.02, 5.4, hazardMat(), -7, 0.011, 0))
  g.add(box(5.4, 0.02, 5.4, hazardMat(), 7, 0.011, 0))

  // REATTORI
  for (const s of [-1, 1]) {
    const rx = s * 7
    const core = G()
    core.position.set(rx, 0, 0)
    core.add(cyl(1.7, 1.9, 0.5, dark, 0, 0.25, 0, 24))
    core.add(cyl(1.55, 1.7, 3.6, techMat('#424a58'), 0, 2.3, 0, 24))
    core.add(tor(1.62, 0.1, dark, 0, 1.2, 0, Math.PI * 2, 28))
    core.add(tor(1.62, 0.1, dark, 0, 2.6, 0, Math.PI * 2, 28))
    core.add(tor(1.62, 0.1, dark, 0, 3.8, 0, Math.PI * 2, 28))
    const ring = tor(1.35, 0.12, glowMat('#19e0ff', 2.2), 0, 2.0, 0, Math.PI * 2, 28)
    ring.castShadow = false
    core.add(ring)
    const ring2 = tor(1.35, 0.12, glowMat('#19e0ff', 2.2), 0, 3.2, 0, Math.PI * 2, 28)
    ring2.castShadow = false
    core.add(ring2)
    const top = cyl(1.1, 1.45, 1.1, dark, 0, 4.65, 0, 20)
    core.add(top)
    const orb = sph(0.55, glowMat('#7af0ff', 3.2), 0, 5.5, 0, 18)
    orb.castShadow = false
    core.add(orb)
    g.add(core)
    g.add(light('#19e0ff', 9, 8, rx, 4.2, 0))
    // tubi dal reattore alla parete
    for (const dz of [-0.9, 0, 0.9]) {
      const pipe = cyl(0.16, 0.16, 4.4, techMat('#6a7280'), rx + s * 3.2, 3.4, dz, 12)
      pipe.rotation.z = Math.PI / 2
      g.add(pipe)
      const el = tor(0.2, 0.09, techMat('#6a7280'), rx + s * 5.4, 3.4, dz, Math.PI / 2, 12)
      g.add(el)
    }
    // pulsazione del reattore
    const seed = s * 3
    anims.push((t) => {
      const p = 0.7 + Math.sin(t * 2.2 + seed) * 0.3
      const gm = orb.material as THREE.MeshStandardMaterial
      gm.emissiveIntensity = 2.2 + p * 1.6
      ring.material = ring.material // no-op typed
      const rm = ring.material as THREE.MeshStandardMaterial
      rm.emissiveIntensity = 1.6 + p * 1.2
    })
  }

  // grappolo di tubi sulla parete di fondo
  const rnd = rng(55)
  const pipes: [number, number, number][] = [
    [-8, 5.6, 0.3], [-7.2, 5.0, 0.22], [-6.4, 5.8, 0.26], [-5.4, 4.6, 0.18],
    [8, 5.6, 0.3], [7.2, 5.0, 0.22], [6.4, 5.8, 0.26], [5.4, 4.6, 0.18],
    [0, 6.2, 0.34], [-1.2, 6.0, 0.2], [1.2, 6.0, 0.2],
  ]
  for (const [x, y, r] of pipes) {
    const p = cyl(r, r, Lx - 1, containerMat(rnd() > 0.5 ? '#5a626e' : '#6e5a4a'), x, y, -Lz / 2 + 0.5, 12)
    p.rotation.x = Math.PI / 2
    p.castShadow = false
    g.add(p)
    const fl = tor(r + 0.03, 0.035, dark, x, y, -Lz / 2 + 2.2)
    fl.rotation.x = 0
    fl.castShadow = false
    g.add(fl)
  }

  // passerella rialzata con scale
  const walk = G()
  walk.position.set(0, 2.4, -5.5)
  walk.add(box(16, 0.16, 2.2, grateMat('#b8c2d2'), 0, 0, 0))
  for (const s of [-1, 1]) {
    walk.add(box(16, 0.05, 0.05, techMat('#8a929e'), 0, 0.55, s * 1.05))
    for (let x = -7.5; x <= 7.5; x += 2.5) {
      walk.add(cyl(0.035, 0.035, 0.55, techMat('#8a929e'), x, 0.3, s * 1.05, 8))
    }
  }
  // scale di accesso alle due estremità (6 gradini da 40 cm)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const hi = 0.4 * (i + 1)
      walk.add(box(0.42, hi, 2.2, grateMat('#b8c2d2'), s * (8.21 + i * 0.42), hi / 2 - 2.4, 0))
    }
  }
  g.add(walk)

  // console di controllo
  for (const [x, z, ry] of [[-3.5, 5.5, Math.PI], [0, 5.5, Math.PI], [3.5, 5.5, Math.PI]] as const) {
    const con = G()
    con.position.set(x, 0, z)
    con.rotation.y = ry
    con.add(box(1.6, 0.85, 0.6, dark, 0, 0.43, 0))
    const scr = box(1.5, 0.75, 0.08, screenMat(), 0, 1.1, -0.12)
    scr.rotation.x = -0.28
    con.add(scr)
    con.add(box(1.7, 0.1, 0.7, techMat('#4a5260'), 0, 0.88, 0.05))
    con.add(light('#00f0ff', 1.2, 2.5, 0, 1.3, 0.3))
    g.add(con)
  }

  // luce di allerta rossa rotante
  const alarm = G()
  alarm.position.set(0, H - 0.6, -2)
  alarm.add(box(0.3, 0.14, 0.3, dark, 0, -0.08, 0))
  const dome = mesh(new THREE.SphereGeometry(0.16, 12, 8), glowMat('#ff2a3a', 2.6), 0, 0.06, 0)
  dome.castShadow = false
  alarm.add(dome)
  const aLight = light('#ff2a3a', 5, 10, 0, 0, 0)
  alarm.add(aLight)
  g.add(alarm)
  anims.push((t) => {
    const p = Math.max(0, Math.sin(t * 3.4))
    const am = dome.material as THREE.MeshStandardMaterial
    am.emissiveIntensity = 1.4 + p * 2.4
    aLight.intensity = 1.5 + p * 6
  })

  return g
}

/** biblioteca antica in legno */
function buildLibrary(anims: AnimCb[]): THREE.Group {
  const g = G()
  const Lx = 22, Lz = 16, H = 6
  const wood = pbrMat('legno', '#6a4c2e', { roughness: 0.85, rx: 6, ry: 5 })
  g.add(box(Lx, 0.2, Lz, wood, 0, -0.1, 0))
  // tappeto centrale
  g.add(box(10, 0.03, 6.5, pbrMat('tessuto', '#5a2030', { roughness: 0.98, rx: 3, ry: 2 }), 0, 0.02, 1))

  // soffitto a travoni
  const plaster = pbrMat('intonaco', '#cfc4ae', { roughness: 0.95, rx: 4, ry: 3 })
  g.add(box(Lx, 0.2, Lz, plaster, 0, H + 0.1, 0))
  for (let x = -10; x <= 10; x += 2.5) {
    g.add(box(0.35, 0.4, Lz, pbrMat('legno', '#4e3620', { roughness: 0.9, rx: 1, ry: 4 }), x, H - 0.2, 0))
  }

  // pareti
  g.add(box(Lx, H, 0.3, plaster, 0, H / 2, -Lz / 2))
  g.add(box(0.3, H, Lz, plaster, -Lx / 2, H / 2, 0))
  g.add(box(0.3, H, Lz, plaster, Lx / 2, H / 2, 0))
  g.add(box(Lx, H, 0.3, plaster, 0, H / 2, Lz / 2))

  // librerie lungo le pareti
  for (const x of [-7.5, -2.5, 2.5, 7.5]) {
    for (const s of [-1, 1]) {
      const sh = buildShelf(anims)
      sh.position.set(x, 0, s * (Lz / 2 - 0.35))
      sh.rotation.y = s < 0 ? 0 : Math.PI
      g.add(sh)
    }
  }
  // doppia libreria centrale
  for (const s of [-1, 1]) {
    const sh = buildShelf(anims)
    sh.position.set(s * 0.5, 0, -4.5)
    sh.rotation.y = s * Math.PI / 2
    g.add(sh)
  }

  // tavoli di lettura con sedie e candele
  const brass = oldGoldMat()
  for (const tx of [-3.5, 3.5]) {
    const t = G()
    t.position.set(tx, 0, 2.5)
    t.add(box(2.2, 0.1, 1.1, pbrMat('legno', '#7a5836', { roughness: 0.7, rx: 1, ry: 1 }), 0, 0.82, 0))
    for (const [lx, lz] of [[-0.95, -0.42], [0.95, -0.42], [-0.95, 0.42], [0.95, 0.42]] as const) {
      t.add(cyl(0.05, 0.05, 0.8, brass, lx, 0.4, lz, 8))
    }
    // libri aperti
    for (const b of [-0.5, 0.4]) {
      const bk = box(0.4, 0.05, 0.3, rMat('flat', { color: '#d8cfa8', rough: 0.9 }), b, 0.9, 0.1)
      bk.rotation.z = 0.05
      t.add(bk)
    }
    // candela sul tavolo
    const cd = buildCandle(0.3, true, anims)
    cd.position.set(0, 0.87, -0.3)
    t.add(cd)
    g.add(t)
    // sedie
    for (const s of [-1, 1]) {
      const ch = G()
      ch.position.set(tx + s * 1.7, 0, 2.5 + (s > 0 ? 0.2 : -0.2))
      ch.rotation.y = s * Math.PI / 2
      ch.add(box(0.5, 0.06, 0.5, pbrMat('legno', '#6a4a2c', { roughness: 0.85, rx: 1, ry: 1 }), 0, 0.48, 0))
      ch.add(box(0.5, 0.55, 0.06, pbrMat('legno', '#6a4a2c', { roughness: 0.85, rx: 1, ry: 1 }), 0, 0.78, -0.23))
      for (const [cx, cz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
        ch.add(cyl(0.035, 0.035, 0.48, brass, cx, 0.24, cz, 8))
      }
      g.add(ch)
    }
  }

  // lampade a stelo d'ottone
  for (const [x, z] of [[-6.5, 4.5], [6.5, 4.5], [-6.5, -1], [6.5, -1]] as const) {
    const lamp = G()
    lamp.position.set(x, 0, z)
    lamp.add(cyl(0.22, 0.28, 0.08, brass, 0, 0.04, 0, 12))
    lamp.add(cyl(0.035, 0.035, 1.55, brass, 0, 0.85, 0, 8))
    const shade = cyl(0.22, 0.34, 0.3, rMat('flat', { color: '#3a6a4a', rough: 0.5, metal: 0.4 }), 0, 1.7, 0, 14, true)
    lamp.add(shade)
    const bulb = sph(0.09, glowMat('#ffd9a0', 2.4), 0, 1.62, 0, 10)
    bulb.castShadow = false
    lamp.add(bulb)
    lamp.add(light('#ffca80', 4.5, 7, 0, 1.6, 0))
    g.add(lamp)
  }

  // mappamondo dorato
  const globe = G()
  globe.position.set(0, 0, 5.5)
  globe.add(cyl(0.3, 0.4, 0.08, brass, 0, 0.04, 0, 12))
  globe.add(cyl(0.05, 0.05, 0.9, brass, 0, 0.5, 0, 8))
  const earth = sph(0.42, rMat('flat', { color: '#3a5a7a', rough: 0.5, metal: 0.2 }), 0, 1.25, 0, 18)
  globe.add(earth)
  const mer1 = tor(0.45, 0.015, brass, 0, 1.25, 0, Math.PI * 2, 28)
  mer1.rotation.y = Math.PI / 2
  globe.add(mer1)
  const mer2 = tor(0.45, 0.015, brass, 0, 1.25, 0, Math.PI, 28)
  mer2.rotation.z = Math.PI / 2
  globe.add(mer2)
  g.add(globe)
  anims.push((t) => { earth.rotation.y = t * 0.15 })

  return g
}

/** rovine notturne all'aperto */
function buildRuins(anims: AnimCb[]): THREE.Group {
  const g = G()
  const rnd = rng(101)
  // terreno erboso con sentiero
  const ground = mesh(new THREE.CircleGeometry(22, 40), pbrMat('erba', '#3a4a30', { roughness: 0.95, rx: 10, ry: 10 }), 0, 0, 0)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  g.add(ground)
  const path = mesh(new THREE.PlaneGeometry(2.4, 16), pbrMat('ciottoli', '#8a8478', { roughness: 0.9, rx: 2, ry: 8 }), 0, 0.015, -6)
  path.rotation.x = -Math.PI / 2
  g.add(path)

  const marbleOld = rMat('marble', { color: '#b8b2a2', rough: 0.75, metal: 0, rx: 1, ry: 3 })
  const stone = stoneMat('#7a7468')

  // colonne spezzate
  const cols: [number, number, number, number][] = [
    [-6, -6, 4.2, 0], [-6.5, 0, 2.2, 0.12], [-5.5, 5, 1.4, -0.2],
    [6, -6, 3.6, 0], [6.6, 1, 2.0, -0.15], [5.6, 5.5, 1.1, 0.3],
    [-2.5, 9, 3.0, 0], [2.5, 9, 3.0, 0],
  ]
  for (const [x, z, h, tilt] of cols) {
    const c = G()
    c.position.set(x, 0, z)
    c.rotation.z = tilt
    c.add(box(1.4, 0.4, 1.4, stone, 0, 0.2, 0))
    c.add(cyl(0.42, 0.48, h, marbleOld, 0, 0.4 + h / 2, 0, 16))
    // cima spezzata: cono rovesciato
    const broken = cyl(0.1, 0.45, 0.5, marbleOld, 0, 0.4 + h + 0.2, 0, 12)
    broken.rotation.x = rnd() * 0.4
    c.add(broken)
    g.add(c)
  }
  // fusti caduti
  for (const [x, z, ry] of [[-1.5, 3, 0.6], [3, -3, -0.4]] as const) {
    const f = cyl(0.44, 0.44, 3.4, marbleOld, x, 0.44, z, 14)
    f.rotation.z = Math.PI / 2
    f.rotation.y = ry
    g.add(f)
  }
  // arco spezzato
  const arch = tor(3.2, 0.4, marbleOld, 0, 4.4, 9, Math.PI * 0.7, 24)
  g.add(arch)

  // altare centrale con sigillo
  const altar = G()
  altar.position.set(0, 0, 0)
  altar.add(box(3.2, 0.4, 3.2, stone, 0, 0.2, 0))
  altar.add(box(2.4, 0.4, 2.4, stone, 0, 0.6, 0))
  altar.add(box(1.6, 0.9, 1.6, marbleOld, 0, 1.25, 0))
  const rune = tor(1.1, 0.05, glowMat('#3aa0ff', 2.4), 0, 0.42, 0)
  rune.rotation.x = -Math.PI / 2
  rune.castShadow = false
  altar.add(rune)
  const rune2 = tor(0.7, 0.04, glowMat('#7ac8ff', 2), 0, 0.42, 0)
  rune2.rotation.x = -Math.PI / 2
  rune2.castShadow = false
  altar.add(rune2)
  const bLight = light('#3aa0ff', 6, 9, 0, 1.4, 0)
  altar.add(bLight)
  // pietre rune che orbitano
  const orbs: THREE.Mesh[] = []
  for (let i = 0; i < 5; i++) {
    const o = box(0.14, 0.14, 0.05, glowMat('#7ac8ff', 2.2), 0, 2.1, 0)
    o.castShadow = false
    altar.add(o)
    orbs.push(o)
  }
  g.add(altar)
  anims.push((t) => {
    const p = 0.7 + Math.sin(t * 1.8) * 0.3
    bLight.intensity = 4 + p * 4
    for (let i = 0; i < orbs.length; i++) {
      const a = t * 0.8 + (i / orbs.length) * Math.PI * 2
      orbs[i].position.set(Math.cos(a) * 1.3, 2.1 + Math.sin(t * 2 + i) * 0.15, Math.sin(a) * 1.3)
      orbs[i].lookAt(0, 2.1, 0)
    }
  })

  // bracieri
  for (const [x, z] of [[-4.5, -2.5], [4.5, -2.5], [-4, 6.5], [4, 6.5]] as const) {
    const b = buildBrazier(anims)
    b.position.set(x, 0, z)
    g.add(b)
  }

  // detriti
  for (let i = 0; i < 10; i++) {
    const r = 0.25 + rnd() * 0.5
    const d = mesh(new THREE.DodecahedronGeometry(r, 0), stone, (rnd() - 0.5) * 16, r * 0.6, (rnd() - 0.5) * 14)
    d.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3)
    g.add(d)
  }
  return g
}

// ============================================================
// REGISTRO PREFAB
// ============================================================

function def(d: PrefabDef): PrefabDef {
  return d
}

export const PREFAB_DEFS: PrefabDef[] = [
  // ---------- AMBIENTI ----------
  def({
    id: 'corridoio-spaziale',
    name: 'Corridoio della Stazione',
    cat: 'ambiente',
    icon: '🛰',
    desc: 'Corridoio in metallo bianco con robot, cartello REATTORE 1 e luce abbagliante in fondo.',
    size: [4.6, 3.6, 26],
    colliders: [
      { c: [0, 1.7, -2.32], s: [26, 3.4, 0.3] },
      { c: [0, 1.7, 2.32], s: [26, 3.4, 0.3] },
      { c: [12.85, 1.6, 0], s: [0.3, 3.2, 4.6] },
      { c: [-12.85, 1.25, 0], s: [0.3, 2.5, 4.6] },
    ],
    build: buildCorridor,
  }),
  def({
    id: 'cattedrale',
    name: 'Cattedrale Sacra',
    cat: 'ambiente',
    icon: '⛪',
    desc: 'Navata con colonne di marmo, cupola a cassettoni, altare dorato, leoni e 150 candele.',
    size: [16, 14, 30],
    colliders: [
      { c: [0, 5, -15.25], s: [16, 10, 0.5] },
      { c: [-8.25, 5, 0], s: [0.5, 10, 30] },
      { c: [8.25, 5, 0], s: [0.5, 10, 30] },
      { c: [0, 5, 15.3], s: [16, 10, 0.6] },
      { c: [0, 0.35, 10.2], s: [7, 0.3, 3.4] },
      { c: [0, 0.55, 10.6], s: [5.6, 0.3, 2.6] },
      { c: [0, 0.72, 11], s: [4.2, 0.3, 1.9] },
      { c: [0, 1.1, 11.2], s: [2.7, 1.6, 1.2] },
    ],
    build: buildCathedral,
  }),
  def({
    id: 'hangar',
    name: 'Hangar Industriale',
    cat: 'ambiente',
    icon: '🏗',
    desc: 'Capannone con gru a ponte, container, riflettori e pavimento in calcestruzzo.',
    size: [34, 9, 22],
    colliders: [
      { c: [0, 4.5, -11.1], s: [34, 9, 0.3] },
      { c: [-17.1, 4.5, 0], s: [0.3, 9, 22] },
      { c: [17.1, 4.5, 0], s: [0.3, 9, 22] },
    ],
    build: buildHangar,
  }),
  def({
    id: 'sala-macchine',
    name: 'Sala Macchine',
    cat: 'ambiente',
    icon: '⚙',
    desc: 'Due reattori al plasma pulsanti, passerelle, tubi e allarme rosso rotante.',
    size: [24, 7, 18],
    colliders: [
      { c: [0, 3.5, -9], s: [24, 7, 0.3] },
      { c: [-12, 3.5, 0], s: [0.3, 7, 18] },
      { c: [12, 3.5, 0], s: [0.3, 7, 18] },
      { c: [-7, 2.5, 0], s: [3.9, 5, 3.9] },
      { c: [7, 2.5, 0], s: [3.9, 5, 3.9] },
      { c: [0, 2.48, -5.5], s: [16, 0.16, 2.2] },
    ],
    build: buildEngineRoom,
  }),
  def({
    id: 'biblioteca',
    name: 'Biblioteca Antica',
    cat: 'ambiente',
    icon: '📚',
    desc: 'Scaffali colmi di libri, tavoli di lettura, lampade d\'ottone e mappamondo.',
    size: [22, 6, 16],
    colliders: [
      { c: [0, 3, -8], s: [22, 6, 0.3] },
      { c: [-11, 3, 0], s: [0.3, 6, 16] },
      { c: [11, 3, 0], s: [0.3, 6, 16] },
      { c: [0, 3, 8], s: [22, 6, 0.3] },
    ],
    build: buildLibrary,
  }),
  def({
    id: 'rovine',
    name: 'Rovine al Chiaro di Luna',
    cat: 'ambiente',
    icon: '🌙',
    desc: 'Colonne spezzate, altare con sigillo blu e bracieri accesi sotto le stelle.',
    size: [22, 6, 22],
    colliders: [
      { c: [0, 0.85, 0], s: [3.2, 1.7, 3.2] },
    ],
    build: buildRuins,
  }),

  // ---------- STRUTTURE ----------
  def({
    id: 'muro-pannello',
    name: 'Pannello di scafo',
    cat: 'struttura',
    icon: '🧱',
    desc: 'Modulo di parete in metallo bianco (4 × 3.2 m): combinali per costruire corridoi.',
    size: [4, 3.2, 0.3],
    colliders: [{ c: [0, 1.6, 0], s: [4, 3.2, 0.3] }],
    build: (anims) => {
      const g = G()
      g.add(box(4, 3.2, 0.24, rMat('whitePanel', { color: '#eef1f6', rough: 0.36, metal: 0.85, rx: 3, ry: 2 })))
      g.add(box(4.1, 0.22, 0.34, techMat('#39404d'), 0, 3.1, 0))
      g.add(box(4.1, 0.22, 0.34, techMat('#39404d'), 0, 0.1, 0))
      g.add(box(0.22, 3.2, 0.34, techMat('#39404d'), -1.95, 1.6, 0))
      g.add(box(0.22, 3.2, 0.34, techMat('#39404d'), 1.95, 1.6, 0))
      return g
    },
  }),
  def({
    id: 'pilastro-metallo',
    name: 'Pilastro strutturale',
    cat: 'struttura',
    icon: '🏛',
    desc: 'Colonna tecnica in metallo scuro con base e capitello (h 3.2 m).',
    size: [0.9, 3.2, 0.9],
    colliders: [{ c: [0, 1.6, 0], s: [0.7, 3.2, 0.7] }],
    build: () => {
      const g = G()
      g.add(box(0.8, 0.2, 0.8, techMat('#39404d'), 0, 0.1, 0))
      g.add(cyl(0.28, 0.34, 2.6, techMat('#4a5260'), 0, 1.5, 0, 14))
      g.add(tor(0.36, 0.04, techMat('#2c313a'), 0, 0.7, 0))
      g.add(tor(0.36, 0.04, techMat('#2c313a'), 0, 2.3, 0))
      g.add(box(0.8, 0.24, 0.8, techMat('#39404d'), 0, 3.05, 0))
      return g
    },
  }),
  def({
    id: 'passerella',
    name: 'Passerella con ringhiera',
    cat: 'struttura',
    icon: '🪜',
    desc: 'Camminamento in griglia (4 × 2 m) con ringhiere: ci si cammina sopra.',
    size: [4, 1.1, 2],
    colliders: [{ c: [0, 0.1, 0], s: [4, 0.2, 2] }],
    build: () => {
      const g = G()
      g.add(box(4, 0.16, 2, grateMat('#c8d2e2'), 0, 0, 0))
      for (const s of [-1, 1]) {
        g.add(box(4, 0.05, 0.05, techMat('#8a929e'), 0, 0.55, s * 0.95))
        for (const x of [-1.8, 0, 1.8]) {
          g.add(cyl(0.035, 0.035, 0.55, techMat('#8a929e'), x, 0.3, s * 0.95, 8))
        }
      }
      for (const [x, z] of [[-1.8, -0.9], [1.8, -0.9], [-1.8, 0.9], [1.8, 0.9]] as const) {
        g.add(cyl(0.05, 0.05, 0.1, techMat('#39404d'), x, -0.1, z, 8))
      }
      return g
    },
  }),
  def({
    id: 'unita-cargo',
    name: 'Container da carico',
    cat: 'struttura',
    icon: '📦',
    desc: 'Container corazzato 6 m: impilabile, colori assorti tinti dall\'ispettore.',
    size: [2.7, 2.7, 6.3],
    colliders: [{ c: [0, 1.35, 0], s: [2.7, 2.7, 6.3] }],
    build: () => {
      const g = G()
      g.add(box(2.6, 2.6, 6.2, containerMat('#2e62c8'), 0, 1.35, 0))
      for (const cor of [[-1.25, -3.05], [1.25, -3.05], [-1.25, 3.05], [1.25, 3.05]] as const) {
        g.add(box(0.22, 2.7, 0.22, techMat('#2c313a'), cor[0], 1.35, cor[1]))
      }
      g.add(box(2.62, 0.18, 6.22, techMat('#2c313a'), 0, 0.09, 0))
      g.add(box(2.3, 0.4, 0.1, hazardMat(), 0, 1.35, 3.12))
      return g
    },
  }),
  def({
    id: 'tubo-colonna',
    name: 'Grappolo di tubi',
    cat: 'struttura',
    icon: '🔧',
    desc: 'Tubo verticale con flange: dettaglio industriale da parete.',
    size: [0.8, 3.4, 0.8],
    colliders: [{ c: [0, 1.7, 0], s: [0.8, 3.4, 0.8] }],
    build: () => {
      const g = G()
      const pipes: [number, number, number][] = [[-0.2, 0.16, 0.22], [0.18, 0.13, -0.2], [0, 0.24, 0.05]]
      for (const [x, r, z] of pipes) {
        g.add(cyl(r, r, 3.4, techMat('#6a7280'), x, 1.7, z, 12))
        for (const y of [0.6, 1.8, 2.9]) {
          const f = tor(r + 0.04, 0.045, techMat('#39404d'), x, y, z)
          f.rotation.x = 0
          g.add(f)
        }
      }
      return g
    },
  }),

  // ---------- PROP ----------
  def({
    id: 'cassa',
    name: 'Cassa metallica',
    cat: 'prop',
    icon: '🗃',
    desc: 'Cassa industriale con spigoli di pericolo.',
    size: [1, 1, 1],
    colliders: [{ c: [0, 0.5, 0], s: [1, 1, 1] }],
    build: () => {
      const g = G()
      g.add(box(1, 1, 1, techMat('#4a5260'), 0, 0.5, 0))
      g.add(box(1.04, 0.12, 1.04, techMat('#2c313a'), 0, 0.5, 0))
      for (const e of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        g.add(box(0.1, 1.02, 0.1, hazardMat(), e[0] * 0.47, 0.5, e[1] * 0.47))
      }
      g.add(box(0.2, 0.08, 0.06, glowMat('#00f0ff', 1.4), 0, 0.78, 0.51))
      return g
    },
  }),
  def({
    id: 'barile',
    name: 'Barile arrugginito',
    cat: 'prop',
    icon: '🛢',
    desc: 'Barile in lamiera con cerchi e ruggine.',
    size: [0.9, 1.15, 0.9],
    colliders: [{ c: [0, 0.57, 0], s: [0.9, 1.15, 0.9] }],
    build: () => {
      const g = G()
      g.add(cyl(0.42, 0.42, 1.1, containerMat('#8a4a2a'), 0, 0.55, 0, 16))
      g.add(tor(0.43, 0.03, techMat('#4a3525'), 0, 0.35, 0))
      g.add(tor(0.43, 0.03, techMat('#4a3525'), 0, 0.85, 0))
      g.add(cyl(0.44, 0.44, 0.05, techMat('#3a2a1a'), 0, 1.1, 0, 16))
      return g
    },
  }),
  def({
    id: 'console',
    name: 'Console di controllo',
    cat: 'prop',
    icon: '🖥',
    desc: 'Postazione con schermo di telemetria animato.',
    size: [1.7, 1.5, 0.8],
    colliders: [{ c: [0, 0.55, 0], s: [1.7, 1.1, 0.8] }],
    build: (anims) => {
      const g = G()
      g.add(box(1.6, 0.85, 0.6, techMat('#2e3440'), 0, 0.43, 0))
      const scr = box(1.5, 0.75, 0.08, screenMat(), 0, 1.1, -0.12)
      scr.rotation.x = -0.28
      g.add(scr)
      g.add(box(1.7, 0.1, 0.7, techMat('#4a5260'), 0, 0.88, 0.05))
      g.add(light('#00f0ff', 1.2, 2.5, 0, 1.3, 0.3))
      // LED lampeggiante
      const led = sph(0.035, glowMat('#7cffb2', 2.4), 0.6, 0.95, 0.32, 8)
      led.castShadow = false
      g.add(led)
      anims.push((t) => {
        const m = led.material as THREE.MeshStandardMaterial
        m.emissiveIntensity = Math.sin(t * 4) > 0 ? 2.6 : 0.4
      })
      return g
    },
  }),
  def({
    id: 'ologramma',
    name: 'Ologramma olografico',
    cat: 'prop',
    icon: '💠',
    desc: 'Proiettore con ologramma rotante: perfetto per puzzle e nascondigli.',
    size: [1, 2, 1],
    colliders: [{ c: [0, 0.25, 0], s: [0.8, 0.5, 0.8] }],
    build: (anims) => {
      const g = G()
      g.add(cyl(0.5, 0.6, 0.18, techMat('#2e3440'), 0, 0.09, 0, 18))
      g.add(cyl(0.12, 0.16, 0.22, techMat('#4a5260'), 0, 0.28, 0, 12))
      const holo = mesh(
        new THREE.IcosahedronGeometry(0.32, 0),
        new THREE.MeshBasicMaterial({ color: '#19e0ff', wireframe: true, transparent: true, opacity: 0.75 }),
        0, 1.05, 0
      )
      holo.castShadow = false
      g.add(holo)
      const cone = mesh(
        new THREE.ConeGeometry(0.42, 0.9, 18, 1, true),
        rMat('flat', { color: '#19e0ff', rough: 1, opacity: 0.1, emissive: '#19e0ff', eInt: 0.6 }),
        0, 0.75, 0
      )
      cone.castShadow = false
      cone.receiveShadow = false
      g.add(cone)
      g.add(light('#19e0ff', 2.2, 4, 0, 1.1, 0))
      anims.push((t) => {
        holo.rotation.y = t * 1.2
        holo.rotation.x = Math.sin(t * 0.7) * 0.4
        holo.position.y = 1.05 + Math.sin(t * 2) * 0.05
      })
      return g
    },
  }),
  def({
    id: 'insegna-uscita',
    name: 'Insegna USCITA',
    cat: 'prop',
    icon: '🚪',
    desc: 'Cartello di emergenza luminoso verde.',
    size: [1.2, 0.4, 0.12],
    colliders: [{ c: [0, 0.2, 0], s: [1.2, 0.4, 0.12] }],
    build: () => {
      const g = G()
      g.add(box(1.15, 0.38, 0.1, signMat('USCITA', { bg: '#1a6a3a', fg: '#eafff2' }), 0, 0.2, 0))
      g.add(box(1.25, 0.06, 0.14, techMat('#2c313a'), 0, 0.42, 0))
      g.add(light('#7cffb2', 0.8, 2.5, 0, 0.2, 0.4))
      return g
    },
  }),
  def({
    id: 'insegna-pericolo',
    name: 'Insegna PERICOLO',
    cat: 'prop',
    icon: '⚠',
    desc: 'Cartello di avvertimento giallo e nero.',
    size: [1.2, 0.4, 0.12],
    colliders: [{ c: [0, 0.2, 0], s: [1.2, 0.4, 0.12] }],
    build: () => {
      const g = G()
      g.add(box(1.15, 0.38, 0.1, signMat('PERICOLO', { bg: '#d8b422', fg: '#101216' }), 0, 0.2, 0))
      g.add(box(1.25, 0.06, 0.14, techMat('#2c313a'), 0, 0.42, 0))
      return g
    },
  }),
  def({
    id: 'insegna-settore',
    name: 'Insegna SEZIONE 7',
    cat: 'prop',
    icon: '🅢',
    desc: 'Pannello direzionale ciano per corridoi e hangar.',
    size: [1.4, 0.4, 0.12],
    colliders: [{ c: [0, 0.2, 0], s: [1.4, 0.4, 0.12] }],
    build: () => {
      const g = G()
      g.add(box(1.35, 0.38, 0.1, signMat('SEZIONE 7', { bg: '#0a2a3a', fg: '#19e0ff', accent: '#19e0ff' }), 0, 0.2, 0))
      g.add(box(1.45, 0.06, 0.14, techMat('#2c313a'), 0, 0.42, 0))
      g.add(light('#19e0ff', 1, 3, 0, 0.2, 0.4))
      return g
    },
  }),
  def({
    id: 'pilastro-luce',
    name: 'Pilastro di luce',
    cat: 'prop',
    icon: '💡',
    desc: 'Lampada a colonna con testa luminosa.',
    size: [0.4, 1.3, 0.4],
    colliders: [{ c: [0, 0.6, 0], s: [0.3, 1.2, 0.3] }],
    build: () => {
      const g = G()
      g.add(cyl(0.16, 0.2, 0.08, techMat('#39404d'), 0, 0.04, 0, 12))
      g.add(cyl(0.05, 0.06, 1.05, techMat('#4a5260'), 0, 0.58, 0, 10))
      const top = cyl(0.17, 0.1, 0.18, glowMat('#e8f4ff', 2.6), 0, 1.18, 0, 12)
      top.castShadow = false
      g.add(top)
      g.add(light('#dff0ff', 4, 7, 0, 1.25, 0))
      return g
    },
  }),
  def({
    id: 'robot-sentinella',
    name: 'Robot di manutenzione',
    cat: 'prop',
    icon: '🤖',
    desc: 'Robotette con occhio arancione che scandaglia la zona.',
    size: [0.7, 1.1, 0.7],
    colliders: [{ c: [0, 0.55, 0], s: [0.55, 1.1, 0.55] }],
    build: buildRobot,
  }),
  def({
    id: 'panchina',
    name: 'Panchina',
    cat: 'prop',
    icon: '🪑',
    desc: 'Panchina in legno e ferro battuto.',
    size: [1.9, 0.9, 0.6],
    colliders: [{ c: [0, 0.35, 0], s: [1.8, 0.7, 0.6] }],
    build: buildBench,
  }),
  def({
    id: 'tavolo-legno',
    name: 'Tavolo di legno',
    cat: 'prop',
    icon: '🪵',
    desc: 'Tavolo massiccio con gambe tornite.',
    size: [1.7, 0.9, 1],
    colliders: [{ c: [0, 0.45, 0], s: [1.7, 0.9, 1] }],
    build: () => {
      const g = G()
      g.add(box(1.6, 0.09, 0.9, pbrMat('legno', '#7a5836', { roughness: 0.7, rx: 1, ry: 1 }), 0, 0.82, 0))
      for (const [x, z] of [[-0.7, -0.35], [0.7, -0.35], [-0.7, 0.35], [0.7, 0.35]] as const) {
        g.add(cyl(0.05, 0.07, 0.8, oldGoldMat(), x, 0.4, z, 10))
      }
      return g
    },
  }),
  def({
    id: 'sedia',
    name: 'Sedia',
    cat: 'prop',
    icon: '💺',
    desc: 'Sedia in legno con schienale.',
    size: [0.55, 1, 0.55],
    colliders: [{ c: [0, 0.5, 0], s: [0.5, 1, 0.5] }],
    build: () => {
      const g = G()
      const wood = pbrMat('legno', '#6a4a2c', { roughness: 0.85, rx: 1, ry: 1 })
      g.add(box(0.5, 0.06, 0.5, wood, 0, 0.48, 0))
      g.add(box(0.5, 0.55, 0.06, wood, 0, 0.78, -0.23))
      for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]] as const) {
        g.add(cyl(0.035, 0.035, 0.48, wood, x, 0.24, z, 8))
      }
      return g
    },
  }),
  def({
    id: 'libreria',
    name: 'Libreria',
    cat: 'prop',
    icon: '📚',
    desc: 'Scaffale colmo di libri colorati (2.2 × 3 m).',
    size: [2.3, 3.1, 0.5],
    colliders: [{ c: [0, 1.55, 0], s: [2.3, 3.1, 0.5] }],
    build: buildShelf,
  }),
  def({
    id: 'candela-grande',
    name: 'Candela cerimoniale',
    cat: 'prop',
    icon: '🕯',
    desc: 'Candela alta con fiamma che trema e illumina.',
    size: [0.25, 0.85, 0.25],
    colliders: [{ c: [0, 0.3, 0], s: [0.22, 0.6, 0.22] }],
    build: (anims) => {
      const g = G()
      g.add(cyl(0.14, 0.18, 0.12, oldGoldMat(), 0, 0.06, 0, 12))
      const cd = buildCandle(0.62, true, anims)
      cd.position.set(0, 0.12, 0)
      g.add(cd)
      return g
    },
  }),
  def({
    id: 'braciere',
    name: 'Braciere',
    cat: 'prop',
    icon: '🔥',
    desc: 'Braciere in ferro con fuoco vivo e luce calda.',
    size: [1, 1.9, 1],
    colliders: [{ c: [0, 0.5, 0], s: [0.8, 1, 0.8] }],
    build: buildBrazier,
  }),
  def({
    id: 'statua-leone',
    name: 'Leone di pietra',
    cat: 'prop',
    icon: '🦁',
    desc: 'Statua su piedistallo: sorveglia altari e portali.',
    size: [1.1, 1.6, 1.1],
    colliders: [{ c: [0, 0.8, 0], s: [1, 1.6, 1] }],
    build: () => {
      const g = G()
      g.add(box(1, 0.7, 0.9, stoneMat('#9a8f7a'), 0, 0.35, 0))
      const lion = buildLion(stoneMat('#b0a48c'))
      lion.position.set(0, 0.68, 0)
      g.add(lion)
      return g
    },
  }),
  def({
    id: 'croce-oro',
    name: 'Croce d\'oro',
    cat: 'prop',
    icon: '✝',
    desc: 'Croce dorata su basamento: per altari e cappelle.',
    size: [0.6, 1.5, 0.6],
    colliders: [{ c: [0, 0.25, 0], s: [0.5, 0.5, 0.5] }],
    build: () => {
      const g = G()
      g.add(box(0.5, 0.5, 0.5, marbleMat(), 0, 0.25, 0))
      g.add(cyl(0.07, 0.1, 0.35, goldMat(), 0, 0.65, 0, 10))
      const c1 = box(0.1, 0.62, 0.04, goldMat(), 0, 1.12, 0)
      const c2 = box(0.04, 0.1, 0.34, goldMat(), 0, 1.18, 0)
      c1.castShadow = c2.castShadow = false
      g.add(c1, c2)
      g.add(light('#ffe9b0', 1.2, 3, 0, 1.3, 0))
      return g
    },
  }),
  def({
    id: 'roccia',
    name: 'Roccia',
    cat: 'prop',
    icon: '🪨',
    desc: 'Blocco di roccia frastagliato.',
    size: [1.2, 0.9, 1.2],
    colliders: [{ c: [0, 0.35, 0], s: [1, 0.7, 1] }],
    build: () => {
      const g = G()
      const r = mesh(new THREE.DodecahedronGeometry(0.6, 0), stoneMat('#8a8478'), 0, 0.32, 0)
      r.scale.y = 0.72
      r.rotation.set(0.4, 0.8, 0.2)
      g.add(r)
      return g
    },
  }),
]

export const PREFABS: Record<string, PrefabDef> = Object.fromEntries(
  PREFAB_DEFS.map(p => [p.id, p])
)

/** costruisce un oggetto del mondo; con applyTransform=false la
 *  posizione/rotazione/scala resta da applicare dall'esterno */
export function buildRObject(o: RObject, anims: AnimCb[], applyTransform = true): THREE.Group | null {
  const def = PREFABS[o.prefab]
  if (!def) return null
  const g = def.build(anims)
  if (applyTransform) {
    g.position.set(o.p[0], o.p[1], o.p[2])
    g.rotation.set(
      THREE.MathUtils.degToRad(o.r[0]),
      THREE.MathUtils.degToRad(o.r[1]),
      THREE.MathUtils.degToRad(o.r[2])
    )
    g.scale.set(o.s[0], o.s[1], o.s[2])
  }
  // override del materiale (cloni privati, mai mutare le cache)
  if (o.mat) {
    g.traverse(n => {
      const m = n as THREE.Mesh
      if (!m.isMesh || !m.material) return
      const cloneMat = (src: THREE.Material): THREE.Material => {
        const c = src.clone()
        if (o.mat!.color !== undefined && 'color' in c) (c as THREE.MeshStandardMaterial).color = new THREE.Color(o.mat!.color)
        if (o.mat!.rough !== undefined && 'roughness' in c) (c as THREE.MeshStandardMaterial).roughness = o.mat!.rough
        if (o.mat!.metal !== undefined && 'metalness' in c) (c as THREE.MeshStandardMaterial).metalness = o.mat!.metal
        if (o.mat!.emissive !== undefined && 'emissive' in c) {
          ;(c as THREE.MeshStandardMaterial).emissive = new THREE.Color(o.mat!.emissive)
          ;(c as THREE.MeshStandardMaterial).emissiveIntensity = o.mat!.eInt ?? 1
        }
        return c
      }
      m.material = Array.isArray(m.material) ? m.material.map(cloneMat) : cloneMat(m.material)
    })
  }
  return g
}

/** collider di un oggetto trasformati in coordinate mondo (AABB) */
export function collidersOf(o: RObject): THREE.Box3[] {
  const def = PREFABS[o.prefab]
  if (!def) return []
  const out: THREE.Box3[] = []
  const e = new THREE.Euler(
    THREE.MathUtils.degToRad(o.r[0]),
    THREE.MathUtils.degToRad(o.r[1]),
    THREE.MathUtils.degToRad(o.r[2])
  )
  const q = new THREE.Quaternion().setFromEuler(e)
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(o.p[0], o.p[1], o.p[2]),
    q,
    new THREE.Vector3(o.s[0], o.s[1], o.s[2])
  )
  const v = new THREE.Vector3()
  for (const c of def.colliders) {
    const box = new THREE.Box3()
    for (let i = 0; i < 8; i++) {
      v.set(
        c.c[0] + (i & 1 ? c.s[0] / 2 : -c.s[0] / 2),
        c.c[1] + (i & 2 ? c.s[1] / 2 : -c.s[1] / 2),
        c.c[2] + (i & 4 ? c.s[2] / 2 : -c.s[2] / 2)
      ).applyMatrix4(m)
      box.expandByPoint(v)
    }
    out.push(box)
  }
  return out
}
