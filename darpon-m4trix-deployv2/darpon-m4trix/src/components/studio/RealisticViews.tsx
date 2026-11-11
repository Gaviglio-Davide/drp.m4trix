'use client'

// ============================================================
// DARPX ENGINE — viste 3D condivise (v17)
// Ambiente (cielo/nebbia/luci), post-processing, oggetti
// prefab con animazioni autonome, personaggi GLB e luci
// piazzate a mano. Usate sia dall'editor che dal player.
// ============================================================

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { Stars, useGLTF } from '@react-three/drei'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { ENV_PRESETS, type REnv, type RLightObj, type RObject, type RWorld } from '@/lib/engine3d/types'
import { PREFABS, buildRObject, type AnimCb } from '@/lib/engine3d/prefabs'
import { makeEnvMap, makePostFx, type PostFxParams } from '@/lib/engine3d/builder'

// ---------------- ambiente ----------------

export function RealEnv({ env }: { env: REnv }) {
  const { scene, gl } = useThree()
  const preset = ENV_PRESETS[env.sky] ?? ENV_PRESETS.interno

  // riflessi PBR (IBL) generati una volta per renderer
  useEffect(() => {
    const tex = makeEnvMap(gl)
    scene.environment = tex
    return () => {
      scene.environment = null
    }
  }, [gl, scene])

  // cielo + nebbia
  useEffect(() => {
    scene.background = new THREE.Color(preset.bg)
    if (env.fogDensity > 0.0001) {
      scene.fog = new THREE.FogExp2(env.fog, env.fogDensity)
    } else {
      scene.fog = null
    }
  }, [scene, preset.bg, env.fog, env.fogDensity])

  return (
    <>
      <hemisphereLight args={[preset.hemi[0], preset.hemi[1], preset.hemi[2]]} />
      {preset.dir && (
        <directionalLight
          color={preset.dir[0]}
          intensity={preset.dir[1]}
          position={preset.dir[2]}
          castShadow
          shadow-mapSize={[2048, 2048]}
          shadow-camera-left={-34}
          shadow-camera-right={34}
          shadow-camera-top={34}
          shadow-camera-bottom={-34}
          shadow-camera-far={160}
          shadow-bias={-0.0004}
        />
      )}
      {env.sky === 'notte' && (
        <Stars radius={140} depth={45} count={2600} factor={3.2} saturation={0} fade speed={0.5} />
      )}
    </>
  )
}

// ---------------- post-processing ----------------

export function PostFXView({ params }: { params: PostFxParams }) {
  const { gl, scene, camera, size } = useThree()
  const fx = useMemo(() => makePostFx(gl, scene, camera, params), [gl, scene, camera])
  useEffect(() => {
    fx.setSize(size.width, size.height)
  }, [size, fx])
  useEffect(() => {
    fx.setParams(params)
  }, [params, fx])
  useEffect(() => () => fx.dispose(), [fx])
  useFrame(() => {
    fx.render()
  }, 1)
  return null
}

// ---------------- un prefab del mondo ----------------

export function PrefabView({
  o,
  selected,
  onSelect,
  playMode,
  reg,
}: {
  o: RObject
  selected: boolean
  onSelect?: (id: string) => void
  playMode?: boolean
  reg?: (g: THREE.Group | null) => void
}) {
  const wrapper = useRef<THREE.Group | null>(null)
  // animazioni locali: ogni oggetto si anima da solo nel suo useFrame
  const anims = useMemo<AnimCb[]>(() => [], [])
  const matKey = JSON.stringify(o.mat ?? null)
  const built = useMemo(
    () => buildRObject(o, anims, false),
    // il gruppo si ricostruisce solo se cambia prefab o materiale
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [o.prefab, matKey, anims]
  )
  useFrame((state, dt) => {
    for (const f of anims) f(state.clock.elapsedTime, dt)
  })
  if (!built) return null
  const def = PREFABS[o.prefab]
  return (
    <group
      ref={g => {
        wrapper.current = g
        reg?.(g)
      }}
      position={o.p}
      rotation={[THREE.MathUtils.degToRad(o.r[0]), THREE.MathUtils.degToRad(o.r[1]), THREE.MathUtils.degToRad(o.r[2])]}
      scale={o.s}
      onPointerDown={
        playMode || !onSelect
          ? undefined
          : e => {
              e.stopPropagation()
              onSelect(o.id)
            }
      }
    >
      <primitive object={built} dispose={null} />
      {selected && def && (
        <lineSegments
          position={[0, (def.size[1] || 1) / 2, 0]}
          renderOrder={999}
        >
          <edgesGeometry args={[new THREE.BoxGeometry(def.size[0] || 1, def.size[1] || 1, def.size[2] || 1)]} />
          <lineBasicMaterial color="#19e0ff" transparent opacity={0.9} depthTest={false} />
        </lineSegments>
      )}
    </group>
  )
}

