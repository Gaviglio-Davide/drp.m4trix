// ============================================================
// Darpx3D · anatomy — costruttori di creature
// Ogni archetipo assembla un corpo credibile: colonne spine
// organiche, arti a due segmenti, crani con muso/occhi/corna,
// ali con ossa e membrane, code, zanne. Il risultato è un
// THREE.Group che guarda +Z, con i piedi verso y=0.
// ============================================================

import * as THREE from 'three'
import type { RNG } from './rng'
import type { MatBag } from './materials'
import type { GenSpec } from './parse'
import {
  addPart, place, blob, capsule, taperedCyl, organicTube, membrane,
  roundedBox, cone, lathe,
} from './parts'
import {
  eyePair, hornPair, earPair, dorsalSpikes, claws, hoof, tailTuft,
  gem, coreGlow, orientBetween, scales,
} from './detail'
import { buildWeapon } from './objects'

export type Ctx = {
  spec: GenSpec
  rng: RNG
  mats: MatBag
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ============================================================
// DRAGO — il fiore all'occhiello
// ============================================================

function buildDragon(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const bulk = spec.sizeClass === 'huge' ? 1.25 : spec.sizeClass === 'big' ? 1.1 : 1
  const leggy = rng.range(0.92, 1.1)

  // ---- corpo e coda (un'unica colonna organica) ----
  const spine = [
    V(0, 0.62 * leggy, -1.55),      // punta coda
    V(0, 0.46 * leggy, -1.05),
    V(0, 0.52 * leggy, -0.55),      // fianchi
    V(0, 0.55 * leggy, -0.05),      // pancia
    V(0, 0.68 * leggy, 0.42),       // petto
  ]
  const radii = [0.03, 0.11, 0.24 * bulk, 0.31 * bulk, 0.34 * bulk]
  const body = organicTube(spine, radii, 14, 0.5)
  addPart(g, body, mats.primary, 'Corpo')

  // ---- collo ----
  const neckBase = spine[spine.length - 1]
  const neck = [
    neckBase.clone(),
    V(0, neckBase.y + 0.28, neckBase.z + 0.22),
    V(0, neckBase.y + 0.55, neckBase.z + 0.34),
    V(0, neckBase.y + 0.72, neckBase.z + 0.4),
  ]
  const neckGeo = organicTube(neck, [radii[radii.length - 1] * 0.92, 0.24, 0.17, 0.14], 12, 0.5)
  addPart(g, neckGeo, mats.primary, 'Collo')

  // ---- testa ----
  const headC = neck[neck.length - 1].clone().add(V(0, 0.14, 0.12))
  buildReptileHead(g, ctx, headC, 0.23 * bulk, {
    snout: 0.34, horns: spec.features.has('horns'), frills: rng.chance(0.5),
  })

  // ---- zampe (4, due anteriori più sottili) ----
  const legs: [number, number, number][] = [
    [0.3, 0.38, 0.34], [-0.3, 0.38, 0.34],     // anteriori (dx, sx)
    [0.34, 0.5, -0.52], [-0.34, 0.5, -0.52],   // posteriori
  ]
  legs.forEach(([x, hy, z], i) => {
    const front = i < 2
    const thick = front ? 0.09 * bulk : 0.12 * bulk
    const kneeZ = z + (front ? 0.1 : -0.12)
    const hip = V(x, hy, z)
    const knee = V(x * 1.12, hy * 0.45, kneeZ)
    const ankle = V(x * 1.12, 0.07, kneeZ + (front ? -0.04 : 0.1))
    limbSegment(g, mats.primary, hip, knee, thick, thick * 0.8, `Zampa ${i + 1}a`)
    limbSegment(g, mats.primary, knee, ankle, thick * 0.78, thick * 0.6, `Zampa ${i + 1}b`)
    const foot = blob(thick * 1.15, thick * 0.6, thick * 1.7, 8)
    place(foot, { pos: [ankle.x, ankle.y + 0.03, ankle.z + thick * 0.7] })
    addPart(g, foot, mats.primary, `Piede ${i + 1}`)
    claws(g, mats, ankle.clone().add(V(0, 0.02, thick * 0.8)), thick * 1.5)
  })

  // ---- ali ----
  if (spec.features.has('wings')) {
    for (const side of [1, -1] as const) buildWing(g, ctx, V(side * 0.24 * bulk, 0.8 * leggy, 0.32), side, 1.35 * bulk)
  }

  // ---- spuntoni dorsali ----
  const spineCurve = new THREE.CatmullRomCurve3([...spine, ...neck], false, 'catmullrom', 0.5)
  if (spec.features.has('spikes')) {
    dorsalSpikes(g, mats, spineCurve, 14, 0.16 * bulk, { taper: 0.72 })
  }

  // ---- piastre ventrali ----
  bellyPlates(g, mats, new THREE.CatmullRomCurve3(spine, false, 'catmullrom', 0.5), radii, 10, bulk)

  // ---- pinna caudale ----
  const tailTip = spine[0]
  const finMat = mats.membrane
  for (const dir of [1, -1]) {
    const fin = cone(0.16 * bulk, 0.4 * bulk, 4)
    place(fin, {
      pos: [tailTip.x + dir * 0.02, tailTip.y + 0.14, tailTip.z - 0.05],
      rot: [0, 0, dir * 0.9],
      scale: [1, 1, 0.18],
    })
    addPart(g, fin, finMat, 'Pinna coda')
  }

  // ---- soffio di fuoco ----
  if (spec.features.has('fire')) {
    const flame = cone(0.14, 0.5, 8)
    place(flame, {
      pos: [headC.x, headC.y - 0.02, headC.z + 0.48],
      rot: [Math.PI / 2, 0, 0],
      scale: [1, 1, 1],
    })
    addPart(g, flame, mats.accent, 'Soffio')
  }

  // ---- squame sparse ----
  if (spec.features.has('scales') && rng.chance(0.8)) {
    scales(g, mats, body, rng, 26, { size: 0.055 * bulk })
  }
  return g
}

/** testa da rettile: cranio + muso + mascella + corna + occhi a fessura */
function buildReptileHead(
  g: THREE.Group,
  ctx: Ctx,
  c: THREE.Vector3,
  r: number,
  opts: { snout: number; horns: boolean; frills?: boolean }
): void {
  const { mats, rng } = ctx
  const skull = blob(r, r * 0.9, r * 1.05, 12)
  place(skull, { pos: [c.x, c.y, c.z] })
  addPart(g, skull, mats.primary, 'Cranio')

  // muso
  const snout = roundedBox(r * 1.15, r * 0.75, opts.snout, r * 0.18)
  place(snout, { pos: [c.x, c.y + r * 0.08, c.z + r * 0.9 + opts.snout * 0.3] })
  addPart(g, snout, mats.primary, 'Muso')

  // mascella inferiore (leggermente aperta)
  const jaw = roundedBox(r * 0.95, r * 0.4, opts.snout * 0.85, r * 0.12)
  place(jaw, {
    pos: [c.x, c.y - r * 0.42, c.z + r * 0.75 + opts.snout * 0.25],
    rot: [0.12, 0, 0],
  })
  addPart(g, jaw, mats.secondary, 'Mascella')

  // narici
  for (const s of [1, -1]) {
    const n = blob(r * 0.09, r * 0.09, r * 0.09, 6)
    place(n, { pos: [c.x + s * r * 0.3, c.y + r * 0.28, c.z + r * 0.9 + opts.snout * 0.62] })
    addPart(g, n, mats.secondary, 'Narice')
  }

  // denti
  for (let i = 0; i < 4; i++) {
    const t = cone(r * 0.05, r * 0.16, 4)
    place(t, {
      pos: [c.x + (i % 2 === 0 ? -1 : 1) * r * 0.28, c.y - r * 0.18, c.z + r * 0.8 + (i >> 1) * opts.snout * 0.3],
      rot: [Math.PI, 0, 0],
    })
    addPart(g, t, mats.byId('ossa'), 'Dente')
  }

  // occhi a fessura
  eyePair(g, mats, c.clone().add(V(0, r * 0.1, r * 0.25)), r, { slit: true, wide: 0.62 })

  // corna
  if (opts.horns) {
    const n = rng.chance(0.35) ? 2 : 1 // coppia principale (eventuale secondaria più corta)
    hornPair(g, mats, V(c.x, c.y + r * 0.72, c.z - r * 0.2), r * (1.6 + n * 0.3), { spread: 0.4, back: 1.1 })
    if (n === 2) {
      hornPair(g, mats, V(c.x, c.y + r * 0.4, c.z - r * 0.5), r * 0.9, { spread: 0.75, back: 1.4 })
    }
  }

  // frille/orecchie da rettile
  if (opts.frills) {
    for (const s of [1, -1]) {
      const f = cone(r * 0.35, r * 0.9, 5)
      place(f, {
        pos: [c.x + s * r * 0.85, c.y + r * 0.25, c.z - r * 0.55],
        rot: [0.2, 0, s * -2.2],
        scale: [1, 1, 0.22],
      })
      addPart(g, f, mats.membrane, 'Frill')
    }
  }
}

/** segmento di arto tra due giunti: capsula affusolata orientata */
function limbSegment(
  g: THREE.Group,
  mat: THREE.Material,
  a: THREE.Vector3,
  b: THREE.Vector3,
  rA: number,
  rB: number,
  name: string
): void {
  const len = a.distanceTo(b)
  const geo = taperedCyl(rA, rB, len, 10, 1, false)
  geo.computeBoundingBox()
  const bb = geo.boundingBox!
  const geoH = Math.max(0.001, bb.max.y - bb.min.y)
  const dir = b.clone().sub(a).normalize()
  const mid = a.clone().lerp(b, 0.5)
  const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir)
  const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, len / geoH, 1))
  geo.applyMatrix4(m)
  addPart(g, geo, mat, name)
}

