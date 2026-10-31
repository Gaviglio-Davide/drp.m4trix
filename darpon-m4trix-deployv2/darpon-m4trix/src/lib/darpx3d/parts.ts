// ============================================================
// Darpx3D · parts — costruttori geometrici di basso livello
// Tutto è BufferGeometry "pulita": normali ricalcolate, UV semplici,
// pronta per l'export GLB. Le funzioni restituiscono geometrie
// trasformate e con nome, da impilare in un THREE.Group.
// ============================================================

import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { RNG } from './rng'

export type Mat = THREE.Material

/** aggiunge una geometria a un gruppo come mesh con nome e materiale */
export function addPart(
  group: THREE.Group | THREE.Mesh,
  geo: THREE.BufferGeometry,
  mat: Mat,
  name: string
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat)
  mesh.name = name
  mesh.castShadow = true
  mesh.receiveShadow = true
  group.add(mesh)
  return mesh
}

/** applicazione compatta di posizione/rotazione/scala */
export function place(
  geo: THREE.BufferGeometry,
  opts: {
    pos?: [number, number, number]
    rot?: [number, number, number]  // radianti X,Y,Z
    scale?: [number, number, number] | number
  } = {}
): THREE.BufferGeometry {
  const g = geo
  const m = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  if (opts.rot) {
    q.setFromEuler(new THREE.Euler(opts.rot[0], opts.rot[1], opts.rot[2]))
  }
  const s =
    typeof opts.scale === 'number'
      ? new THREE.Vector3(opts.scale, opts.scale, opts.scale)
      : new THREE.Vector3(...(opts.scale ?? [1, 1, 1]))
  const p = new THREE.Vector3(...(opts.pos ?? [0, 0, 0]))
  m.compose(p, q, s)
  g.applyMatrix4(m)
  return g
}

// ------------------------------------------------------------
// Primitive estese
// ------------------------------------------------------------

/** box smussato (RoundedBox artigianale: box + smooth dei bordi via suddivisione) */
export function roundedBox(w: number, h: number, d: number, r = 0.05, seg = 2): THREE.BufferGeometry {
  // BoxGeometry con segmenti alti + "gonfiaggio" verso la sfera per smussare
  const g = new THREE.BoxGeometry(w, h, d, seg * 4, seg * 4, seg * 4)
  const pos = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  const hw = w / 2 - r
  const hh = h / 2 - r
  const hd = d / 2 - r
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const cx = THREE.MathUtils.clamp(v.x, -hw, hw)
    const cy = THREE.MathUtils.clamp(v.y, -hh, hh)
    const cz = THREE.MathUtils.clamp(v.z, -hd, hd)
    const dx = v.x - cx
    const dy = v.y - cy
    const dz = v.z - cz
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (len > 1e-9) {
      const k = r / len
      pos.setXYZ(i, cx + dx * k, cy + dy * k, cz + dz * k)
    }
  }
  g.computeVertexNormals()
  return g
}

/** capsula orientata lungo Y (come THREE.CapsuleGeometry ma con controllo) */
export function capsule(r: number, len: number, capSeg = 6, radSeg = 12): THREE.BufferGeometry {
  return new THREE.CapsuleGeometry(r, len, capSeg, radSeg)
}

/** cilindro con raggio alto/basso e nessuna bottiglia */
export function taperedCyl(
  rBottom: number,
  rTop: number,
  h: number,
  radSeg = 12,
  capSeg = 1,
  capped = true
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, radSeg, capSeg, false)
  if (!capped) {
    // toglie i tappi (per giunzioni organiche)
    const idx = g.index!.array as Uint32Array | Uint16Array
    const keep: number[] = []
    const posCount = g.attributes.position.count
    // i triangoli di tappo usano gli ultimi vertici: rimuove triangoli che
    // hanno tutti e 3 i vertici con y = ±h/2
    const y = g.attributes.position as THREE.BufferAttribute
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2]
      const ya = y.getY(a), yb = y.getY(b), yc = y.getY(c)
      const capTop = h / 2 - 1e-6
      const capBot = -h / 2 + 1e-6
      const allTop = ya > capTop && yb > capTop && yc > capTop
      const allBot = ya < capBot && yb < capBot && yc < capBot
      if (!allTop && !allBot) keep.push(a, b, c)
    }
    const ni = new (posCount > 65535 ? THREE.BufferAttribute : THREE.BufferAttribute)(
      new Uint32Array(keep), 1
    )
    g.setIndex(ni)
  }
  return g
}

/** sfera scalata (ellissoide) — la base di ogni forma organica */
export function blob(rx: number, ry: number, rz: number, seg = 14): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)))
  return place(g, { scale: [rx, ry, rz] })
}