// ---------------- personaggio GLB ----------------

export function GlbView({ o, reg }: { o: RObject; reg?: (g: THREE.Group | null) => void }) {
  const { scene, animations } = useGLTF(o.url!)
  // clone normalizzato: alto 1.7 m, piedi a y=0, centrato
  const cloned = useMemo(() => {
    const c = skeletonClone(scene)
    const box = new THREE.Box3().setFromObject(c)
    const size = box.getSize(new THREE.Vector3())
    const s = 1.7 / Math.max(size.y, 0.001)
    c.scale.setScalar(s)
    const box2 = new THREE.Box3().setFromObject(c)
    c.position.y = -box2.min.y
    c.position.x = -(box2.min.x + box2.max.x) / 2
    c.position.z = -(box2.min.z + box2.max.z) / 2
    return c
  }, [scene])
  const mixer = useMemo(() => new THREE.AnimationMixer(cloned), [cloned])
  useEffect(() => {
    const clip =
      (o.anim != null && animations[o.anim]) ||
      animations.find(a => /walk|run|idle|loop/i.test(a.name)) ||
      animations[0]
    if (!clip) return
    const a = mixer.clipAction(clip)
    a.play()
    return () => {
      a.stop()
    }
  }, [animations, mixer, o.anim])
  useFrame((_, dt) => {
    mixer.update(dt)
  })
  return (
    <group
      ref={g => {
        reg?.(g)
      }}
      position={o.p}
      rotation={[THREE.MathUtils.degToRad(o.r[0]), THREE.MathUtils.degToRad(o.r[1]), THREE.MathUtils.degToRad(o.r[2])]}
      scale={o.s}
      onPointerDown={e => {
        e.stopPropagation()
      }}
    >
      <primitive object={cloned} dispose={null} />
    </group>
  )
}

// ---------------- luci piazzate a mano ----------------

export function LightView({
  l,
  selected,
  onSelect,
  playMode,
  reg,
}: {
  l: RLightObj
  selected: boolean
  onSelect?: (id: string) => void
  playMode?: boolean
  reg?: (g: THREE.Group | null) => void
}) {
  const ref = useRef<THREE.Group | null>(null)
  useFrame(state => {
    // lieve pulsazione per far capire che è una luce viva
    if (ref.current) {
      const s = selected ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.15 : 1
      ref.current.scale.setScalar(s)
    }
  })
  return (
    <group
      ref={g => {
        ref.current = g
        reg?.(g)
      }}
      position={l.p}
      onPointerDown={
        playMode || !onSelect
          ? undefined
          : e => {
              e.stopPropagation()
              onSelect(l.id)
            }
      }
    >
      {l.kind === 'point' ? (
        <pointLight color={l.color} intensity={l.intensity} distance={l.distance} decay={2} castShadow shadow-bias={-0.002} />
      ) : (
        <spotLight
          color={l.color}
          intensity={l.intensity}
          distance={l.distance}
          angle={l.angle ?? 0.7}
          penumbra={0.45}
          decay={2}
          position={[0, 0, 0]}
          target-position={[0, -1, 0]}
          castShadow
        />
      )}
      {/* sfera segnalino: visibile in editor, minuscola in gioco */}
      <mesh>
        <sphereGeometry args={[playMode ? 0.03 : 0.09, 10, 8]} />
        <meshBasicMaterial color={selected ? '#19e0ff' : l.color} />
      </mesh>
    </group>
  )
}

// ---------------- tutti gli oggetti del mondo ----------------

export function WorldObjects({
  world,
  selectedId,
  onSelect,
  playMode,
}: {
  world: RWorld
  selectedId?: string | null
  onSelect?: (id: string) => void
  playMode?: boolean
}) {
  return (
    <>
      {world.objects.map(o =>
        o.prefab === 'glb' && o.url ? (
          <GlbView key={o.id} o={o} />
        ) : (
          <PrefabView key={o.id} o={o} selected={o.id === selectedId} onSelect={onSelect} playMode={playMode} />
        )
      )}
      {world.lights.map(l => (
        <LightView key={l.id} l={l} selected={l.id === selectedId} onSelect={onSelect} playMode={playMode} />
      ))}
    </>
  )
}
