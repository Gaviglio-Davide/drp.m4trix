'use client'

// ============================================================
// DARPX AVATAR (v7) — la forma fisica dell'agente
// ------------------------------------------------------------
// Un guizzo d'ombra con la fiamma olografica al posto della
// testa: il Beheaded di Dead Cells fuso con Capri, l'IA
// «chaos gremlin» di Cyberpunk: Edgerunners 2.
//   • corpo scuro da spadaccino con capa svolazzante
//   • fiamma ciano/viola al posto del viso
//   • collarino neurale, circuiti al neon, spalla olografica
// Umori (animazioni procedurali): idle · walk · think · talk ·
// happy · glitch. Tutto in un Canvas piccolo e leggero.
// ============================================================

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

export type AvatarMood = 'idle' | 'walk' | 'think' | 'talk' | 'happy' | 'glitch'

export default function DarpxAvatar({
  mood = 'idle',
  size = 56,
  className,
}: {
  mood?: AvatarMood
  size?: number
  className?: string
}) {
  return (
    <div className={className} style={{ width: size, height: size, lineHeight: 0 }}>
      <Canvas
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
        camera={{ fov: 34, near: 0.1, far: 20, position: [0, 1.05, 3.4] }}
        style={{ background: 'transparent' }}
      >
        <AvatarCamera />
        <ambientLight intensity={0.75} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.35} color="#cfe4ff" />
        <pointLight position={[0, 1.35, 0.35]} intensity={2.2} distance={2.6} color="#57e0ff" />
        <AvatarRig mood={mood} />
      </Canvas>
    </div>
  )
}

/** inquadra l'avatar: sempre centrato sul busto (non sull'origine) */
function AvatarCamera() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(0, 1.05, 3.4)
    camera.lookAt(0, 0.92, 0)
  }, [camera])
  return null
}

