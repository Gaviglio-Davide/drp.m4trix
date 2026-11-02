// ============================================================
// Darpx3D · build — orchestratore: prompt → modello completo
// Normalizza le dimensioni, incolla a terra, calcola statistiche
// e prepara il gruppo per l'export GLB.
// ============================================================

import * as THREE from 'three'
import { makeRng, randomSeed } from './rng'
import { parsePrompt, type GenSpec } from './parse'
import { buildMaterials } from './materials'
import { ARCHETYPES, type Ctx } from './anatomy'
import { buildObject } from './objects'

export type ModelStats = {
  triangles: number
  meshes: number
  materials: number
  parts: number
  heightUnits: number
}

export type BuiltModel = {
  group: THREE.Group
  spec: GenSpec
  stats: ModelStats
}

/** altezza target (in unità del mondo del sito) per archetipo */
const TARGET_HEIGHT: Record<string, number> = {
  dragon: 2.6,
  serpent: 1.5,
  humanoid: 1.8,
  quadruped: 1.9,
  bird: 1.1,
  fish: 0.9,
  robot: 1.9,
  weapon: 1.6,
  shield: 1.0,
  vehicle: 2.0,
  building: 2.8,
  tree: 2.8,
  prop: 1.0,
}

/** genera il modello 3D dal prompt (tutto nel browser, zero server) */
export function generateModel(prompt: string, opts: { seed?: number } = {}): BuiltModel {
  // v7: seed CASUALE di default → chiedere 3 volte «un cavaliere» dà
  // 3 cavalieri DIVERSI. Il seed esplicito resta per riprodurre un modello.
  const seed = opts.seed ?? randomSeed()
  const spec = parsePrompt(prompt, seed)
  const rng = makeRng(spec.seed)
  const mats = buildMaterials(spec.subject, rng, spec.colorHex, spec.styleId)
  const ctx: Ctx = { spec, rng, mats }

  const isObject = ['weapon', 'shield', 'vehicle', 'building', 'tree', 'prop'].includes(spec.archetype)
  let group: THREE.Group
  try {
    group = isObject ? buildObject(ctx) : (ARCHETYPES[spec.archetype] ?? ARCHETYPES.dragon)(ctx)
  } catch (e) {
    // mai fallire: fallback drago (il registro garantisce il risultato)
    console.error('[darpx3d] fallback:', e)
    group = ARCHETYPES.dragon(ctx)
  }
  group.name = spec.name

  // ---- normalizzazione: altezza target + appoggio a terra ----
  normalize(group, TARGET_HEIGHT[spec.archetype] ?? 1.8)

  const stats = computeStats(group)
  return { group, spec, stats }
}

/** rigenera una variante: stesso prompt, nuovo seed */
export function generateVariant(prompt: string): BuiltModel {
  return generateModel(prompt, { seed: randomSeed() })
}

function normalize(group: THREE.Group, targetH: number): void {
  const box = new THREE.Box3().setFromObject(group)
  const size = new THREE.Vector3()
  box.getSize(size)
  if (!Number.isFinite(size.y) || size.y < 1e-6) return
  const k = targetH / size.y
  group.scale.multiplyScalar(k)
  group.updateMatrixWorld(true)
  // riappoggia a terra
  const box2 = new THREE.Box3().setFromObject(group)
  group.position.y += -box2.min.y
  group.updateMatrixWorld(true)
}

/** statistiche di un gruppo qualunque (usata anche dal laboratorio GLB) */
export function computeStats(group: THREE.Group): ModelStats {
  let triangles = 0
  let meshes = 0
  const mats = new Set<string>()
  let parts = 0
  const box = new THREE.Box3().setFromObject(group)
  group.traverse(o => {
    if ((o as THREE.Mesh).isMesh) {
      const m = o as THREE.Mesh
      meshes++
      const geo = m.geometry as THREE.BufferGeometry
      const idx = geo.index ? geo.index.count : geo.attributes.position.count
      triangles += Math.floor(idx / 3)
      if (Array.isArray(m.material)) m.material.forEach(mm => mats.add(mm.uuid))
      else mats.add((m.material as THREE.Material).uuid)
      parts++
    }
  })
  return {
    triangles,
    meshes,
    materials: mats.size,
    parts,
    heightUnits: Number((box.max.y - box.min.y).toFixed(2)),
  }
}
