// ============================================================
// Darpx3D · objects — armi, scudi, veicoli, edifici, alberi e
// oggetti di scena. Ogni builder torna un THREE.Group centrato
// con i piedi a y=0 (o, per le armi, impugnatura in basso).
// ============================================================

import * as THREE from 'three'
import type { RNG } from './rng'
import type { MatBag } from './materials'
import type { Ctx } from './anatomy'
import { addPart, place, blob, taperedCyl, lathe, roundedBox, cone, extrudeShape, jitter, organicTube } from './parts'
import { gem } from './detail'

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// ============================================================
// ARMI
// ============================================================

/** arma completa: chiamata dall'esterno con kind e scala */
export function buildWeapon(kind: 'sword' | 'axe' | 'staff' | 'spear', ctx: Ctx, scale = 1): THREE.Group {
  const g = new THREE.Group()
  const { mats, spec, rng } = ctx
  if (kind === 'sword') buildSword(g, ctx, 1.1 * scale, spec.features.has('fire'))
  else if (kind === 'axe') buildAxe(g, ctx, 1.15 * scale)
  else if (kind === 'staff') buildStaff(g, ctx, 1.5 * scale)
  else buildSpear(g, ctx, 1.6 * scale)
  void rng
  return g
}

function buildSword(g: THREE.Group, ctx: Ctx, L: number, flaming: boolean): void {
  const { mats } = ctx
  // lama: profilo a losanga con punta
  const bladeLen = L * 0.62
  const shape = new THREE.Shape()
  const w = L * 0.045
  shape.moveTo(0, bladeLen * 0.18)
  shape.lineTo(w, bladeLen * 0.1)
  shape.lineTo(w * 0.7, bladeLen * 0.86)
  shape.lineTo(0, bladeLen * 1.02)
  shape.lineTo(-w * 0.7, bladeLen * 0.86)
  shape.lineTo(-w, bladeLen * 0.1)
  shape.closePath()
  const blade = extrudeShape(shape, w * 0.5, w * 0.25)
  place(blade, { pos: [0, L * 0.3 + bladeLen * 0.45, 0] })
  addPart(g, blade, flaming ? ctx.mats.accent : ctx.mats.byId('acciaio'), 'Lama')

  // guardia
  const guard = roundedBox(L * 0.24, L * 0.028, L * 0.05, 0.008)
  place(guard, { pos: [0, L * 0.3, 0] })
  addPart(g, guard, mats.byId('oro'), 'Guardia')
  // impugnatura
  const grip = taperedCyl(L * 0.022, L * 0.026, L * 0.24, 8)
  place(grip, { pos: [0, L * 0.17, 0] })
  addPart(g, grip, mats.byId('cuoio'), 'Impugnatura')
  // pomolo con gemma
  const pommel = blob(L * 0.035, L * 0.035, L * 0.035, 10)
  place(pommel, { pos: [0, L * 0.04, 0] })
  addPart(g, pommel, mats.byId('oro'), 'Pomolo')
  gem(g, mats, V(0, L * 0.3, L * 0.035), L * 0.016)
}

function buildAxe(g: THREE.Group, ctx: Ctx, L: number): void {
  const { mats } = ctx
  // manico
  const haft = taperedCyl(L * 0.022, L * 0.03, L * 0.86, 8)
  place(haft, { pos: [0, L * 0.43, 0] })
  addPart(g, haft, mats.byId('legno'), 'Manico')
  // testa: mezzaluna estrusa
  const head = new THREE.Shape()
  head.moveTo(0, L * 0.1)
  head.quadraticCurveTo(L * 0.24, L * 0.22, L * 0.2, L * 0.34)
  head.lineTo(0, L * 0.3)
  head.quadraticCurveTo(-L * 0.24, L * 0.22, -L * 0.2, L * 0.34)
  head.lineTo(0, L * 0.1)
  const headGeo = extrudeShape(head, L * 0.035, L * 0.012)
  place(headGeo, { pos: [0, L * 0.62, 0] })
  addPart(g, headGeo, mats.byId('ferro'), 'Testa')
  // raccordo
  const collar = taperedCyl(L * 0.03, L * 0.024, L * 0.06, 8)
  place(collar, { pos: [0, L * 0.6, 0] })
  addPart(g, collar, mats.byId('oro'), 'Raccordo')
}