function AvatarRig({ mood }: { mood: AvatarMood }) {
  const moodRef = useRef<AvatarMood>(mood)
  useEffect(() => {
    moodRef.current = mood
  }, [mood])

  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const legL = useRef<THREE.Group>(null)
  const legR = useRef<THREE.Group>(null)
  const armL = useRef<THREE.Group>(null)
  const armR = useRef<THREE.Group>(null)
  const cape = useRef<THREE.Group>(null)
  const flameCore = useRef<THREE.Mesh>(null)
  const flameHalo = useRef<THREE.Mesh>(null)
  const flameSpark = useRef<THREE.Mesh>(null)
  const dots = useRef<THREE.Group>(null)
  const shadowDisc = useRef<THREE.Mesh>(null)

  useFrame(state => {
    const t = state.clock.elapsedTime
    const m = moodRef.current
    const g = root.current
    if (!g) return

    // parametri per umore
    const walking = m === 'walk'
    const thinking = m === 'think'
    const talking = m === 'talk'
    const happy = m === 'happy'
    const glitch = m === 'glitch'

    // camminata: gambe + braccia oscillano
    const speed = walking ? 7.5 : 0
    const swing = walking ? Math.sin(t * speed) * 0.7 : 0
    if (legL.current) legL.current.rotation.x = swing
    if (legR.current) legR.current.rotation.x = -swing

    if (thinking) {
      // mano al mento + l'altro braccio incrociato
      if (armR.current) {
        armR.current.rotation.x = -2.1
        armR.current.rotation.z = -0.5
      }
      if (armL.current) {
        armL.current.rotation.x = -0.7
        armL.current.rotation.z = 0.55
      }
    } else if (talking) {
      if (armR.current) {
        armR.current.rotation.x = -1.15 + Math.sin(t * 5.2) * 0.35
        armR.current.rotation.z = -0.25
      }
      if (armL.current) {
        armL.current.rotation.x = -0.25 + Math.sin(t * 3.1 + 1) * 0.15
        armL.current.rotation.z = 0.3
      }
    } else {
      if (armL.current) {
        armL.current.rotation.x = -swing * 0.75 + (happy ? -2.6 : 0)
        armL.current.rotation.z = happy ? -0.9 : 0.22 + Math.sin(t * 1.6) * 0.05
      }
      if (armR.current) {
        armR.current.rotation.x = swing * 0.75 + (happy ? -2.6 : 0)
        armR.current.rotation.z = happy ? 0.9 : -0.22 - Math.sin(t * 1.6 + 0.5) * 0.05
      }
    }

    // corpo: galleggio dolce / salti di gioia
    const bob = walking
      ? Math.abs(Math.sin(t * speed)) * 0.045
      : happy
        ? Math.abs(Math.sin(t * 6)) * 0.16
        : Math.sin(t * 1.9) * 0.03
    if (body.current) body.current.position.y = bob

    // rotazione: gira piano da fermo, gira su se stesso se felice
    g.rotation.y = happy
      ? t * 4.2
      : Math.sin(t * 0.45) * 0.28

    // glitch: scatti casuali
    if (glitch) {
      const j = (n: number) => (Math.sin(t * 31 + n * 7) > 0.72 ? (Math.random() - 0.5) * 0.06 : 0)
      g.position.x = j(1)
      g.position.y = j(2)
      g.position.z = j(3)
    } else {
      g.position.set(0, 0, 0)
    }

    // capa: ondeggiamento
    if (cape.current) {
      cape.current.rotation.x = 0.22 + Math.sin(t * 2.6) * 0.07 + (walking ? 0.22 : 0)
      cape.current.rotation.z = Math.sin(t * 1.7) * 0.05
    }

    // fiamma: tremolio continuo, più intensa se parla/felice
    const flameScale = 1 + Math.sin(t * 9) * 0.09 + Math.sin(t * 23) * 0.05
    const boost = talking ? 1.18 : happy ? 1.32 : glitch ? 1.1 : 1
    if (flameCore.current) {
      flameCore.current.scale.set(flameScale * boost, flameScale * 1.25 * boost, flameScale * boost)
      flameCore.current.rotation.y = t * 1.4
      flameCore.current.rotation.x = Math.sin(t * 2.2) * 0.12
    }
    if (flameHalo.current) {
      const hs = (1 + Math.sin(t * 5.5) * 0.06) * boost
      flameHalo.current.scale.set(hs, hs * 1.15, hs)
      const mat = flameHalo.current.material as THREE.MeshStandardMaterial
      mat.emissiveIntensity = glitch ? (Math.sin(t * 27) > 0 ? 2.4 : 0.6) : 1.1
    }
    if (flameSpark.current) {
      flameSpark.current.position.y = 1.62 + Math.sin(t * 4.4) * 0.05
      flameSpark.current.rotation.y = -t * 2
      flameSpark.current.visible = !thinking
    }

    // pallini del pensiero (orbita sopra la fiamma)
    if (dots.current) {
      dots.current.visible = thinking
      dots.current.rotation.y = t * 2.4
      dots.current.children.forEach((c, i) => {
        c.position.y = Math.sin(t * 3 + i * 2.1) * 0.04
      })
    }

    // ombra a terra respira con l'altezza
    if (shadowDisc.current) {
      const k = 1 - bob * 2.2
      shadowDisc.current.scale.setScalar(Math.max(0.55, k))
    }
  })

  const dark = '#14141c'
  const darkCloth = '#1c1524'
  const cyan = '#57e0ff'
  const violet = '#a06bff'

  return (
    <group ref={root}>
      {/* ombra morbida */}
      <mesh ref={shadowDisc} position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.34, 24]} />
        <meshBasicMaterial color="#1a1030" transparent opacity={0.28} depthWrite={false} />
      </mesh>

      <group ref={body}>
        {/* gambe */}
        <group ref={legL} position={[-0.09, 0.52, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <capsuleGeometry args={[0.052, 0.3, 4, 10]} />
            <meshStandardMaterial color={dark} roughness={0.55} metalness={0.35} />
          </mesh>
          <mesh position={[0, -0.47, 0.02]}>
            <boxGeometry args={[0.1, 0.07, 0.15]} />
            <meshStandardMaterial color="#0e0e15" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>
        <group ref={legR} position={[0.09, 0.52, 0]}>
          <mesh position={[0, -0.24, 0]}>
            <capsuleGeometry args={[0.052, 0.3, 4, 10]} />
            <meshStandardMaterial color={dark} roughness={0.55} metalness={0.35} />
          </mesh>
          <mesh position={[0, -0.47, 0.02]}>
            <boxGeometry args={[0.1, 0.07, 0.15]} />
            <meshStandardMaterial color="#0e0e15" roughness={0.4} metalness={0.5} />
          </mesh>
        </group>

        {/* torso */}
        <mesh position={[0, 0.78, 0]}>
          <capsuleGeometry args={[0.13, 0.3, 6, 12]} />
          <meshStandardMaterial color={dark} roughness={0.5} metalness={0.4} />
        </mesh>
        {/* cintura con nucleo luminoso */}
        <mesh position={[0, 0.63, 0]}>
          <cylinderGeometry args={[0.125, 0.135, 0.06, 12]} />
          <meshStandardMaterial color="#25202e" roughness={0.45} metalness={0.5} />
        </mesh>
        <mesh position={[0, 0.63, 0.125]}>
          <sphereGeometry args={[0.028, 10, 8]} />
          <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={2.4} toneMapped={false} />
        </mesh>

        {/* circuiti al neon sul torso */}
        <mesh position={[0.062, 0.86, 0.078]}>
          <boxGeometry args={[0.012, 0.16, 0.012]} />
          <meshStandardMaterial color={violet} emissive={violet} emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        <mesh position={[-0.062, 0.8, 0.078]}>
          <boxGeometry args={[0.012, 0.1, 0.012]} />
          <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={1.6} toneMapped={false} />
        </mesh>

        {/* spalla olografica */}
        <mesh position={[-0.155, 0.93, 0]} rotation={[0, 0, 0.35]}>
          <boxGeometry args={[0.12, 0.05, 0.16]} />
          <meshStandardMaterial
            color={violet}
            emissive={violet}
            emissiveIntensity={0.9}
            transparent
            opacity={0.55}
            roughness={0.2}
          />
        </mesh>

        {/* braccia */}
        <group ref={armL} position={[-0.2, 0.92, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
            <meshStandardMaterial color={dark} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.31, 0]}>
            <sphereGeometry args={[0.042, 8, 6]} />
            <meshStandardMaterial color="#22222c" roughness={0.45} metalness={0.45} />
          </mesh>
        </group>
        <group ref={armR} position={[0.2, 0.92, 0]}>
          <mesh position={[0, -0.16, 0]}>
            <capsuleGeometry args={[0.04, 0.22, 4, 8]} />
            <meshStandardMaterial color={dark} roughness={0.5} metalness={0.4} />
          </mesh>
          <mesh position={[0, -0.31, 0]}>
            <sphereGeometry args={[0.042, 8, 6]} />
            <meshStandardMaterial color="#22222c" roughness={0.45} metalness={0.45} />
          </mesh>
        </group>

        {/* capa svolazzante */}
        <group ref={cape} position={[0, 1.02, -0.09]}>
          <mesh position={[0, -0.3, -0.03]} rotation={[0.1, 0, 0]}>
            <coneGeometry args={[0.21, 0.62, 10, 1, true]} />
            <meshStandardMaterial
              color={darkCloth}
              roughness={0.85}
              side={THREE.DoubleSide}
            />
          </mesh>
          {/* bordo della capa acceso */}
          <mesh position={[0, -0.6, -0.05]}>
            <torusGeometry args={[0.13, 0.008, 6, 18]} />
            <meshStandardMaterial color={violet} emissive={violet} emissiveIntensity={1.6} toneMapped={false} />
          </mesh>
        </group>

        {/* collarino neurale (al posto del collo) */}
        <mesh position={[0, 1.08, 0]}>
          <torusGeometry args={[0.095, 0.022, 8, 20]} />
          <meshStandardMaterial color="#2c2740" metalness={0.7} roughness={0.35} emissive={violet} emissiveIntensity={0.8} toneMapped={false} />
        </mesh>

        {/* NIENTE TESTA: fiamma olografica */}
        <mesh ref={flameCore} position={[0, 1.32, 0]}>
          <icosahedronGeometry args={[0.095, 1]} />
          <meshStandardMaterial color={cyan} emissive={cyan} emissiveIntensity={2.6} roughness={0.3} toneMapped={false} />
        </mesh>
        <mesh ref={flameHalo} position={[0, 1.32, 0]}>
          <icosahedronGeometry args={[0.15, 1]} />
          <meshStandardMaterial
            color={violet}
            emissive={violet}
            emissiveIntensity={1.6}
            transparent
            opacity={0.5}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        <mesh ref={flameSpark} position={[0, 1.62, 0]}>
          <tetrahedronGeometry args={[0.028, 0]} />
          <meshStandardMaterial color="#c8f4ff" emissive={cyan} emissiveIntensity={2.8} toneMapped={false} />
        </mesh>

        {/* pallini del pensiero */}
        <group ref={dots} position={[0, 1.78, 0]} visible={false}>
          {[0, 1, 2].map(i => {
            const a = (i / 3) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16]}>
                <sphereGeometry args={[0.026, 8, 6]} />
                <meshStandardMaterial color="#dff4ff" emissive={cyan} emissiveIntensity={2.2} toneMapped={false} />
              </mesh>
            )
          })}
        </group>
      </group>
    </group>
  )
}