/** cono (corna, denti, orecchie, fiamme, alberi) */
export function cone(r: number, h: number, seg = 8, capped = true): THREE.BufferGeometry {
  return new THREE.ConeGeometry(r, h, seg, 1, false, 0, Math.PI * 2) as THREE.BufferGeometry
}

/** "tubo organico": curva + raggio variabile → corpo/collo/coda/arti serpenti
 *  È il pezzo forte del motore: genera corpi lisci e muscolosi. */
export function organicTube(
  points: THREE.Vector3[],
  radii: number[],
  radialSeg = 12,
  smooth = 0.5,
  capEnds = true
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', smooth)
  const tubularSeg = Math.max(8, Math.round(curve.getLength() * 14))
  const frames = curve.computeFrenetFrames(tubularSeg, false)

  // raggio interpolato lungo t
  const radiusAt = (t: number) => {
    const x = t * (radii.length - 1)
    const i = Math.floor(x)
    const j = Math.min(radii.length - 1, i + 1)
    const f = x - i
    const c = 0.5 - 0.5 * Math.cos(Math.PI * f) // smoothstep
    return radii[i] * (1 - c) + radii[j] * c
  }

  const verts: number[] = []
  const norms: number[] = []
  const uvs: number[] = []
  const idx: number[] = []

  const P = new THREE.Vector3()
  const N = new THREE.Vector3()

  const rings = capEnds ? tubularSeg + 1 : tubularSeg - 1
  const start = capEnds ? 0 : 1
  for (let i = 0; i < rings; i++) {
    const t = (i + start) / tubularSeg
    curve.getPointAt(t, P)
    const r = radiusAt(t)
    const normal = frames.normals[Math.min(i + start, frames.normals.length - 1)]
    const binormal = frames.binormals[Math.min(i + start, frames.binormals.length - 1)]
    for (let j = 0; j <= radialSeg; j++) {
      const a = (j / radialSeg) * Math.PI * 2
      const sn = Math.sin(a)
      const cs = Math.cos(a)
      N.set(
        normal.x * cs + binormal.x * sn,
        normal.y * cs + binormal.y * sn,
        normal.z * cs + binormal.z * sn
      ).normalize()
      verts.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r)
      norms.push(N.x, N.y, N.z)
      uvs.push(j / radialSeg, t * 3)
    }
  }
  const ringVerts = radialSeg + 1
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radialSeg; j++) {
      const a = i * ringVerts + j
      const b = a + ringVerts
      idx.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  if (capEnds) {
    // tappi a calotta sferica: collegano il PRIMO ring (vertici 0..ringVerts-1)
    // e l'ULTIMO ring (vertici (rings-1)*ringVerts .. rings*ringVerts-1)
    capSphere(g, curve, radiusAt, 0, 0, ringVerts, true)
    capSphere(
      g, curve, radiusAt, 1, (rings - 1) * ringVerts, ringVerts, false
    )
  }
  g.computeVertexNormals()
  return g
}

function capSphere(
  g: THREE.BufferGeometry,
  curve: THREE.CatmullRomCurve3,
  radiusAt: (t: number) => number,
  t: number,
  ringStartIndex: number,
  ringVerts: number,
  isStart: boolean
) {
  const P = curve.getPointAt(t)
  const T = curve.getTangentAt(t).multiplyScalar(isStart ? -1 : 1)
  const r = radiusAt(t)
  const center = P.clone().add(T.clone().multiplyScalar(r * 0.72))
  // ricostruisce gli attributi con il vertice centro in coda (senza
  // toccare `count`, che è read-only nei tipi di three)
  const pos = g.attributes.position as THREE.BufferAttribute
  const nor = g.attributes.normal as THREE.BufferAttribute
  const uv = g.attributes.uv as THREE.BufferAttribute
  const posArr = Array.from(pos.array as Float32Array)
  const norArr = Array.from(nor.array as Float32Array)
  const uvArr = Array.from(uv.array as Float32Array)
  posArr.push(center.x, center.y, center.z)
  const dir = center.clone().normalize()
  norArr.push(dir.x, dir.y, dir.z)
  uvArr.push(0.5, 0.5)
  g.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norArr, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2))
  const centerIdx = posArr.length / 3 - 1
  const cur = g.index ? Array.from(g.index.array as ArrayLike<number>) : []
  for (let j = 0; j < ringVerts - 1; j++) {
    const a = ringStartIndex + j
    const b = ringStartIndex + j + 1
    if (isStart) cur.push(centerIdx, b, a)
    else cur.push(centerIdx, a, b)
  }
  g.setIndex(cur)
}

/** membrana d'ala: triangolo/cono di "pelle" tra punte delle dita, con bordo
 *  inferiore curvo (sag). Costruita esplicitamente vertice per vertice. */