function buildStaff(g: THREE.Group, ctx: Ctx, L: number): void {
  const { mats, rng } = ctx
  const shaft = taperedCyl(L * 0.018, L * 0.028, L * 0.9, 8)
  place(shaft, { pos: [0, L * 0.45, 0] })
  addPart(g, shaft, mats.byId('legno'), 'Asta')
  // estremità ricurve
  const tipCurve = organicStaffTop(L)
  addPart(g, tipCurve, mats.byId('legno'), 'Punta curva')
  // sfera magica
  const orb = blob(L * 0.045, L * 0.045, L * 0.045, 12)
  place(orb, { pos: [L * 0.028, L * 0.95, 0] })
  addPart(g, orb, mats.accent, 'Sfera magica')
  // anelli decorativi
  for (let i = 0; i < 2; i++) {
    const ring = new THREE.TorusGeometry(L * 0.026, L * 0.006, 6, 12)
    place(ring, { pos: [0, L * (0.2 + i * 0.12), 0], rot: [Math.PI / 2, 0, 0] })
    addPart(g, ring, mats.byId('oro'), 'Anello')
  }
  void rng
}

function organicStaffTop(L: number): THREE.BufferGeometry {
  // piccolo rampino in cima al bastone
  const geo = organicTube(
    [V(0, L * 0.86, 0), V(L * 0.03, L * 0.94, 0), V(L * 0.05, L * 0.98, 0), V(L * 0.02, L * 1.0, 0)],
    [L * 0.02, L * 0.016, L * 0.012, L * 0.008],
    8,
    0.5
  )
  return geo
}

function buildSpear(g: THREE.Group, ctx: Ctx, L: number): void {
  const { mats } = ctx
  const shaft = taperedCyl(L * 0.015, L * 0.022, L * 0.88, 8)
  place(shaft, { pos: [0, L * 0.44, 0] })
  addPart(g, shaft, mats.byId('legno'), 'Asta')
  const tip = cone(L * 0.03, L * 0.16, 6)
  place(tip, { pos: [0, L * 0.94, 0] })
  addPart(g, tip, mats.byId('ferro'), 'Punta')
  const collar = new THREE.TorusGeometry(L * 0.02, L * 0.005, 6, 10)
  place(collar, { pos: [0, L * 0.86, 0], rot: [Math.PI / 2, 0, 0] })
  addPart(g, collar, mats.byId('cuoio'), 'Rivestimento')
}

// ============================================================
// SCUDO
// ============================================================

function buildShield(ctx: Ctx): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng, spec } = ctx
  const R = 0.45
  if (spec.features.has('round')) {
    // rotella circolare
    const face = new THREE.CylinderGeometry(R, R, 0.05, 20)
    place(face, { pos: [0, R + 0.08, 0], rot: [Math.PI / 2, 0, 0] })
    addPart(g, face, mats.primary, 'Corpo')
    const rim = new THREE.TorusGeometry(R, 0.03, 8, 24)
    place(rim, { pos: [0, R + 0.08, 0.026] })
    addPart(g, rim, mats.byId('ferro'), 'Bordo')
    const boss = blob(0.1, 0.1, 0.06, 12)
    place(boss, { pos: [0, R + 0.08, 0.06] })
    addPart(g, boss, mats.byId('oro'), 'Ombelico')
  } else {
    // scudo a goccia (heater)
    const shape = new THREE.Shape()
    shape.moveTo(-R, R * 0.9)
    shape.lineTo(R, R * 0.9)
    shape.quadraticCurveTo(R * 1.02, -R * 0.2, 0, -R * 1.05)
    shape.quadraticCurveTo(-R * 1.02, -R * 0.2, -R, R * 0.9)
    const face = extrudeShape(shape, 0.045, 0.015)
    place(face, { pos: [0, R + 0.1, 0] })
    addPart(g, face, mats.primary, 'Corpo')
    const boss = blob(0.085, 0.085, 0.05, 12)
    place(boss, { pos: [0, R * 0.85, 0.045] })
    addPart(g, boss, mats.byId('oro'), 'Ombelico')
    // emblema: strisce diagonali
    for (const d of [1, -1]) {
      const stripe = roundedBox(0.07, R * 1.5, 0.012, 0.006)
      place(stripe, { pos: [d * R * 0.28, R + 0.05, 0.032], rot: [0, 0, d * -0.5] })
      addPart(g, stripe, mats.secondary, 'Emblema')
    }
  }
  // maniglie dietro (invisibili ma ci sono)
  void rng
  return g
}

