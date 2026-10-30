'use client'

import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { ContactShadows, Grid, OrbitControls, useGLTF } from '@react-three/drei'
import {
  Box,
  Download,
  Eye,
  Loader2,
  Maximize,
  RotateCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================
// Anteprima 3D dei modelli GLB: si apre da "Progetti importati",
// da Darpx.ai dopo una generazione e dal pannello admin.
// Ruota con il mouse (sinistro), zoom con la rotella, panoramica
// col destro. Mostra statistiche reali del modello e segnala
// subito se un file è corrotto o illeggibile.
// ============================================================

export type GLBViewerProps = {
  url: string | null
  name?: string
  onClose: () => void
}

type ModelStats = {
  triangles: number
  meshes: number
  materials: number
  size: [number, number, number]
}

function collectStats(object: THREE.Object3D): ModelStats {
  let triangles = 0
  let meshes = 0
  const materials = new Set<THREE.Material>()
  object.traverse(o => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    meshes++
    const g = m.geometry as THREE.BufferGeometry
    if (g?.attributes?.position) {
      triangles += g.attributes.position.count / 3
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material]
    mats.forEach(mm => mm && materials.add(mm))
  })
  const box = new THREE.Box3().setFromObject(object)
  const s = box.getSize(new THREE.Vector3())
  return {
    triangles: Math.round(triangles),
    meshes,
    materials: materials.size,
    size: [s.x, s.y, s.z],
  }
}

function PreviewModel({
  url,
  wireframe,
  onStats,
}: {
  url: string
  wireframe: boolean
  onStats: (s: ModelStats) => void
}) {
  const { scene } = useGLTF(url)
  const { camera, controls } = useThree()
  const fitted = useRef(false)

  const prepared = useMemo(() => {
    const c = scene.clone(true)
    // centra il modello sull'origine, con i piedi a terra
    const box = new THREE.Box3().setFromObject(c)
    const center = box.getCenter(new THREE.Vector3())
    c.position.x -= center.x
    c.position.z -= center.z
    c.position.y -= box.min.y
    return c
  }, [scene])

  useEffect(() => {
    onStats(collectStats(prepared))
  }, [prepared, onStats])

  // inquadra il modello qualunque sia la sua dimensione reale
  useEffect(() => {
    if (fitted.current) return
    fitted.current = true
    const box = new THREE.Box3().setFromObject(prepared)
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z, 0.001)
    const dist = maxDim * 1.9
    camera.position.set(dist * 0.75, maxDim * 0.9, dist * 0.75)
    camera.lookAt(0, size.y * 0.35, 0)
    const ctr = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null
    if (ctr?.target) {
      ctr.target.set(0, size.y * 0.35, 0)
      ctr.update?.()
    }
  }, [prepared, camera, controls])

  useEffect(() => {
    scene.traverse(o => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mats = Array.isArray(m.material) ? m.material : [m.material]
      mats.forEach(mm => {
        if (mm && 'wireframe' in mm) (mm as THREE.MeshStandardMaterial).wireframe = wireframe
      })
    })
  }, [scene, wireframe])

  return <primitive object={prepared} dispose={null} />
}

function LoadShield({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-stone-500">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--primary)]" />
            <p className="text-sm">Carico il modello 3D…</p>
          </div>
        </div>
      }
    >
      {children}
    </Suspense>
  )
}