export function membrane(
  root: THREE.Vector3,
  tipA: THREE.Vector3,
  tipB: THREE.Vector3,
  sag = 0.35,
  subdiv = 6
): THREE.BufferGeometry {
  // curve di bordo da root→tipA e root→tipB, e bordo esterno tipA→tipB incurvato verso root
  const outerA = new THREE.QuadraticBezierCurve3(
    root.clone(),
    root.clone().lerp(tipA, 0.6).add(new THREE.Vector3(0, -0.05, 0)),
    tipA.clone()
  )
  const outerB = new THREE.QuadraticBezierCurve3(
    root.clone(),
    root.clone().lerp(tipB, 0.6).add(new THREE.Vector3(0, -0.05, 0)),
    tipB.clone()
  )
  const sagCtrl = tipA.clone().lerp(tipB, 0.5).lerp(root, sag)
  const edge = new THREE.QuadraticBezierCurve3(tipA.clone(), sagCtrl, tipB.clone())

  const verts: THREE.Vector3[] = []
  const idx: number[] = []
  for (let i = 0; i <= subdiv; i++) {
    const t = i / subdiv
    verts.push(outerA.getPoint(t))
  }
  for (let i = 1; i <= subdiv; i++) {
    const t = i / subdiv
    verts.push(edge.getPoint(t))
  }
  for (let i = 1; i <= subdiv; i++) {
    const t = i / subdiv
    verts.push(outerB.getPoint(1 - t))
  }
  // ventaglio dal vertice 0 (root)
  for (let i = 1; i < verts.length - 1; i++) {
    idx.push(0, i, i + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts.flatMap(v => [v.x, v.y, v.z]), 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

/** profilo tornito (LatheGeometry comoda) — bottiglie, colonne, pezzi simmetrici */
export function lathe(profile: [number, number][], seg = 16): THREE.BufferGeometry {
  const pts = profile.map(([x, y]) => new THREE.Vector2(Math.max(0.0001, x), y))
  return new THREE.LatheGeometry(pts, seg)
}

/** estrusione di una Shape 2D con smusso — lame, scudi, insegne */
export function extrudeShape(
  shape: THREE.Shape,
  depth: number,
  bevel = 0.01
): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 12,
  })
  g.center()
  return g
}

/** fusione di più geometrie in una (stesso formato attributi) */
export function mergeAll(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  const clean = geos.map(g => {
    const c = g.clone()
    // uniforma gli attributi a position+normal+uv
    const keep = ['position', 'normal', 'uv']
    for (const name of Object.keys(c.attributes)) {
      if (!keep.includes(name)) c.deleteAttribute(name)
    }
    if (!c.getAttribute('uv')) {
      const n = c.attributes.position.count
      c.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2))
    }
    if (!c.getAttribute('normal')) c.computeVertexNormals()
    return c
  })
  const merged = mergeGeometries(clean, false)
  return merged
}

/** jitter verticale leggero per rompere la perfezione (roccia, corteccia) */
export function jitter(geo: THREE.BufferGeometry, amount: number, rng: RNG): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(
      i,
      pos.getX(i) + rng.gauss(0, amount),
      pos.getY(i) + rng.gauss(0, amount),
      pos.getZ(i) + rng.gauss(0, amount)
    )
  }
  geo.computeVertexNormals()
  return geo
}

/** distribuisce n punti sulla superficie di una mesh (per squame, spuntoni) */
export function surfacePoints(geo: THREE.BufferGeometry, n: number, rng: RNG): THREE.Vector3[] {
  geo.computeBoundingSphere()
  const out: THREE.Vector3[] = []
  const pos = geo.attributes.position as THREE.BufferAttribute
  const tri = geo.index ? (geo.index.array as ArrayLike<number>) : null
  const triCount = tri ? tri.length / 3 : pos.count / 3
  if (triCount < 1) return out
  for (let i = 0; i < n; i++) {
    const t = rng.int(0, triCount - 1)
    let a: number, b: number, c: number
    if (tri) {
      a = tri[t * 3]; b = tri[t * 3 + 1]; c = tri[t * 3 + 2]
    } else {
      a = t * 3; b = t * 3 + 1; c = t * 3 + 2
    }
    let u = rng.next(), v = rng.next()
    if (u + v > 1) { u = 1 - u; v = 1 - v }
    const w = 1 - u - v
    out.push(
      new THREE.Vector3(
        pos.getX(a) * w + pos.getX(b) * u + pos.getX(c) * v,
        pos.getY(a) * w + pos.getY(b) * u + pos.getY(c) * v,
        pos.getZ(a) * w + pos.getZ(b) * u + pos.getZ(c) * v
      )
    )
  }
  return out
}