// ============================================================
// VEICOLI
// ============================================================

function buildVehicle(ctx: Ctx, kind: 'ship' | 'cart'): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng } = ctx
  if (kind === 'ship') {
    // scafo: profilo tornito tagliato... uso estrusione di forme
    const hull = new THREE.Shape()
    hull.moveTo(-0.9, 0.15)
    hull.quadraticCurveTo(-0.5, 0.5, 0, 0.52)
    hull.quadraticCurveTo(0.5, 0.5, 0.95, 0.28)
    hull.lineTo(0.75, 0.05)
    hull.quadraticCurveTo(0, -0.28, -0.7, 0.02)
    hull.closePath()
    const hullGeo = extrudeShape(hull, 0.55, 0.03)
    hullGeo.rotateX(Math.PI / 2)
    place(hullGeo, { pos: [0, 0.42, 0] })
    addPart(g, hullGeo, mats.byId('legno'), 'Scafo')
    // prua rialzata
    const bow = taperedCyl(0.1, 0.16, 0.5, 8)
    place(bow, { pos: [0, 0.62, 0.86], rot: [-0.5, 0, 0] })
    addPart(g, bow, mats.byId('legno'), 'Prua')
    // ponte
    const deck = roundedBox(1.3, 0.05, 0.42, 0.02)
    place(deck, { pos: [0, 0.62, 0.1] })
    addPart(g, deck, mats.byId('quercia'), 'Ponte')
    // albero + vela
    const mast = taperedCyl(0.035, 0.05, 1.7, 8)
    place(mast, { pos: [0, 1.45, 0.1] })
    addPart(g, mast, mats.byId('pino'), 'Albero')
    const sailShape = new THREE.Shape()
    sailShape.moveTo(-0.5, 0)
    sailShape.quadraticCurveTo(0.28, 0.35, 0.5, 0.85)
    sailShape.lineTo(-0.42, 0.85)
    sailShape.quadraticCurveTo(-0.36, 0.3, -0.5, 0)
    const sail = new THREE.ShapeGeometry(sailShape, 10)
    place(sail, { pos: [0.01, 0.75, 0.1], rot: [0, -Math.PI / 2, 0] })
    addPart(g, sail, new THREE.MeshStandardMaterial({
      color: mats.secondary.color,
      roughness: 0.9,
      side: THREE.DoubleSide,
    }), 'Vela')
    // bandiera
    const flag = new THREE.PlaneGeometry(0.34, 0.18)
    place(flag, { pos: [0, 2.34, 0.1], rot: [0, Math.PI / 2, 0] })
    addPart(g, flag, mats.accent, 'Bandiera')
    // cannoni laterali
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const c = taperedCyl(0.03, 0.04, 0.22, 8)
        place(c, { pos: [side * 0.3, 0.52, 0.45 - i * 0.32], rot: [0, 0, side * Math.PI / 2] })
        addPart(g, c, mats.byId('ferro'), `Cannone ${i + 1}`)
      }
    }
  } else {
    // carro
    const bed = roundedBox(1.05, 0.16, 0.62, 0.03)
    place(bed, { pos: [0, 0.62, 0] })
    addPart(g, bed, mats.byId('quercia'), 'Pianale')
    // sponde laterali
    for (const s of [1, -1]) {
      const side1 = roundedBox(1.05, 0.3, 0.05, 0.02)
      place(side1, { pos: [0, 0.82, s * 0.3] })
      addPart(g, side1, mats.byId('pino'), `Sponda ${s > 0 ? 'dx' : 'sx'}`)
    }
    // ruote a raggi
    for (const side of [1, -1]) {
      const wheel = new THREE.TorusGeometry(0.3, 0.035, 8, 18)
      place(wheel, { pos: [side * 0.36, 0.34, 0.26], rot: [0, Math.PI / 2, 0] })
      addPart(g, wheel, mats.byId('legno'), `Ruota ${side > 0 ? 'dx' : 'sx'}`)
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2
        const spoke = taperedCyl(0.018, 0.018, 0.56, 6)
        place(spoke, {
          pos: [side * 0.36, 0.34, 0.26],
          rot: [a, 0, 0],
        })
        addPart(g, spoke, mats.byId('legno'), `Raggio ${side > 0 ? 'dx' : 'sx'}${i + 1}`)
      }
    }
    // stanghe
    for (const side of [1, -1]) {
      const pole = taperedCyl(0.025, 0.03, 0.8, 6)
      place(pole, { pos: [side * 0.16, 0.56, 0.68], rot: [Math.PI / 2, 0, 0] })
      addPart(g, pole, mats.byId('legno'), 'Stanga')
    }
    // casse sul pianale
    const crate = roundedBox(0.3, 0.26, 0.34, 0.02)
    place(crate, { pos: [-0.28, 0.82, 0] })
    addPart(g, crate, mats.byId('pino'), 'Cassa')
    const barrel = lathe([[0.12, 0], [0.15, 0.13], [0.12, 0.26]], 12)
    place(barrel, { pos: [0.22, 0.7, 0.1] })
    addPart(g, barrel, mats.byId('quercia'), 'Bariletto')
  }
  void rng
  return g
}