class GLBError extends Component<
  { children: ReactNode; url: string },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; url: string }) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-2xl bg-red-50 p-5 text-center ring-1 ring-red-200">
            <p className="text-2xl">⚠️</p>
            <p className="mt-2 font-semibold text-red-700">
              Questo file non si riesce ad aprire
            </p>
            <p className="mt-1 text-sm text-red-600/80">
              Il file potrebbe essere corrotto, incompleto o non un GLB/GLTF
              valido. Prova a scaricarlo di nuovo dalla fonte e a ricaricarlo.
            </p>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function GLBViewer({ url, name, onClose }: GLBViewerProps) {
  const [stats, setStats] = useState<ModelStats | null>(null)
  const [autoRotate, setAutoRotate] = useState(true)
  const [wireframe, setWireframe] = useState(false)

  useEffect(() => {
    setStats(null)
  }, [url])

  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`

  return (
    <Dialog open={!!url} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden p-0 sm:rounded-3xl">
        <DialogHeader className="border-b border-black/5 px-5 py-3">
          <div className="flex items-center justify-between gap-3 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 truncate text-base">
                <Eye className="h-4 w-4 shrink-0 text-[var(--primary)]" />
                <span className="truncate">{name ?? 'Anteprima modello'}</span>
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs">
                Trascina col sinistro per ruotare · rotella per zoom · destro
                per spostare la visuale
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 flex-wrap items-center gap-1.5 sm:flex">
              {stats && (
                <>
                  <Chip icon="📐" label={`${fmt(stats.triangles)} triangoli`} />
                  <Chip
                    icon="📏"
                    label={`${stats.size[0].toFixed(1)} × ${stats.size[1].toFixed(1)} × ${stats.size[2].toFixed(1)} m`}
                  />
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="h-[58vh] min-h-[340px] bg-gradient-to-b from-stone-100 to-stone-200">
          {url && (
            <GLBError url={url}>
              <LoadShield>
                <Canvas
                  shadows
                  camera={{ position: [4, 3, 4], fov: 45, near: 0.01, far: 5000 }}
                  dpr={[1, 2]}
                >
                  <color attach="background" args={['#e7e5e4']} />
                  <hemisphereLight intensity={0.7} groundColor="#d6d3d1" />
                  <directionalLight
                    position={[5, 8, 4]}
                    intensity={1.6}
                    castShadow
                    shadow-mapSize={[1024, 1024]}
                  />
                  <directionalLight position={[-6, 4, -5]} intensity={0.5} />
                  <PreviewModel
                    url={url}
                    wireframe={wireframe}
                    onStats={setStats}
                  />
                  <ContactShadows
                    position={[0, 0, 0]}
                    opacity={0.45}
                    scale={30}
                    blur={2.4}
                    far={12}
                  />
                  <Grid
                    position={[0, 0.001, 0]}
                    args={[40, 40]}
                    cellSize={1}
                    cellThickness={0.6}
                    cellColor="#a8a29e"
                    sectionSize={5}
                    sectionThickness={1.1}
                    sectionColor="#f2620f"
                    fadeDistance={38}
                    fadeStrength={1.2}
                    infiniteGrid
                  />
                  <OrbitControls
                    makeDefault
                    autoRotate={autoRotate}
                    autoRotateSpeed={1.6}
                    enableDamping
                    minDistance={0.05}
                    maxDistance={800}
                    maxPolarAngle={Math.PI / 2.05}
                  />
                </Canvas>
              </LoadShield>
            </GLBError>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/5 px-5 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={autoRotate ? 'default' : 'outline'}
              onClick={() => setAutoRotate(a => !a)}
            >
              <RotateCw className="mr-1 h-3.5 w-3.5" />
              {autoRotate ? 'Rotazione ON' : 'Rotazione OFF'}
            </Button>
            <Button
              size="sm"
              variant={wireframe ? 'default' : 'outline'}
              onClick={() => setWireframe(w => !w)}
            >
              <Box className="mr-1 h-3.5 w-3.5" /> Wireframe
            </Button>
            {stats && (
              <span className="ml-1 hidden text-xs text-stone-400 md:inline">
                {stats.meshes} mesh · {stats.materials} materiali
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {url && (
              <a href={url} download target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline">
                  <Download className="mr-1 h-3.5 w-3.5" /> Scarica GLB
                </Button>
              </a>
            )}
            <Button size="sm" onClick={onClose}>
              <Maximize className="mr-1 h-3.5 w-3.5" /> Chiudi
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex items-center gap-1 rounded-full bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-600">
      {icon} {label}
    </span>
  )
}