/** ala: omero + avambraccio + 3 dita + membrane tra le punte */
function buildWing(g: THREE.Group, ctx: Ctx, shoulder: THREE.Vector3, side: 1 | -1, span: number): void {
  const { mats, rng } = ctx
  const boneMat = mats.primary
  const wrist = shoulder.clone().add(V(side * span * 0.62, span * 0.3, -span * 0.12))
  const elbow = shoulder.clone().lerp(wrist, 0.52).add(V(0, -span * 0.04, -span * 0.1))
  limbSegment(g, boneMat, shoulder, elbow, span * 0.05, span * 0.04, `Omero ${side > 0 ? 'dx' : 'sx'}`)
  limbSegment(g, boneMat, elbow, wrist, span * 0.04, span * 0.032, `Avambraccio ${side > 0 ? 'dx' : 'sx'}`)

  const fingerSpread = rng.range(0.85, 1.15)
  const tips = [
    wrist.clone().add(V(side * span * 0.55, span * 0.34 * fingerSpread, span * 0.1)),   // dito 1 (frontale-alto)
    wrist.clone().add(V(side * span * 0.62, -span * 0.02, span * 0.22)),                 // dito 2
    wrist.clone().add(V(side * span * 0.42, -span * 0.36, span * 0.3)),                  // dito 3
  ]
  tips.forEach((t, i) => {
    limbSegment(g, boneMat, wrist, t, span * 0.026, span * 0.012, `Dito ${i + 1}`)
  })

  // membrane: tra dita consecutive e tra l'ultimo dito e il corpo
  const bodyRoot = shoulder.clone().add(V(side * -0.06, -span * 0.22, -span * 0.3))
  membraneAt(g, mats.membrane, wrist, tips[0], tips[1], 0.22)
  membraneAt(g, mats.membrane, wrist, tips[1], tips[2], 0.26)
  membraneAt(g, mats.membrane, bodyRoot, tips[2], V(bodyRoot.x, bodyRoot.y - span * 0.1, bodyRoot.z + span * 0.5), 0.3)

  // artiglio al polso
  const claw = cone(span * 0.02, span * 0.09, 5)
  place(claw, { pos: [wrist.x, wrist.y + span * 0.03, wrist.z + span * 0.02], rot: [0.6, 0, 0] })
  addPart(g, claw, mats.horn, 'Artiglio ala')
}