// ============================================================
// EDIFICI
// ============================================================

function buildBuilding(ctx: Ctx, kind: string, floors: number): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng } = ctx
  const wallMat = mats.byId('quercia')

  if (kind === 'tower') {
    const H = 2.2
    const base = taperedCyl(0.42, 0.5, 0.3, 12)
    place(base, { pos: [0, 0.15, 0] })
    addPart(g, base, mats.byId('pietra'), 'Basamento')
    const shaft = taperedCyl(0.34, 0.42, H, 12)
    place(shaft, { pos: [0, H / 2 + 0.2, 0] })
    addPart(g, shaft, mats.byId('pietra'), 'Fusto')
    // merlature
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2
      const merlon = roundedBox(0.14, 0.16, 0.1, 0.02)
      place(merlon, { pos: [Math.cos(a) * 0.4, H + 0.28, Math.sin(a) * 0.4], rot: [0, -a, 0] })
      addPart(g, merlon, mats.byId('pietra'), `Merlo ${i + 1}`)
    }
    // tetto conico
    const roof = cone(0.5, 0.7, 10)
    place(roof, { pos: [0, H + 0.75, 0] })
    addPart(g, roof, mats.primary, 'Tetto')
    // finestre
    for (let i = 0; i < 3; i++) {
      const win = roundedBox(0.1, 0.2, 0.06, 0.01)
      place(win, { pos: [0, 0.8 + i * 0.55, 0.36] })
      addPart(g, win, mats.accent, `Finestra ${i + 1}`)
    }
    // bandiera in cima
    const pole = taperedCyl(0.015, 0.02, 0.5, 6)
    place(pole, { pos: [0, H + 1.3, 0] })
    addPart(g, pole, mats.byId('legno'), 'Asta')
    const flag = new THREE.PlaneGeometry(0.4, 0.2)
    place(flag, { pos: [0.2, H + 1.45, 0], rot: [0, 0, 0] })
    addPart(g, flag, mats.accent, 'Bandiera')
  } else if (kind === 'castle') {
    // corpo centrale + 4 torri angolari + mura
    const keep = roundedBox(1.1, 1.3, 0.9, 0.04)
    place(keep, { pos: [0, 0.65, 0] })
    addPart(g, keep, mats.byId('pietra'), 'Mastio')
    const keepRoof = cone(0.85, 0.5, 4)
    place(keepRoof, { pos: [0, 1.55, 0], rot: [0, Math.PI / 4, 0] })
    addPart(g, keepRoof, mats.primary, 'Tetto mastio')
    for (const [x, z] of [[0.75, 0.55], [-0.75, 0.55], [0.75, -0.55], [-0.75, -0.55]] as const) {
      const t = taperedCyl(0.2, 0.26, 1.5, 10)
      place(t, { pos: [x, 0.75, z] })
      addPart(g, t, mats.byId('pietra'), 'Torre')
      const tr = cone(0.32, 0.42, 8)
      place(tr, { pos: [x, 1.7, z] })
      addPart(g, tr, mats.primary, 'Tetto torre')
      const win = roundedBox(0.08, 0.16, 0.06, 0.01)
      place(win, { pos: [x * 1.12, 1.1, z * 1.12] })
      addPart(g, win, mats.accent, 'Finestra torre')
    }
    // mura di collegamento
    for (const s of [1, -1]) {
      const wall = roundedBox(1.5, 0.55, 0.14, 0.03)
      place(wall, { pos: [0, 0.4, s * 0.55] })
      addPart(g, wall, mats.byId('pietra'), 'Mura')
      for (let i = 0; i < 4; i++) {
        const merlon = roundedBox(0.12, 0.14, 0.1, 0.02)
        place(merlon, { pos: [-0.55 + i * 0.36, 0.75, s * 0.55] })
        addPart(g, merlon, mats.byId('pietra'), 'Merlo')
      }
    }
    // portone
    const gate = roundedBox(0.3, 0.42, 0.08, 0.02)
    place(gate, { pos: [0, 0.24, 0.63] })
    addPart(g, gate, mats.byId('legno'), 'Portone')
  } else if (kind === 'mill') {
    // corpo + ala rotante
    const body = taperedCyl(0.35, 0.5, 1.5, 10)
    place(body, { pos: [0, 0.75, 0] })
    addPart(g, body, mats.byId('pietra'), 'Corpo')
    const roof = cone(0.55, 0.5, 10)
    place(roof, { pos: [0, 1.75, 0] })
    addPart(g, roof, mats.primary, 'Tetto')
    // croce di pale
    const hub = blob(0.08, 0.08, 0.08, 8)
    place(hub, { pos: [0, 1.35, 0.48] })
    addPart(g, hub, mats.byId('legno'), 'Mozzo')
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4
      const blade = roundedBox(0.16, 0.72, 0.02, 0.01)
      place(blade, {
        pos: [Math.cos(a) * 0.42, 1.35 + Math.sin(a) * 0.42, 0.52],
        rot: [0, 0, a - Math.PI / 2],
      })
      addPart(g, blade, mats.byId('pino'), `Pala ${i + 1}`)
    }
  } else {
    // casa (a graticcio se legno)
    const W = 1.1
    const D = 0.9
    const fH = 0.62 * floors
    const walls = roundedBox(W, fH, D, 0.03)
    place(walls, { pos: [0, fH / 2 + 0.12, 0] })
    addPart(g, walls, wallMat, 'Muri')
    // zoccolo
    const plinth = roundedBox(W + 0.06, 0.16, D + 0.06, 0.02)
    place(plinth, { pos: [0, 0.08, 0] })
    addPart(g, plinth, mats.byId('pietra'), 'Zoccolo')
    // tetto a falde
    const roof = cone(0.92, 0.62, 4)
    place(roof, { pos: [0, fH + 0.42, 0], rot: [0, Math.PI / 4, 0], scale: [1.05, 1, 0.82] })
    addPart(g, roof, mats.primary, 'Tetto')
    // camino
    const chimney = roundedBox(0.16, 0.4, 0.16, 0.02)
    place(chimney, { pos: [W * 0.28, fH + 0.5, -D * 0.18] })
    addPart(g, chimney, mats.byId('pietra'), 'Camino')
    // porta
    const door = roundedBox(0.24, 0.36, 0.05, 0.015)
    place(door, { pos: [0, 0.32, D / 2 + 0.005] })
    addPart(g, door, mats.byId('legno'), 'Porta')
    // finestre (luminose)
    for (let f = 0; f < floors; f++) {
      for (const x of [-W * 0.28, W * 0.28]) {
        const win = roundedBox(0.16, 0.18, 0.05, 0.01)
        place(win, { pos: [x, 0.42 + f * 0.62, D / 2 + 0.005] })
        addPart(g, win, mats.accent, 'Finestra')
      }
    }
    // travi a graticcio
    if (ctx.spec.styleId === 'legno' || ctx.spec.subject.includes('graticcio')) {
      for (const x of [-W * 0.5 + 0.03, 0, W * 0.5 - 0.03]) {
        const beam = roundedBox(0.05, fH, 0.03, 0.01)
        place(beam, { pos: [x, fH / 2 + 0.12, D / 2 + 0.012] })
        addPart(g, beam, mats.byId('ebano'), 'Trave')
      }
      for (let f = 1; f <= floors; f++) {
        const beam = roundedBox(W, 0.05, 0.03, 0.01)
        place(beam, { pos: [0, f * 0.62 + 0.1, D / 2 + 0.012] })
        addPart(g, beam, mats.byId('ebano'), 'Trave orizzontale')
      }
    }
  }
  void rng
  return g
}

