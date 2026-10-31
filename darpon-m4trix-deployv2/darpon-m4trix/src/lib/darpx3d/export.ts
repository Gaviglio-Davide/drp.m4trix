// ============================================================
// Darpx3D · export — serializzazione GLB nel browser
// GLTFExporter di three.js: binario GLB pronto per l'editor del
// sito (stesso formato dei modelli importati dall'utente).
// ============================================================

import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

/** esporta il gruppo in GLB (ArrayBuffer) */
export function exportGlb(group: THREE.Group): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter()
    exporter.parse(
      group,
      result => {
        if (result instanceof ArrayBuffer) resolve(result)
        else reject(new Error('Export non binario'))
      },
      err => reject(err instanceof Error ? err : new Error('Export fallito')),
      { binary: true, onlyVisible: true }
    )
  })
}

/** GLB → Blob (per URL di anteprima e upload) */
export async function exportGlbBlob(group: THREE.Group): Promise<Blob> {
  const buf = await exportGlb(group)
  return new Blob([buf], { type: 'model/gltf-binary' })
}

/** GLB → File (nome coerente col modello) */
export async function exportGlbFile(group: THREE.Group, name: string): Promise<File> {
  const blob = await exportGlbBlob(group)
  const safe = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'modello-darpx'
  return new File([blob], `${safe}.glb`, { type: 'model/gltf-binary' })
}