function membraneAt(
  g: THREE.Group,
  mat: THREE.Material,
  root: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
  sag: number
): void {
  const geo = membrane(root, a, b, sag, 6)
  addPart(g, geo, mat, 'Membrana')
}

/** fila di piastre ventrali lungo la pancia */
function bellyPlates(
  g: THREE.Group,
  mats: MatBag,
  curve: THREE.CatmullRomCurve3,
  radii: number[],
  count: number,
  bulk: number
): void {
  const mat = mats.secondary
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count
    const p = curve.getPointAt(t)
    const r = radii[Math.min(radii.length - 1, Math.floor(t * (radii.length - 1)) + 1)]
    const plate = blob(r * 0.72 * bulk, r * 0.28, r * 0.5, 8)
    place(plate, { pos: [p.x, p.y - r * 0.86, p.z] })
    addPart(g, plate, mat, `Piastra ${i + 1}`)
  }
}

// ============================================================
// SERPENTE — avvolto a spirale, testa eretta
// ============================================================

function buildSerpent(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const bulk = spec.sizeClass === 'huge' ? 1.3 : 1
  const bodyR = 0.13 * bulk

  // spirale a terra + risalita
  const pts: THREE.Vector3[] = []
  const coils = rng.int(1, 2) + 1
  const total = coils * Math.PI * 2
  for (let i = 0; i <= 26; i++) {
    const t = i / 26
    if (t < 0.62) {
      // avvolgimento a terra
      const a = total * (t / 0.62) + Math.PI * 0.5
      const r = (0.52 - t * 0.18) * bulk
      pts.push(V(Math.cos(a) * r, bodyR * 0.95 + t * 0.06, Math.sin(a) * r - 0.1))
    } else {
      // risalita a S
      const u = (t - 0.62) / 0.38
      const last = pts[pts.length - 1]
      pts.push(
        V(
          Math.sin(u * Math.PI * 2) * 0.12 * bulk,
          bodyR + u * (1.05 - bodyR),
          last.z * (1 - u) + 0.3 * u
        )
      )
    }
  }
  const radii = pts.map((_, i) => {
    const t = i / (pts.length - 1)
    return bodyR * (0.4 + 0.6 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5)) * (1 - t * 0.25)
  })
  const body = organicTube(pts, radii, 12, 0.4)
  addPart(g, body, mats.primary, 'Corpo')

  // testa
  const headC = pts[pts.length - 1].clone().add(V(0, 0.1, 0.06))
  buildReptileHead(g, ctx, headC, bodyR * 1.5, { snout: bodyR * 1.1, horns: spec.features.has('horns') })

  // cappuccio da cobra
  if (spec.subject.includes('cobra')) {
    const hood = blob(bodyR * 1.9, bodyR * 2.3, bodyR * 0.32, 12)
    place(hood, { pos: [headC.x, headC.y + bodyR * 0.2, headC.z - bodyR * 1.4] })
    addPart(g, hood, mats.membrane, 'Cappuccio')
  }
  return g
}

// ============================================================
// UMANOIDE — cavaliere, mago, persona…
// ============================================================