// ============================================================
// ALBERI
// ============================================================

function buildTree(ctx: Ctx, kind: string): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng } = ctx
  const H = rng.range(1.6, 2.3)

  if (kind === 'pine') {
    const trunk = taperedCyl(0.07, 0.13, H * 0.35, 8)
    place(trunk, { pos: [0, H * 0.175, 0] })
    addPart(g, trunk, mats.byId('quercia'), 'Tronco')
    // coni impilati
    for (let i = 0; i < 4; i++) {
      const r = 0.55 - i * 0.11
      const c = cone(r, H * 0.34, 9)
      jitter(c, 0.012, rng)
      place(c, { pos: [0, H * 0.35 + i * H * 0.17 + H * 0.14, 0] })
      addPart(g, c, i === 3 ? mats.secondary : mats.primary, `Chioma ${i + 1}`)
    }
  } else if (kind === 'palm') {
    // tronco curvo
    const bend = rng.range(-0.2, 0.2)
    const trunk = organicTube(
      [V(0, 0, 0), V(bend * 0.4, H * 0.4, 0.06), V(bend, H * 0.85, 0.1)],
      [0.11, 0.09, 0.07],
      10, 0.5
    )
    addPart(g, trunk, mats.byId('quercia'), 'Tronco')
    // foglie a ventaglio
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2
      const leaf = cone(0.09, 0.8, 4)
      place(leaf, {
        pos: [bend + Math.cos(a) * 0.32, H * 0.9 + Math.sin(a) * 0.12, 0.1 + Math.sin(a) * 0.22],
        rot: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9],
        scale: [1, 1, 0.22],
      })
      addPart(g, leaf, mats.primary, `Foglia ${i + 1}`)
    }
    // cocche
    for (let i = 0; i < 3; i++) {
      const coco = blob(0.07, 0.07, 0.07, 8)
      place(coco, { pos: [bend + rng.range(-0.08, 0.08), H * 0.82, 0.1 + rng.range(-0.08, 0.08)] })
      addPart(g, coco, mats.byId('cuoio'), 'Cocco')
    }
  } else {
    // latifoglia: tronco + chioma a blob
    const trunk = taperedCyl(0.1, 0.17, H * 0.5, 9)
    place(trunk, { pos: [0, H * 0.25, 0] })
    addPart(g, trunk, mats.byId('quercia'), 'Tronco')
    // rami
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.range(0, 1)
      const br = taperedCyl(0.03, 0.055, H * 0.3, 6)
      place(br, {
        pos: [Math.cos(a) * 0.16, H * 0.52, Math.sin(a) * 0.16],
        rot: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5],
      })
      addPart(g, br, mats.byId('quercia'), `Ramo ${i + 1}`)
    }
    // chioma: cluster di blob
    const canopyPts = [
      [0, H * 0.78, 0, 0.5], [0.3, H * 0.68, 0.18, 0.34], [-0.28, H * 0.7, -0.14, 0.3],
      [0.12, H * 0.66, -0.3, 0.32], [-0.1, H * 0.62, 0.3, 0.3], [0, H * 0.95, 0, 0.3],
    ] as const
    canopyPts.forEach(([x, y, z, r], i) => {
      const c = blob(r * rng.range(0.92, 1.12), r * rng.range(0.8, 0.95), r * rng.range(0.92, 1.1), 10)
      jitter(c, 0.02, rng)
      place(c, { pos: [x, y, z] })
      addPart(g, c, i % 2 === 0 ? mats.primary : mats.secondary, `Chioma ${i + 1}`)
    })
  }
  return g
}

