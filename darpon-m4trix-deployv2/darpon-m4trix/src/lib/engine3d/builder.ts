// ============================================================
// DARPX ENGINE — builder del mondo realistico (v17)
// Fisica del giocatore (gravità, salto, collisioni AABB con
// step-up), colliders del mondo e pipeline di post-processing
// (bloom + vignette + tone mapping ACES) senza dipendenze
// nuove: solo three/examples/jsm.
// ============================================================

import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { PREFABS, collidersOf } from './prefabs'
import type { RWorld } from './types'

// ---------------- colliders ----------------

/** tutti i collider del mondo (AABB) */
export function worldColliders(world: RWorld): THREE.Box3[] {
  const out: THREE.Box3[] = []
  for (const o of world.objects) {
    if (o.prefab === 'glb') continue // i GLB non hanno collider (per ora)
    out.push(...collidersOf(o))
  }
  return out
}

/** true se il punto (raggio r) è libero a quota y (spawn valido) */
export function isFreeSpot(x: number, z: number, y: number, r: number, colliders: THREE.Box3[]): boolean {
  for (const b of colliders) {
    if (y + 1.6 < b.min.y || y > b.max.y) continue
    if (x > b.min.x - r && x < b.max.x + r && z > b.min.z - r && z < b.max.z + r) return false
  }
  return true
}

/** sposta lo spawn fuori dai muri (spiral search) */
export function safeSpawn(world: RWorld, colliders: THREE.Box3[]): THREE.Vector3 {
  const s = new THREE.Vector3(world.spawn[0], world.spawn[1], world.spawn[2])
  if (isFreeSpot(s.x, s.z, s.y, 0.4, colliders)) return s
  for (let ring = 1; ring <= 8; ring++) {
    const rr = ring * 0.8
    for (let a = 0; a < 12; a++) {
      const x = s.x + Math.cos((a / 12) * Math.PI * 2) * rr
      const z = s.z + Math.sin((a / 12) * Math.PI * 2) * rr
      if (isFreeSpot(x, z, s.y, 0.4, colliders)) return new THREE.Vector3(x, s.y, z)
    }
  }
  return s
}

// ---------------- fisica del giocatore ----------------

export type PhysResult = { onGround: boolean; groundY: number; hitCeiling: boolean }

/**
 * Risolve le collisioni di una capsula semplificata (cilindro):
 *  - spinge fuori orizzontalmente dai muri (scivolando)
 *  - calcola il pavimento sotto i piedi (anche sopra i collider:
 *    passerelle e scale) con step-up automatico
 * Chiamarla DOPO aver integrato posizione e velocità.
 */
export function collideAndGround(
  pos: THREE.Vector3,
  radius: number,
  height: number,
  stepUp: number,
  colliders: THREE.Box3[]
): PhysResult {
  let groundY = 0 // pavimento base del mondo
  let hitCeiling = false

  for (const b of colliders) {
    // il collider è sotto i piedi (o raggiungibile con un passo)?
    const walkTop = b.max.y
    const overXZ =
      pos.x > b.min.x - radius * 0.55 && pos.x < b.max.x + radius * 0.55 &&
      pos.z > b.min.z - radius * 0.55 && pos.z < b.max.z + radius * 0.55
    if (overXZ && walkTop <= pos.y + stepUp && walkTop > groundY) {
      groundY = walkTop
    }
    // soffitto?
    if (
      overXZ && b.min.y > pos.y + height * 0.5 && b.min.y < pos.y + height + 0.05
    ) {
      hitCeiling = true
    }
  }

  // spinta orizzontale dai muri (solo se il corpo li interseca davvero)
  for (const b of colliders) {
    // camminabile o troppo basso per bloccare?
    if (b.max.y <= pos.y + stepUp) continue
    // troppo alto sopra la testa?
    if (b.min.y >= pos.y + height) continue
    const cx = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x)
    const cz = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z)
    const dx = pos.x - cx
    const dz = pos.z - cz
    const d2 = dx * dx + dz * dz
    if (d2 >= radius * radius) continue
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2)
      const push = (radius - d) / d
      pos.x += dx * push
      pos.z += dz * push
    } else {
      // centro dentro il box: spingi lungo l'asse più vicino
      const px1 = pos.x - (b.min.x - radius)
      const px2 = b.max.x + radius - pos.x
      const pz1 = pos.z - (b.min.z - radius)
      const pz2 = b.max.z + radius - pos.z
      const m = Math.min(px1, px2, pz1, pz2)
      if (m === px1) pos.x = b.min.x - radius
      else if (m === px2) pos.x = b.max.x + radius
      else if (m === pz1) pos.z = b.min.z - radius
      else pos.z = b.max.z + radius
    }
  }

  const onGround = pos.y <= groundY + 0.02
  return { onGround, groundY, hitCeiling }
}

// ---------------- ambiente di rendering ----------------

/** mappa d'ambiente PMREM per i riflessi PBR (una per renderer) */
export function makeEnvMap(gl: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(gl)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04)
  pmrem.dispose()
  return env.texture
}

// ---------------- post-processing ----------------

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    strength: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 d = vUv - vec2(0.5);
      float v = smoothstep(0.85, 0.35, length(d) * (1.0 + strength * 1.6));
      color.rgb *= mix(1.0, v, clamp(strength, 0.0, 1.0));
      gl_FragColor = color;
    }
  `,
}

export type PostFxParams = { bloom: number; vignette: number; exposure: number }

export type PostFx = {
  composer: EffectComposer
  render: () => void
  setSize: (w: number, h: number) => void
  setParams: (p: PostFxParams) => void
  dispose: () => void
}

/** crea la catena RenderPass → Bloom → Vignette → OutputPass */
export function makePostFx(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  params: PostFxParams
): PostFx {
  const composer = new EffectComposer(gl)
  composer.addPass(new RenderPass(scene, camera))

  const size = gl.getDrawingBufferSize(new THREE.Vector2())
  const bloom = new UnrealBloomPass(size, params.bloom, 0.55, 0.92)
  composer.addPass(bloom)

  const vignette = new ShaderPass(VignetteShader)
  vignette.uniforms.strength.value = params.vignette
  composer.addPass(vignette)

  composer.addPass(new OutputPass())

  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = params.exposure

  return {
    composer,
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    setParams: p => {
      bloom.strength = p.bloom
      vignette.uniforms.strength.value = p.vignette
      gl.toneMappingExposure = p.exposure
    },
    dispose: () => composer.dispose(),
  }
}

// ---------------- statistiche (per la barra di stato) ----------------

export function worldStats(world: RWorld): { objects: number; lights: number; tris: string } {
  let tris = 0
  for (const o of world.objects) {
    const def = PREFABS[o.prefab]
    if (!def) continue
    tris += Math.round(
      def.size[0] * def.size[1] * def.size[2] * 2.2 // stima rapida
    )
  }
  return { objects: world.objects.length, lights: world.lights.length, tris: tris > 1000 ? `${(tris / 1000).toFixed(0)}k` : String(tris) }
}