function buildHumanoid(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const H = spec.sizeClass === 'huge' ? 2.3 : spec.sizeClass === 'big' ? 1.95 : spec.sizeClass === 'small' ? 1.4 : 1.75
  const s = H / 1.75 // fattore di scala globale
  const armored = spec.features.has('armor')
  const robe = spec.features.has('hood') // mago/strega: veste al posto delle gambe
  const headR = 0.115 * s * (spec.features.has('big') ? 0.9 : 1)

  // ---- gambe o veste ----
  if (robe) {
    // veste conica dal petto al pavimento
    const robeGeo = taperedCyl(0.34 * s, 0.16 * s, 1.05 * s, 14)
    place(robeGeo, { pos: [0, 0.52 * s, 0] })
    addPart(g, robeGeo, mats.secondary, 'Veste')
    // orlo
    const hem = new THREE.TorusGeometry(0.34 * s, 0.02 * s, 8, 18)
    place(hem, { pos: [0, 0.015 * s, 0], rot: [Math.PI / 2, 0, 0] })
    addPart(g, hem, mats.primary, 'Orlo')
    // piedi che spuntano
    for (const side of [1, -1]) {
      const f = roundedBox(0.09 * s, 0.06 * s, 0.22 * s, 0.02)
      place(f, { pos: [side * 0.09 * s, 0.03 * s, 0.05 * s] })
      addPart(g, f, mats.byId('cuoio'), 'Piede')
    }
  } else {
    for (const side of [1, -1]) {
      const hip = V(side * 0.095 * s, 0.86 * s, 0)
      const knee = V(side * 0.105 * s, 0.46 * s, 0.045 * s)
      const ankle = V(side * 0.105 * s, 0.07 * s, -0.01 * s)
      limbSegment(g, mats.secondary, hip, knee, 0.075 * s, 0.06 * s, `Coscia ${side > 0 ? 'dx' : 'sx'}`)
      limbSegment(g, mats.secondary, knee, ankle, 0.058 * s, 0.042 * s, `Stinco ${side > 0 ? 'dx' : 'sx'}`)
      const foot = roundedBox(0.1 * s, 0.07 * s, 0.24 * s, 0.02)
      place(foot, { pos: [ankle.x, 0.045 * s, ankle.z + 0.06 * s] })
      addPart(g, foot, mats.byId('cuoio'), `Piede ${side > 0 ? 'dx' : 'sx'}`)
      // schinieri
      if (armored) {
        const greave = taperedCyl(0.068 * s, 0.05 * s, 0.36 * s, 8)
        place(greave, { pos: [knee.x, (knee.y + ankle.y) / 2, knee.z + 0.012 * s] })
        addPart(g, greave, mats.primary, `Schiniera ${side > 0 ? 'dx' : 'sx'}`)
      }
    }
  }

  // ---- bacino ----
  const pelvis = blob(0.15 * s, 0.1 * s, 0.1 * s, 10)
  place(pelvis, { pos: [0, 0.9 * s, 0] })
  addPart(g, pelvis, mats.secondary, 'Bacino')

  // ---- torso ----
  const torso = organicTube(
    [V(0, 0.92 * s, 0), V(0, 1.08 * s, 0.01 * s), V(0, 1.28 * s, 0.02 * s), V(0, 1.46 * s, 0)],
    [0.145 * s, 0.155 * s, 0.165 * s, 0.14 * s],
    12,
    0.5
  )
  addPart(g, torso, armored ? mats.secondary : mats.primary, 'Torso')

  // pettorale
  if (armored) {
    const chest = blob(0.175 * s, 0.2 * s, 0.135 * s, 12)
    place(chest, { pos: [0, 1.3 * s, 0.035 * s] })
    addPart(g, chest, mats.primary, 'Pettorale')
  }

  // ---- testa ----
  const headC = V(0, 1.63 * s, 0.01 * s)
  const skull = blob(headR, headR * 1.12, headR * 1.05, 12)
  place(skull, { pos: [headC.x, headC.y, headC.z] })
  addPart(g, skull, mats.byId('pelle'), 'Testa')
  // naso
  const nose = cone(headR * 0.14, headR * 0.34, 5)
  place(nose, { pos: [headC.x, headC.y - headR * 0.05, headC.z + headR * 0.95], rot: [Math.PI / 2, 0, 0] })
  addPart(g, nose, mats.byId('pelle'), 'Naso')
  eyePair(g, mats, headC, headR * 1.05, { wide: 0.42 })
  // cappuccio (mago)
  if (spec.features.has('hood')) {
    const hood = cone(headR * 1.35, headR * 2.3, 10)
    place(hood, { pos: [headC.x, headC.y + headR * 0.5, headC.z - headR * 0.35], rot: [0.35, 0, 0] })
    addPart(g, hood, mats.secondary, 'Cappuccio')
    const peak = cone(headR * 0.55, headR * 1.1, 8)
    place(peak, { pos: [headC.x, headC.y + headR * 1.6, headC.z - headR * 1], rot: [-0.5, 0, 0] })
    addPart(g, peak, mats.secondary, 'Punta cappuccio')
  }
  // elmo
  if (spec.features.has('helmet')) {
    const dome = blob(headR * 1.12, headR * 1.05, headR * 1.12, 12)
    place(dome, { pos: [headC.x, headC.y + headR * 0.25, headC.z] })
    addPart(g, dome, mats.primary, 'Elmo')
    // cimiero
    if (rng.chance(0.7)) {
      const crest = cone(headR * 0.3, headR * 1.5, 6)
      place(crest, { pos: [headC.x, headC.y + headR * 1.4, headC.z - headR * 0.2], scale: [1, 1, 0.35] })
      addPart(g, crest, mats.accent, 'Cimiero')
    }
    // nasale
    const nasal = roundedBox(headR * 0.16, headR * 0.8, headR * 0.16, 0.01)
    place(nasal, { pos: [headC.x, headC.y - headR * 0.1, headC.z + headR * 1] })
    addPart(g, nasal, mats.primary, 'Nasale')
  }
  // corona (re/regina)
  if (spec.features.has('crown')) {
    const band = new THREE.TorusGeometry(headR * 0.95, headR * 0.1, 6, 14)
    place(band, { pos: [headC.x, headC.y + headR * 0.85, headC.z], rot: [Math.PI / 2, 0, 0] })
    addPart(g, band, mats.byId('oro'), 'Corona')
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      const p = cone(headR * 0.12, headR * 0.42, 4)
      place(p, { pos: [headC.x + Math.cos(a) * headR * 0.9, headC.y + headR * 1.1, headC.z + Math.sin(a) * headR * 0.9] })
      addPart(g, p, mats.byId('oro'), 'Punta corona')
    }
  }
  // chioma
  if (!spec.features.has('helmet') && !spec.features.has('hood') && rng.chance(0.85)) {
    const hair = blob(headR * 1.08, headR * 0.95, headR * 1.02, 10)
    place(hair, { pos: [headC.x, headC.y + headR * 0.22, headC.z - headR * 0.14] })
    addPart(g, hair, new THREE.MeshStandardMaterial({
      color: rng.pick(['#3a2a1a', '#191512', '#6b4a2a', '#8a8378', '#c9952e']),
      roughness: 1,
    }), 'Chioma')
  }

  // ---- braccia ----
  for (const side of [1, -1]) {
    const shoulder = V(side * 0.21 * s, 1.47 * s, 0)
    const elbow = V(side * 0.26 * s, 1.16 * s, 0.03 * s)
    const wrist = V(side * 0.27 * s, 0.9 * s, 0.1 * s)
    limbSegment(g, armored ? mats.secondary : mats.primary, shoulder, elbow, 0.06 * s, 0.048 * s, `Braccio ${side > 0 ? 'dx' : 'sx'}`)
    limbSegment(g, armored ? mats.secondary : mats.primary, elbow, wrist, 0.046 * s, 0.036 * s, `Avambraccio ${side > 0 ? 'dx' : 'sx'}`)
    const hand = blob(0.045 * s, 0.06 * s, 0.05 * s, 8)
    place(hand, { pos: [wrist.x, wrist.y - 0.04 * s, wrist.z] })
    addPart(g, hand, mats.byId('pelle'), `Mano ${side > 0 ? 'dx' : 'sx'}`)
    // spallaccio
    if (armored) {
      const pauldron = blob(0.088 * s, 0.075 * s, 0.088 * s, 10)
      place(pauldron, { pos: [shoulder.x, shoulder.y + 0.02 * s, shoulder.z] })
      addPart(g, pauldron, mats.primary, `Spallaccio ${side > 0 ? 'dx' : 'sx'}`)
    }
    // arma nella mano destra
    if (side === 1 && spec.held) {
      const weapon = buildWeapon(spec.held, ctx, 0.9 * s)
      weapon.position.set(wrist.x, wrist.y - 0.02 * s, wrist.z + 0.03 * s)
      weapon.rotation.set(-0.25, 0, 0.12)
      weapon.name = 'Arma in mano'
      g.add(weapon)
    }
  }

  // ---- cintura ----
  const belt = new THREE.TorusGeometry(0.155 * s, 0.022 * s, 6, 16)
  place(belt, { pos: [0, 0.98 * s, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.72] })
  addPart(g, belt, mats.byId('cuoio'), 'Cintura')
  gem(g, mats, V(0, 0.98 * s, 0.13 * s), 0.03 * s)

  return g
}