// ============================================================
// OGGETTI DI SCENA
// ============================================================

function buildProp(ctx: Ctx, kind: string): THREE.Group {
  const g = new THREE.Group()
  const { mats, rng } = ctx

  switch (kind) {
    case 'potion': {
      const glass = new THREE.MeshStandardMaterial({
        color: ctx.spec.colorHex ?? '#b46ae0',
        transparent: true,
        opacity: 0.55,
        roughness: 0.05,
        metalness: 0,
      })
      const bottle = lathe([[0.001, 0], [0.16, 0.02], [0.2, 0.14], [0.16, 0.3], [0.06, 0.4], [0.055, 0.5]], 16)
      place(bottle, { pos: [0, 0.05, 0] })
      addPart(g, bottle, glass, 'Ampolla')
      // liquido luminescente
      const liquid = lathe([[0.001, 0], [0.14, 0.02], [0.165, 0.13], [0.13, 0.26]], 14)
      place(liquid, { pos: [0, 0.06, 0] })
      addPart(g, liquid, mats.accent, 'Liquido')
      // tappo
      const cork = taperedCyl(0.05, 0.062, 0.09, 10)
      place(cork, { pos: [0, 0.55, 0] })
      addPart(g, cork, mats.byId('quercia'), 'Tappo')
      // bollicine
      for (let i = 0; i < 4; i++) {
        const b = blob(0.016, 0.016, 0.016, 6)
        place(b, { pos: [rng.range(-0.07, 0.07), rng.range(0.14, 0.3), rng.range(-0.07, 0.07)] })
        addPart(g, b, mats.accent, 'Bolla')
      }
      break
    }
    case 'crystal': {
      const mat = new THREE.MeshStandardMaterial({
        color: ctx.spec.colorHex ?? '#7ac9e8',
        emissive: ctx.spec.colorHex ?? '#3a9fd8',
        emissiveIntensity: 0.45,
        metalness: 0.15,
        roughness: 0.1,
        transparent: true,
        opacity: 0.88,
      })
      const shards: [number, number, number, number][] = [
        [0, 0.55, 0, 0.16], [0.16, 0.3, 0.05, 0.1], [-0.14, 0.24, -0.06, 0.085], [0.05, 0.2, -0.16, 0.07], [-0.06, 0.34, 0.12, 0.075],
      ]
      shards.forEach(([x, h, z, r], i) => {
        const s = new THREE.ConeGeometry(r, h, 6, 1)
        jitter(s, 0.008, rng)
        place(s, { pos: [x, h / 2, z], rot: [rng.range(-0.16, 0.16), rng.range(0, 3), rng.range(-0.16, 0.16)] })
        addPart(g, s, mat, `Cristallo ${i + 1}`)
      })
      // base di roccia
      const base = blob(0.26, 0.09, 0.24, 8)
      jitter(base, 0.02, rng)
      place(base, { pos: [0, 0.03, 0] })
      addPart(g, base, mats.byId('pietra'), 'Base')
      break
    }
    case 'chest': {
      const body = roundedBox(0.62, 0.34, 0.42, 0.03)
      place(body, { pos: [0, 0.2, 0] })
      addPart(g, body, mats.byId('quercia'), 'Corpo')
      // coperchio bombato
      const lid = new THREE.CylinderGeometry(0.21, 0.21, 0.62, 12, 1, false, 0, Math.PI)
      place(lid, { pos: [0, 0.37, 0], rot: [Math.PI / 2, 0, Math.PI / 2] })
      addPart(g, lid, mats.byId('quercia'), 'Coperchio')
      // bande in ferro
      for (const x of [-0.2, 0, 0.2]) {
        const band = roundedBox(0.05, 0.5, 0.44, 0.01)
        place(band, { pos: [x, 0.26, 0] })
        addPart(g, band, mats.byId('ferro'), 'Banda')
      }
      // serratura
      const lock = roundedBox(0.09, 0.12, 0.04, 0.01)
      place(lock, { pos: [0, 0.3, 0.22] })
      addPart(g, lock, mats.byId('oro'), 'Serratura')
      gem(g, mats, V(0, 0.3, 0.245), 0.025)
      break
    }
    case 'barrel': {
      const body = lathe([[0.18, 0], [0.24, 0.24], [0.18, 0.48]], 14)
      place(body, { pos: [0, 0.02, 0] })
      addPart(g, body, mats.byId('quercia'), 'Doghe')
      for (const y of [0.08, 0.24, 0.4]) {
        const ring = new THREE.TorusGeometry(0.225 - Math.abs(y - 0.24) * 0.12, 0.014, 6, 16)
        place(ring, { pos: [0, y + 0.02, 0], rot: [Math.PI / 2, 0, 0] })
        addPart(g, ring, mats.byId('ferro'), 'Cerchio')
      }
      break
    }
    case 'torch': {
      const stick = taperedCyl(0.03, 0.045, 0.8, 8)
      place(stick, { pos: [0, 0.4, 0] })
      addPart(g, stick, mats.byId('legno'), 'Manico')
      const wrap = taperedCyl(0.055, 0.045, 0.16, 8)
      place(wrap, { pos: [0, 0.84, 0] })
      addPart(g, wrap, mats.byId('cuoio'), 'Legatura')
      const flame = cone(0.09, 0.3, 8)
      jitter(flame, 0.012, rng)
      place(flame, { pos: [0, 1.04, 0] })
      addPart(g, flame, mats.accent, 'Fiamma')
      const inner = cone(0.045, 0.16, 6)
      place(inner, { pos: [0, 0.98, 0] })
      addPart(g, inner, new THREE.MeshStandardMaterial({
        color: '#fff05a', emissive: '#ffe135', emissiveIntensity: 2,
      }), 'Cuore fiamma')
      break
    }
    case 'mushroom': {
      const stem = taperedCyl(0.05, 0.075, 0.3, 10)
      place(stem, { pos: [0, 0.15, 0] })
      addPart(g, stem, new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.8 }), 'Gambo')
      const cap = lathe([[0.02, 0.3], [0.14, 0.32], [0.2, 0.38], [0.21, 0.42], [0.001, 0.44]], 14)
      place(cap, { pos: [0, 0, 0] })
      addPart(g, cap, mats.primary, 'Cappello')
      // puntini
      for (let i = 0; i < 5; i++) {
        const a = rng.range(0, Math.PI * 2)
        const r = rng.range(0.06, 0.15)
        const dot = blob(0.022, 0.012, 0.022, 6)
        place(dot, { pos: [Math.cos(a) * r, 0.4 + Math.sqrt(0.21 * 0.21 - r * r) * 0.5, Math.sin(a) * r] })
        addPart(g, dot, new THREE.MeshStandardMaterial({ color: '#f4ece0', roughness: 0.7 }), 'Puntino')
      }
      break
    }
    default: {
      // prop generico: cristallo
      return buildProp({ ...ctx, spec: { ...ctx.spec } }, 'crystal')
    }
  }
  return g
}

