// Inspect knight GLB dimensions with three.js GLTFLoader (node)
const THREE = require('three')
const { GLTFLoader } = require('three/examples/jsm/loaders/GLTFLoader.js')
const fs = require('fs')

async function main() {
  const buf = fs.readFileSync('/home/z/my-project/public/models/knight.glb')
  const loader = new GLTFLoader()
  loader.parse(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    '',
    gltf => {
      const scene = gltf.scene
      const box = new THREE.Box3().setFromObject(scene)
      const size = box.getSize(new THREE.Vector3())
      console.log('bbox min:', box.min)
      console.log('bbox max:', box.max)
      console.log('size:', size)
      console.log('animations:', gltf.animations.map(a => ({ name: a.name, dur: a.duration })))
      // child hierarchy
      scene.traverse(o => {
        if (o.isMesh) {
          console.log('mesh:', o.name, 'skinned:', !!o.isSkinnedMesh, 'material:', Array.isArray(o.material) ? o.material.map(m => m.name) : o.material.name)
        }
      })
      process.exit(0)
    },
    err => {
      console.error('parse error', err)
      process.exit(1)
    }
  )
}
main()