// ============================================================
// QUADRUPEDE — cavallo, lupo, orso…
// ============================================================

function buildQuadruped(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const horse = !spec.subject.includes('lupo') && !spec.subject.includes('cane') && !spec.subject.includes('orso') &&
    !spec.subject.includes('cinghiale') && !spec.subject.includes('volpe') && !spec.subject.includes('leone') &&
    !spec.subject.includes('tigre') && !spec.subject.includes('pantera') && !spec.subject.includes('grifone')
  const bulk = (spec.subject.includes('orso') ? 1.4 : spec.subject.includes('lupo') ? 0.85 : 1) *
    (spec.sizeClass === 'huge' ? 1.25 : spec.sizeClass === 'big' ? 1.12 : 1)

  // ---- corpo ----
  const spine = [
    V(0, 1.02, -0.72),
    V(0, 1.06, -0.3),
    V(0, 1.08, 0.1),
    V(0, 1.1, 0.5),
  ]
  const radii = [0.16 * bulk, 0.27 * bulk, 0.3 * bulk, 0.3 * bulk]
  const body = organicTube(spine, radii, 14, 0.5)
  addPart(g, body, mats.primary, 'Corpo')

  // ---- collo e testa ----
  const chest = spine[spine.length - 1]
  const neckPts = [
    chest.clone(),
    V(0, 1.32, 0.78),
    V(0, 1.52, 0.9),
  ]
  const neck = organicTube(neckPts, [0.24 * bulk, 0.16 * bulk, 0.13 * bulk], 12, 0.5)
  addPart(g, neck, mats.primary, 'Collo')

  const headC = V(0, 1.62, 1.02)
  const headR = 0.15 * bulk
  const skull = blob(headR, headR * 0.95, headR * 1.1, 12)
  place(skull, { pos: [headC.x, headC.y, headC.z] })
  addPart(g, skull, mats.primary, 'Cranio')
  // muso lungo (cavallo) o corto (lupo/orso)
  const snoutLen = horse ? headR * 1.7 : headR * 1.05
  const snout = taperedCyl(headR * 0.62, headR * 0.4, snoutLen, 10)
  place(snout, { pos: [headC.x, headC.y - headR * 0.18, headC.z + headR * 0.9 + snoutLen * 0.4], rot: [Math.PI / 2 + 0.18, 0, 0] })
  addPart(g, snout, mats.primary, 'Muso')
  // muso scuro
  const muzzle = blob(headR * 0.42, headR * 0.38, headR * 0.3, 8)
  place(muzzle, { pos: [headC.x, headC.y - headR * 0.42 - snoutLen * 0.16, headC.z + headR * 0.9 + snoutLen * 0.85] })
  addPart(g, muzzle, mats.secondary, 'Tartufo')
  eyePair(g, mats, headC.clone().add(V(0, headR * 0.18, headR * 0.3)), headR, { wide: 0.62 })
  earPair(g, mats, V(headC.x, headC.y + headR * 0.75, headC.z - headR * 0.3), headR * 1.15, 0.55)
  // corna (unicorno)
  if (spec.features.has('horns') && horse) {
    const horn = cone(headR * 0.16, headR * 1.9, 8)
    place(horn, { pos: [headC.x, headC.y + headR * 1.3, headC.z + headR * 0.2], rot: [0.25, 0, 0] })
    addPart(g, horn, mats.byId('oro'), 'Corno')
  }
  // palchi di cervo
  if (spec.features.has('antlers')) {
    for (const side of [1, -1]) {
      const base = V(headC.x + side * headR * 0.55, headC.y + headR * 0.8, headC.z - headR * 0.2)
      for (const [dx, dy, dz] of [[0.35, 0.55, -0.1], [0.15, 0.85, -0.25], [0.4, 0.95, 0.05]]) {
        const branch = taperedCyl(headR * 0.06, headR * 0.1, headR * 1.2, 6)
        orientBetween(branch, base, base.clone().add(V(side * dx * headR, dy * headR, dz * headR)), headR * 1.2)
        addPart(g, branch, mats.horn, 'Palco')
      }
    }
  }
  // criniera
  if (horse || spec.features.has('mane')) {
    const maneMat = new THREE.MeshStandardMaterial({ color: mats.secondary.color.clone().multiplyScalar(0.5), roughness: 1 })
    for (let i = 0; i < 7; i++) {
      const t = i / 6
      const p = new THREE.CatmullRomCurve3(neckPts).getPointAt(t)
      const tuft = cone(0.045 * bulk, 0.22 * bulk, 5)
      place(tuft, { pos: [p.x, p.y + 0.13 * bulk, p.z - 0.08], rot: [-0.5, 0, 0], scale: [1, 1, 0.5] })
      addPart(g, tuft, maneMat, 'Criniera')
    }
  }

  // ---- zampe ----
  const legX = 0.19 * bulk
  const legDefs: [number, number][] = [[legX, 0.46], [-legX, 0.46], [legX, -0.62], [-legX, -0.62]]
  legDefs.forEach(([x, z], i) => {
    const hip = V(x, 0.98, z)
    const knee = V(x * 1.05, 0.5, z + (z > 0 ? 0.06 : -0.08))
    const ankle = V(x * 1.05, 0.12, z + (z > 0 ? 0 : 0.12))
    limbSegment(g, mats.primary, hip, knee, 0.075 * bulk, 0.06 * bulk, `Zampa ${i + 1}a`)
    limbSegment(g, mats.primary, knee, ankle, 0.055 * bulk, 0.045 * bulk, `Zampa ${i + 1}b`)
    if (horse) hoof(g, mats, ankle, 0.13 * bulk)
    else {
      const foot = blob(0.075 * bulk, 0.05 * bulk, 0.1 * bulk, 8)
      place(foot, { pos: [ankle.x, ankle.y + 0.03, ankle.z + 0.04] })
      addPart(g, foot, mats.primary, `Zampa ${i + 1} piede`)
      claws(g, mats, ankle, 0.1 * bulk)
    }
  })

  // ---- coda ----
  const tailBase = V(0, 1.05, -0.75)
  if (horse) {
    const tail = organicTube(
      [tailBase, V(0, 1.18, -0.95), V(0, 1.05, -1.2)],
      [0.07 * bulk, 0.05 * bulk, 0.03 * bulk], 8, 0.5
    )
    addPart(g, tail, mats.primary, 'Coda')
    tailTuft(g, mats, V(0, 0.98, -1.28), 0.22 * bulk, V(0, -1, -0.25))
  } else {
    const tail = organicTube(
      [tailBase, V(0, 0.78, -1.0), V(0, 0.5, -1.15)],
      [0.07 * bulk, 0.05 * bulk, 0.02 * bulk], 8, 0.5
    )
    addPart(g, tail, mats.primary, 'Coda')
  }

  // ---- sella ----
  if (spec.features.has('saddle') && horse) {
    const seat = roundedBox(0.3 * bulk, 0.09, 0.34 * bulk, 0.03)
    place(seat, { pos: [0, 1.22 * bulk, -0.12], rot: [0.06, 0, 0] })
    addPart(g, seat, mats.byId('cuoio'), 'Sella')
    const blanket = roundedBox(0.44 * bulk, 0.03, 0.5 * bulk, 0.01)
    place(blanket, { pos: [0, 1.16 * bulk, -0.1] })
    addPart(g, blanket, mats.accent, 'Gualdrappa')
  }

  // ---- ali (pegaso/grifone) ----
  if (spec.features.has('wings')) {
    for (const side of [1, -1] as const) buildWing(g, ctx, V(side * 0.2 * bulk, 1.28, 0.15), side, 1.15 * bulk)
  }
  return g
}

