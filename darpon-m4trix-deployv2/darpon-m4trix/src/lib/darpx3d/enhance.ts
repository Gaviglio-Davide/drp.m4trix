// ============================================================
// Darpx3D · enhance — LABORATORIO GLB (v7)
// Carica uno dei modelli GLB che hai già nel sito (o un file
// locale) e lo MIGLIORA nel browser, senza servizi esterni:
//   • restyling: tinta o materiale PBR su tutto il modello
//   • aggiunte: ali, corna, basamento in pietra, aura luminosa
//   • normalizzazione: altezza, centro e appoggio a terra
// Il risultato si esporta in GLB come i modelli generati.
// ============================================================

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { pbrMat } from '@/lib/pbr'
import { computeStats, type ModelStats } from './build'
import { makeRng } from './rng'

// ---------------- caricamento ----------------

export async function loadGlbFromUrl(url: string): Promise<THREE.Group> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('Download del modello non riuscito')
  const buf = await res.arrayBuffer()
  return loadGlbFromArrayBuffer(buf)
}

export function loadGlbFromArrayBuffer(buf: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.parse(
      buf,
      '',
      gltf => resolve(gltf.scene),
      err => reject(err instanceof Error ? err : new Error('GLB non leggibile'))
    )
  })
}

// ---------------- miglioramenti ----------------

export type EnhanceAdditions = {
  wings?: boolean
  horns?: boolean
  base?: boolean
  aura?: boolean
}

export type EnhanceOpts = {
  /** 'tinta': colora i materiali esistenti · 'materiale': li sostituisce · 'originale': non toccare */
  mode: 'originale' | 'tinta' | 'materiale'
  colorHex?: string
  styleId?: string // oro, argento, ferro, acciaio, bronzo, rame, legno, quercia, pietra, granito, marmo, cristallo, ossidiana…
  additions?: EnhanceAdditions
  targetHeight?: number // 0 = mantieni le proporzioni originali
}

const STYLE_TO_PBR: Record<string, Parameters<typeof pbrMat>[0]> = {
  oro: 'metallo',
  argento: 'metallo',
  ferro: 'metallo',
  acciaio: 'metallo',
  bronzo: 'metallo',
  rame: 'metallo',
  legno: 'legno',
  quercia: 'legno',
  pino: 'legno',
  pietra: 'pietra',
  granito: 'pietra',
  marmo: 'pietra',
  cristallo: 'metallo',
}

const STYLE_COLORS: Record<string, string> = {
  oro: '#d9a72e',
  argento: '#c9ced6',
  ferro: '#5c6068',
  acciaio: '#9aa3ad',
  bronzo: '#b0793c',
  rame: '#c47a4a',
  legno: '#8a5a33',
  quercia: '#7d5230',
  pino: '#a87a4a',
  pietra: '#9a958c',
  granito: '#8d8a86',
  marmo: '#e8e6e0',
  cristallo: '#b8d8f0',
}

/** applica tinta o restyling a tutti i materiali del modello */
function restyle(root: THREE.Object3D, opts: EnhanceOpts) {
  if (opts.mode === 'originale') return
  const styleColor = opts.styleId ? STYLE_COLORS[opts.styleId] : undefined
  const tint = new THREE.Color(opts.colorHex ?? styleColor ?? '#ffffff')
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    if (opts.mode === 'tinta') {
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      for (const mat of mats) {
        const std = mat as THREE.MeshStandardMaterial
        if (std && std.isMeshStandardMaterial) {
          std.color = std.color.clone().lerp(tint, 0.55)
        } else if (std) {
          ;(std as THREE.MeshStandardMaterial).color = tint.clone()
        }
      }
    } else if (opts.mode === 'materiale' && opts.styleId) {
      const kind = STYLE_TO_PBR[opts.styleId] ?? 'pietra'
      const col = opts.colorHex ?? styleColor ?? '#b0b0b0'
      const rep = opts.styleId === 'marmo' ? 1.5 : 2.4
      const shared = pbrMat(kind, col, {
        roughness: opts.styleId === 'oro' || opts.styleId === 'argento' ? 0.3 : 0.85,
        metalness: STYLE_TO_PBR[opts.styleId] === 'metallo' &&
          !['legno', 'quercia', 'pino', 'pietra', 'granito', 'marmo'].includes(opts.styleId)
          ? 0.88
          : 0.05,
        repeat: rep,
      })
      m.material = shared
    }
  })
}