// ============================================================
// registro oggetti
// ============================================================

export function buildObject(ctx: Ctx): THREE.Group {
  const { spec } = ctx
  switch (spec.archetype) {
    case 'weapon': {
      const kindBySpecies: Record<string, 'sword' | 'axe' | 'spear' | 'staff'> = {
        spada: 'sword', ascia: 'axe', lancia: 'spear', bastone: 'staff',
      }
      const kind = (spec.held ?? kindBySpecies[spec.species] ?? 'sword') as 'sword'
      return buildWeapon(kind, ctx, 2.2)
    }
    case 'shield':
      return buildShield(ctx)
    case 'vehicle':
      return buildVehicle(ctx, spec.species === 'carro' ? 'cart' : 'ship')
    case 'building': {
      const kindBySpecies: Record<string, string> = {
        casa: 'house', taverna: 'house', torre: 'tower', castello: 'castle', mulino: 'mill',
      }
      return buildBuilding(ctx, kindBySpecies[spec.species] ?? 'house', spec.species === 'taverna' ? 2 : 1)
    }
    case 'tree': {
      const kindBySpecies: Record<string, string> = {
        quercia: 'broadleaf', pino: 'pine', palma: 'palm',
      }
      return buildTree(ctx, kindBySpecies[spec.species] ?? 'broadleaf')
    }
    case 'prop':
    default: {
      const kindBySpecies: Record<string, string> = {
        pozione: 'potion', cristallo: 'crystal', forziere: 'chest', botte: 'barrel', torcia: 'torch', fungo: 'mushroom',
      }
      return buildProp(ctx, kindBySpecies[spec.species] ?? 'crystal')
    }
  }
}