// ============================================================
// UCCELLO
// ============================================================

function buildBird(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const phoenix = spec.features.has('fire')
  const s = spec.sizeClass === 'huge' ? 1.5 : spec.sizeClass === 'big' ? 1.2 : spec.sizeClass === 'small' ? 0.7 : 1

  // corpo
  const body = blob(0.16 * s, 0.24 * s, 0.3 * s, 12)
  place(body, { pos: [0, 0.52 * s, 0] })
  addPart(g, body, mats.primary, 'Corpo')

  // testa
  const headC = V(0, 0.86 * s, 0.14 * s)
  const headR = 0.12 * s
  const skull = blob(headR, headR, headR, 12)
  place(skull, { pos: [headC.x, headC.y, headC.z] })
  addPart(g, skull, mats.primary, 'Testa')
  eyePair(g, mats, headC, headR, { wide: 0.5 })
  // becco
  const beak = cone(headR * 0.4, headR * 1.1, 6)
  place(beak, { pos: [headC.x, headC.y - headR * 0.05, headC.z + headR * 1.2], rot: [Math.PI / 2, 0, 0] })
  addPart(g, beak, mats.byId('oro'), 'Becco')
  // cresta
  if (rng.chance(0.6)) {
    for (let i = 0; i < 3; i++) {
      const c = cone(headR * 0.16, headR * (0.7 - i * 0.12), 5)
      place(c, { pos: [headC.x, headC.y + headR * (0.9 + i * 0.05), headC.z - headR * i * 0.35], scale: [1, 1, 0.4] })
      addPart(g, c, mats.accent, 'Cresta')
    }
  }
  // collo
  const neck = organicTube(
    [V(0, 0.62 * s, 0.05 * s), V(0, 0.78 * s, 0.12 * s), headC.clone()],
    [0.11 * s, 0.09 * s, 0.08 * s], 10, 0.5
  )
  addPart(g, neck, mats.primary, 'Collo')

  // ali spiegate o ripiegate
  const spread = rng.chance(0.7)
  for (const side of [1, -1]) {
    if (spread) {
      const shoulder = V(side * 0.14 * s, 0.6 * s, 0)
      const wrist = shoulder.clone().add(V(side * 0.55 * s, 0.16 * s, 0))
      const tip1 = wrist.clone().add(V(side * 0.42 * s, 0.1 * s, 0.12 * s))
      const tip2 = wrist.clone().add(V(side * 0.45 * s, -0.06 * s, -0.02 * s))
      const tip3 = wrist.clone().add(V(side * 0.3 * s, -0.2 * s, -0.14 * s))
      limbSegment(g, mats.primary, shoulder, wrist, 0.045 * s, 0.03 * s, `Ala ${side > 0 ? 'dx' : 'sx'}`)
      ;[tip1, tip2, tip3].forEach((t, i) => {
        limbSegment(g, mats.primary, wrist, t, 0.028 * s, 0.01 * s, `Penna ${i + 1}`)
      })
      membraneAt(g, phoenix ? mats.accent : mats.membrane, shoulder.clone().add(V(0, -0.08 * s, 0)), tip1, tip2, 0.2)
      membraneAt(g, phoenix ? mats.accent : mats.membrane, shoulder.clone().add(V(0, -0.1 * s, -0.05 * s)), tip2, tip3, 0.25)
    } else {
      const wing = roundedBox(0.07 * s, 0.3 * s, 0.42 * s, 0.03)
      place(wing, { pos: [side * 0.17 * s, 0.52 * s, -0.03 * s], rot: [0.15, 0, side * -0.25] })
      addPart(g, wing, mats.primary, `Ala ${side > 0 ? 'dx' : 'sx'}`)
    }
  }

  // coda a ventaglio
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 0.9
    const feather = cone(0.07 * s, 0.55 * s, 5)
    place(feather, {
      pos: [Math.sin(a) * 0.3 * s, 0.42 * s - Math.cos(a) * 0.06 * s, -0.42 * s - Math.cos(a) * 0.08 * s],
      rot: [Math.PI / 2 + 0.35 + Math.cos(a) * 0.1, 0, a * 0.9],
      scale: [1, 1, 0.25],
    })
    addPart(g, feather, phoenix ? mats.accent : mats.secondary, `Penna coda ${i + 1}`)
  }

  // zampe
  for (const side of [1, -1]) {
    limbSegment(g, mats.byId('oro'), V(side * 0.07 * s, 0.32 * s, 0), V(side * 0.08 * s, 0.05 * s, 0.02 * s), 0.022 * s, 0.018 * s, `Zampa ${side > 0 ? 'dx' : 'sx'}`)
    for (const [dx, dz] of [[0, 1], [-0.6, 0.6], [0.6, 0.6]] as const) {
      const toe = capsule(0.012 * s, 0.07 * s, 3, 6)
      place(toe, { pos: [side * 0.08 * s + dx * 0.03 * s, 0.025 * s, 0.05 * s + dz * 0.03 * s], rot: [Math.PI / 2, 0, 0] })
      addPart(g, toe, mats.byId('oro'), 'Dito')
    }
  }
  return g
}