/** ali membranose ai lati del modello */
function addWings(group: THREE.Group, size: number) {
  const mat = new THREE.MeshStandardMaterial({
    color: '#6a4a8a',
    roughness: 0.7,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.94,
  })
  for (const side of [1, -1] as const) {
    const wing = new THREE.Group()
    // dita dell'ala: archi di box sottili
    const rng = makeRng(side > 0 ? 911 : 913)
    const fingers = 4
    for (let i = 0; i < fingers; i++) {
      const len = size * (0.5 - i * 0.07)
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(len, size * 0.03, size * 0.05),
        new THREE.MeshStandardMaterial({ color: '#3d2a4d', roughness: 0.6 })
      )
      beam.position.set((side * len) / 2, -i * size * 0.05, -i * size * 0.06)
      beam.rotation.z = side * (0.15 + rng.next() * 0.12)
      beam.rotation.y = -side * i * 0.22
      beam.castShadow = true
      wing.add(beam)
    }
    // membrana
    const shape = new THREE.Shape()
    shape.moveTo(0, 0)
    shape.lineTo(size * 0.52, -size * 0.1)
    shape.lineTo(size * 0.46, -size * 0.34)
    shape.lineTo(size * 0.2, -size * 0.3)
    shape.lineTo(0, -size * 0.12)
    shape.closePath()
    const geo = new THREE.ShapeGeometry(shape)
    const mem = new THREE.Mesh(geo, mat)
    mem.scale.x = side
    mem.rotation.y = side * 0.5
    mem.castShadow = true
    wing.add(mem)
    wing.position.set(side * size * 0.18, size * 0.62, -size * 0.05)
    group.add(wing)
  }
}

/** corna sul punto più alto */
function addHorns(group: THREE.Group, size: number) {
  const mat = new THREE.MeshStandardMaterial({ color: '#e6ddc8', roughness: 0.5, metalness: 0.05 })
  for (const side of [1, -1] as const) {
    for (let k = 0; k < 2; k++) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(size * (0.035 - k * 0.012), size * (0.22 - k * 0.07), 8), mat)
      horn.position.set(side * size * (0.08 + k * 0.07), size * 0.98 + k * size * 0.02, -size * 0.02 - k * size * 0.04)
      horn.rotation.z = side * (0.35 + k * 0.3)
      horn.rotation.x = -0.25
      horn.castShadow = true
      group.add(horn)
    }
  }
}

/** basamento circolare in pietra */
function addBase(group: THREE.Group, size: number) {
  const stone = pbrMat('pietraSquadrata', '#9a958c', { roughness: 0.92, rx: 2, ry: 0.6 })
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.42, size * 0.5, size * 0.14, 18), stone)
  cyl.position.y = size * 0.07
  cyl.receiveShadow = true
  cyl.castShadow = true
  group.add(cyl)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.43, size * 0.02, 8, 22), pbrMat('pietra', '#7d7568', { roughness: 0.95 }))
  ring.rotation.x = Math.PI / 2
  ring.position.y = size * 0.145
  group.add(ring)
}

/** aura luminosa alla base */
function addAura(group: THREE.Group, size: number, colorHex?: string) {
  const c = new THREE.Color(colorHex ?? '#7c4fa8')
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(size * 0.5, size * 0.018, 8, 32),
    new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 })
  )
  ring.rotation.x = Math.PI / 2
  ring.position.y = size * 0.03
  group.add(ring)
  const glow = new THREE.Mesh(
    new THREE.CylinderGeometry(size * 0.5, size * 0.5, size * 0.02, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: c,
      emissive: c,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  )
  glow.position.y = size * 0.12
  group.add(glow)
}

export type EnhancedModel = {
  group: THREE.Group
  stats: ModelStats
}

/** pipeline completa: clona, restyling, aggiunte, normalizza, statistiche */
export function enhanceModel(src: THREE.Object3D, opts: EnhanceOpts): EnhancedModel {
  const group = new THREE.Group()
  const cloned = skeletonClone(src)
  group.add(cloned)

  // 1) restyling / tinta (sul clone, prima di toccare le misure)
  restyle(cloned, opts)

  // 2) normalizzazione PRELIMINARE del clone: centrato in x/z, a terra y=0
  let box = new THREE.Box3().setFromObject(cloned)
  let center = box.getCenter(new THREE.Vector3())
  cloned.position.x -= center.x
  cloned.position.z -= center.z
  cloned.updateMatrixWorld(true)
  box = new THREE.Box3().setFromObject(cloned)
  if (box.min.y !== 0) {
    cloned.position.y -= box.min.y
    cloned.updateMatrixWorld(true)
  }

  // 3) aggiunte dimensionate sul modello appena normalizzato
  box = new THREE.Box3().setFromObject(cloned)
  const S = box.getSize(new THREE.Vector3())
  const ref = Math.max(S.x, S.y, S.z, 0.001)
  const add = opts.additions ?? {}
  if (add.wings) addWings(group, ref)
  if (add.horns) addHorns(group, S.y)
  if (add.base) addBase(group, ref)
  if (add.aura) addAura(group, ref, opts.colorHex)

  // 4) scala finale: se è richiesta un'altezza target si scala TUTTO
  //    (modello + aggiunte) e si riappoggia a terra
  const target = opts.targetHeight && opts.targetHeight > 0 ? opts.targetHeight : null
  if (target) {
    box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    const k = target / Math.max(size.y, 0.001)
    group.scale.multiplyScalar(k)
    group.updateMatrixWorld(true)
  }
  box = new THREE.Box3().setFromObject(group)
  if (box.min.y > 0.001 || box.min.y < -0.001) {
    group.position.y += -box.min.y
    group.updateMatrixWorld(true)
  }

  group.name = 'darpx-enhanced'
  return { group, stats: computeStats(group) }
}
