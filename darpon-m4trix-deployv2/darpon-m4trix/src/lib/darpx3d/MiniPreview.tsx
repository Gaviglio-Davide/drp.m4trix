'use client'

// ============================================================
// Darpx3D · MiniPreview — anteprima 3D inline del modello
// generato, con auto-rotazione e orbita col mouse. Leggera:
// carica il GLB dall'object URL e lo incornicia da sola.
// ============================================================

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export default function MiniPreview({ url, className }: { url: string; className?: string }) {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    let raf = 0
    let disposed = false
    let dispose = () => {}

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(mount.clientWidth, mount.clientHeight, false)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.touchAction = 'none'

    const scene = new THREE.Scene()
    scene.add(new THREE.HemisphereLight(0xffffff, 0xbcb49c, 1.15))
    const key = new THREE.DirectionalLight(0xffffff, 1.7)
    key.position.set(3, 6, 4)
    scene.add(key)
    const back = new THREE.DirectionalLight(0xdfe8ff, 0.65)
    back.position.set(-4, 3, -3)
    scene.add(back)

    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 100)
    camera.position.set(2.6, 1.9, 3.4)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.set(0, 0.9, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controls.minDistance = 1.2
    controls.maxDistance = 12
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.6
    controls.update()

    // pavimento ombra soffusa
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.07 })
    )
    ground.rotation.x = -Math.PI / 2
    scene.add(ground)

    const loader = new GLTFLoader()
    loader.load(
      url,
      gltf => {
        if (disposed) return
        scene.add(gltf.scene)
        // incornicia il modello
        const box = new THREE.Box3().setFromObject(gltf.scene)
        const size = box.getSize(new THREE.Vector3())
        const c = box.getCenter(new THREE.Vector3())
        controls.target.copy(c)
        const maxDim = Math.max(size.x, size.y, size.z)
        const dist = (maxDim / 2) / Math.tan((camera.fov * Math.PI) / 360) * 1.35
        camera.position.set(c.x + dist * 0.55, c.y + dist * 0.42, c.z + dist * 0.72)
        controls.update()
        // terreno sotto il modello
        ground.position.y = box.min.y - 0.002
      },
      undefined,
      () => {
        /* modello non caricato: resta la scena vuota */
      }
    )

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return
      camera.aspect = mount.clientWidth / mount.clientHeight
      camera.updateProjectionMatrix()
      renderer.setSize(mount.clientWidth, mount.clientHeight, false)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(mount)
    resize()

    const tick = () => {
      if (disposed) return
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    dispose = () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      renderer.dispose()
      scene.traverse(o => {
        const m = o as THREE.Mesh
        if (m.isMesh) {
          m.geometry?.dispose?.()
          const mat = m.material
          if (Array.isArray(mat)) mat.forEach(x => x.dispose())
          else mat?.dispose?.()
        }
      })
      renderer.domElement.remove()
    }
    return dispose
  }, [url])

  return (
    <div
      ref={mountRef}
      className={className ?? 'h-56 w-full overflow-hidden rounded-2xl bg-gradient-to-b from-stone-50 to-stone-100 ring-1 ring-stone-200'}
      aria-label="Anteprima 3D del modello generato"
    />
  )
}