// ============================================================
// PESCE
// ============================================================

function buildFish(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng, spec } = ctx
  const s = spec.sizeClass === 'huge' ? 1.6 : spec.sizeClass === 'big' ? 1.25 : spec.sizeClass === 'small' ? 0.65 : 1

  const body = blob(0.14 * s, 0.26 * s, 0.46 * s, 14)
  place(body, { pos: [0, 0.55 * s, 0] })
  addPart(g, body, mats.primary, 'Corpo')

  // pinna caudale
  const tail = new THREE.Shape()
  tail.moveTo(0, 0)
  tail.lineTo(-0.34 * s, 0.26 * s)
  tail.quadraticCurveTo(-0.24 * s, 0, -0.34 * s, -0.26 * s)
  tail.lineTo(0, 0)
  const tailGeo = new THREE.ShapeGeometry(tail, 8)
  place(tailGeo, { pos: [0, 0.55 * s, -0.42 * s], rot: [0, Math.PI / 2, 0] })
  addPart(g, tailGeo, mats.membrane, 'Coda')

  // pinna dorsale
  const dorsal = cone(0.16 * s, 0.3 * s, 4)
  place(dorsal, { pos: [0, 0.78 * s, -0.02 * s], scale: [0.22, 1, 1] })
  addPart(g, dorsal, mats.membrane, 'Pinna dorsale')

  // pinne pettorali
  for (const side of [1, -1]) {
    const fin = cone(0.1 * s, 0.22 * s, 4)
    place(fin, {
      pos: [side * 0.15 * s, 0.5 * s, 0.14 * s],
      rot: [Math.PI / 2, 0, side * 0.9],
      scale: [1, 1, 0.25],
    })
    addPart(g, fin, mats.membrane, `Pinna ${side > 0 ? 'dx' : 'sx'}`)
  }

  // occhi grandi
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#f4f2e8', roughness: 0.2 })
  const pupMat = new THREE.MeshStandardMaterial({ color: '#101014', roughness: 0.1 })
  for (const side of [1, -1]) {
    const e = blob(0.05 * s, 0.05 * s, 0.035 * s, 10)
    place(e, { pos: [side * 0.12 * s, 0.62 * s, 0.28 * s] })
    addPart(g, e, eyeMat, 'Occhio')
    const p = blob(0.024 * s, 0.024 * s, 0.02 * s, 8)
    place(p, { pos: [side * 0.155 * s, 0.62 * s, 0.3 * s] })
    addPart(g, p, pupMat, 'Pupilla')
  }

  // bocca
  const mouth = new THREE.TorusGeometry(0.06 * s, 0.012 * s, 6, 12, Math.PI)
  place(mouth, { pos: [0, 0.44 * s, 0.43 * s], rot: [Math.PI / 2 + 0.4, 0, 0] })
  addPart(g, mouth, mats.secondary, 'Bocca')

  // branchie
  for (const side of [1, -1]) {
    for (let i = 0; i < 3; i++) {
      const gr = new THREE.TorusGeometry(0.1 * s - i * 0.012 * s, 0.005 * s, 4, 10, Math.PI * 0.7)
      place(gr, { pos: [side * 0.1 * s, 0.55 * s, 0.18 * s], rot: [0, Math.PI / 2, -Math.PI * 0.35] })
      addPart(g, gr, mats.secondary, 'Branchia')
    }
  }
  void rng
  return g
}

// ============================================================
// ROBOT / GOLEM
// ============================================================

function buildRobot(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { rng, mats, spec } = ctx
  const s = spec.sizeClass === 'huge' ? 1.4 : spec.sizeClass === 'big' ? 1.15 : 1

  // gambe
  for (const side of [1, -1]) {
    limbSegment(g, mats.primary, V(side * 0.14 * s, 0.85 * s, 0), V(side * 0.15 * s, 0.12 * s, 0), 0.08 * s, 0.07 * s, `Gamba ${side > 0 ? 'dx' : 'sx'}`)
    const knee = blob(0.075 * s, 0.06 * s, 0.075 * s, 8)
    place(knee, { pos: [side * 0.145 * s, 0.48 * s, 0] })
    addPart(g, knee, mats.secondary, `Ginocchio ${side > 0 ? 'dx' : 'sx'}`)
    const foot = roundedBox(0.16 * s, 0.1 * s, 0.26 * s, 0.02)
    place(foot, { pos: [side * 0.15 * s, 0.05 * s, 0.04 * s] })
    addPart(g, foot, mats.secondary, `Piede ${side > 0 ? 'dx' : 'sx'}`)
  }

  // bacino
  const pelvis = roundedBox(0.34 * s, 0.18 * s, 0.22 * s, 0.03)
  place(pelvis, { pos: [0, 0.92 * s, 0] })
  addPart(g, pelvis, mats.secondary, 'Bacino')

  // torso
  const torso = roundedBox(0.46 * s, 0.5 * s, 0.28 * s, 0.035)
  place(torso, { pos: [0, 1.28 * s, 0] })
  addPart(g, torso, mats.primary, 'Torso')
  coreGlow(g, mats, V(0, 1.3 * s, 0.145 * s), 0.13 * s)

  // pannelli
  for (let i = 0; i < 3; i++) {
    const panel = roundedBox(0.08 * s, 0.05 * s, 0.012 * s, 0.004)
    place(panel, { pos: [rng.range(-0.16, 0.16) * s, 1.14 * s + i * 0.09 * s, 0.145 * s] })
    addPart(g, panel, mats.secondary, `Pannello ${i + 1}`)
  }

  // testa
  const head = new THREE.CylinderGeometry(0.13 * s, 0.14 * s, 0.2 * s, 10)
  place(head, { pos: [0, 1.68 * s, 0] })
  addPart(g, head, mats.primary, 'Testa')
  // visore
  const visor = roundedBox(0.2 * s, 0.05 * s, 0.04 * s, 0.01)
  place(visor, { pos: [0, 1.69 * s, 0.13 * s] })
  addPart(g, visor, mats.accent, 'Visore')
  // antenna
  const ant = taperedCyl(0.008 * s, 0.005 * s, 0.16 * s, 6)
  place(ant, { pos: [0.08 * s, 1.85 * s, 0] })
  addPart(g, ant, mats.secondary, 'Antenna')
  const ball = blob(0.02 * s, 0.02 * s, 0.02 * s, 8)
  place(ball, { pos: [0.08 * s, 1.94 * s, 0] })
  addPart(g, ball, mats.accent, 'Lucina')

  // braccia
  for (const side of [1, -1]) {
    const shoulder = V(side * 0.27 * s, 1.48 * s, 0)
    const elbow = V(side * 0.32 * s, 1.12 * s, 0.04 * s)
    const wrist = V(side * 0.33 * s, 0.84 * s, 0.1 * s)
    const shoulderBall = blob(0.085 * s, 0.085 * s, 0.085 * s, 10)
    place(shoulderBall, { pos: [shoulder.x, shoulder.y, shoulder.z] })
    addPart(g, shoulderBall, mats.secondary, `Spalla ${side > 0 ? 'dx' : 'sx'}`)
    limbSegment(g, mats.primary, shoulder, elbow, 0.065 * s, 0.055 * s, `Braccio ${side > 0 ? 'dx' : 'sx'}`)
    const elbowBall = blob(0.058 * s, 0.058 * s, 0.058 * s, 8)
    place(elbowBall, { pos: [elbow.x, elbow.y, elbow.z] })
    addPart(g, elbowBall, mats.secondary, `Gomito ${side > 0 ? 'dx' : 'sx'}`)
    limbSegment(g, mats.primary, elbow, wrist, 0.052 * s, 0.045 * s, `Avambraccio ${side > 0 ? 'dx' : 'sx'}`)
    // mano a pinza
    for (const d of [0.06, -0.02]) {
      const finger = roundedBox(0.035 * s, 0.12 * s, 0.045 * s, 0.01)
      place(finger, { pos: [wrist.x + d * s, wrist.y - 0.08 * s, wrist.z + 0.02 * s], rot: [d * 2, 0, 0] })
      addPart(g, finger, mats.secondary, 'Dito')
    }
  }
  return g
}

// ============================================================
// registro archetipi
// ============================================================

export const ARCHETYPES: Record<string, (ctx: Ctx) => THREE.Group> = {
  dragon: buildDragon,
  serpent: buildSerpent,
  humanoid: buildHumanoid,
  quadruped: buildQuadruped,
  bird: buildBird,
  fish: buildFish,
  robot: buildRobot,
}
