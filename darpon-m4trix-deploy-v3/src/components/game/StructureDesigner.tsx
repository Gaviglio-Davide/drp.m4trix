'use client'

// ============================================================
// Designer di strutture: zona dedicata dove costruire case e
// edifici pezzo per pezzo (muri, pavimenti, tetti...) e salvare
// il risultato come oggetto riutilizzabile nell'editor.
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Hammer, Loader2, RotateCcw, Undo2, X } from 'lucide-react'
import {
  PIECE_DEFS,
  StructureModel,
  GhostGroup,
  getPieceDef,
  type PieceType,
  type StructurePiece,
} from '@/lib/assets'
import { useWorld, PALETTE, type CustomAsset } from '@/lib/world-store'

const DESIGN_HALF = 4 // griglia 9x9 celle: -4..4
const MAX_LEVEL = 4

type Cell = [number, number]

export default function StructureDesigner({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const addCustomAsset = useWorld(s => s.addCustomAsset)
  const customAssets = useWorld(s => s.customAssets)

  const [pieces, setPieces] = useState<StructurePiece[]>([])
  const [history, setHistory] = useState<StructurePiece[][]>([])
  const [piece, setPiece] = useState<PieceType>('pavimento')
  const [rot, setRot] = useState(0)
  const [color, setColor] = useState(1)
  const [level, setLevel] = useState(0)
  const [hover, setHover] = useState<Cell | null>(null)
  const [name, setName] = useState('La mia casa')
  const [saving, setSaving] = useState(false)

  // il componente viene montato ex-novo a ogni apertura (vedi Editor.tsx):
  // lo stato locale parte quindi sempre dai valori predefiniti.

  const pushHistory = (prev: StructurePiece[]) =>
    setHistory(h => [...h.slice(-39), prev])

  const place = (cell: Cell) => {
    const [x, z] = cell
    if (Math.abs(x) > DESIGN_HALF || Math.abs(z) > DESIGN_HALF) return
    const exists = pieces.some(p => p.x === x && p.z === z && p.y === level)
    if (exists) return
    pushHistory(pieces)
    setPieces(ps => [...ps, { p: piece, x, y: level, z, rot, color }])
  }

  const removeAt = (cell: Cell) => {
    const [x, z] = cell
    const inCell = pieces.filter(p => p.x === x && p.z === z)
    if (!inCell.length) return
    // rimuove il pezzo più alto della colonna (naturalmente "demolisco dall'alto")
    const top = inCell.reduce((a, b) => (b.y > a.y ? b : a))
    pushHistory(pieces)
    setPieces(ps => ps.filter(p => p !== top))
  }

  const undo = () => {
    if (!history.length) return
    setPieces(history[history.length - 1])
    setHistory(h => h.slice(0, -1))
  }

  // tastiera
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'KeyR') setRot(r => (r + 1) % 4)
      if (e.code === 'Escape') onClose()
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, history, pieces])

  const save = async () => {
    if (!pieces.length) {
      toast.error('Piazza almeno un pezzo prima di salvare')
      return
    }
    const clean = name.trim() || 'Struttura'
    setSaving(true)
    const asset: CustomAsset = {
      id: `s_${Date.now().toString(36)}`,
      kind: 'structure',
      name: clean,
      pieces,
    }
    addCustomAsset(asset)
    toast.success(`"${clean}" salvata! La trovi nella barra degli oggetti 🏗️`)
    setSaving(false)
    onClose()
  }

  const occupiedNow = useMemo(
    () => new Set(pieces.map(p => `${p.x},${p.z},${p.y}`)),
    [pieces]
  )

  if (!open) return null

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="flex h-[92vh] w-[95vw] max-w-[1000px] flex-col gap-3 overflow-hidden rounded-3xl">
        <DialogTitle className="flex items-center gap-2 text-lg">
          <Hammer className="h-5 w-5 text-[var(--primary)]" />
          Progetta la tua struttura
          <span className="ml-auto text-xs font-normal text-stone-400">
            Clic = piazza · Clic destro = demolisci · R = ruota · Ctrl+Z = annulla
          </span>
        </DialogTitle>

        {/* area 3D */}
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl bg-sky-100 ring-1 ring-black/5">
          <DesignerScene
            pieces={pieces}
            hover={hover}
            piece={piece}
            rot={rot}
            color={color}
            level={level}
            occupiedNow={occupiedNow}
            onHover={setHover}
            onPlace={place}
            onRemove={removeAt}
          />
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
            <div className="rounded-full bg-white/85 px-3.5 py-1.5 text-xs font-medium text-stone-600 shadow ring-1 ring-black/5">
              Livello di costruzione: <b>{level}</b> (0 = terra)
            </div>
          </div>
        </div>

        {/* controlli */}
        <div className="flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-black/5">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {PIECE_DEFS.map(p => (
              <button
                key={p.id}
                onClick={() => setPiece(p.id)}
                className={`flex min-w-16 shrink-0 flex-col items-center gap-0.5 rounded-2xl px-2.5 py-1.5 transition-all ${
                  piece === p.id
                    ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                    : 'bg-white ring-1 ring-stone-200 hover:bg-stone-100'
                }`}
              >
                <span className="text-lg leading-none">{p.icon}</span>
                <span className="whitespace-nowrap text-[10px] font-medium text-stone-600">
                  {p.label}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Livello
            </span>
            {Array.from({ length: MAX_LEVEL + 1 }, (_, i) => i).map(i => (
              <button
                key={i}
                onClick={() => setLevel(i)}
                className={`h-6 w-6 shrink-0 rounded-full text-[11px] font-bold transition-all ${
                  level === i
                    ? 'bg-[var(--primary)] text-white'
                    : 'bg-white text-stone-500 ring-1 ring-stone-200 hover:bg-stone-100'
                }`}
              >
                {i}
              </button>
            ))}
            <span className="mx-2 h-5 w-px shrink-0 bg-stone-200" />
            <span className="mr-1 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
              Colori
            </span>
            {PALETTE.map((c, i) => (
              <button
                key={c}
                onClick={() => setColor(i)}
                className={`h-6 w-6 shrink-0 rounded-full ring-2 transition-transform hover:scale-110 ${
                  color === i ? 'ring-stone-700' : 'ring-transparent'
                }`}
                style={{ backgroundColor: c }}
                aria-label={`Colore ${i + 1}`}
              />
            ))}
            <span className="mx-2 h-5 w-px shrink-0 bg-stone-200" />
            <Button variant="outline" size="sm" className="h-7 shrink-0" onClick={() => setRot(r => (r + 1) % 4)}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Ruota
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 shrink-0"
              disabled={!history.length}
              onClick={undo}
            >
              <Undo2 className="mr-1 h-3.5 w-3.5" /> Annulla
            </Button>
            <div className="ml-auto flex items-center gap-2">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                className="h-8 w-44"
                placeholder="Nome della struttura"
              />
              <Button size="sm" onClick={save} disabled={saving || !pieces.length}>
                {saving ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Hammer className="mr-1 h-4 w-4" />
                )}
                Salva struttura
              </Button>
              <Button variant="ghost" size="sm" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-stone-400">
            Consigli: inizia dal pavimento (livello 0), poi muri, porte e
            finestre; il tetto va bene su qualsiasi livello. Quando salvi, la
            struttura diventa un oggetto della tua libreria e la puoi piazzare
            nel mondo quante volte vuoi.
            {customAssets.filter(a => a.kind === 'structure').length > 0 &&
              ` Hai già ${customAssets.filter(a => a.kind === 'structure').length} strutture salvate.`}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ============================================================
// Scena 3D del designer
// ============================================================

function DesignerScene({
  pieces,
  hover,
  piece,
  rot,
  color,
  level,
  occupiedNow,
  onHover,
  onPlace,
  onRemove,
}: {
  pieces: StructurePiece[]
  hover: Cell | null
  piece: PieceType
  rot: number
  color: number
  level: number
  occupiedNow: Set<string>
  onHover: (c: Cell | null) => void
  onPlace: (c: Cell) => void
  onRemove: (c: Cell) => void
}) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 200, position: [7, 8, 9] }}
      onContextMenu={e => e.preventDefault()}
    >
      <color attach="background" args={['#dff0f7']} />
      <directionalLight
        position={[10, 16, 8]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#e8f4ff', '#9aa88a', 0.5]} />
      {/* base */}
      <mesh position={[0, -0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[11, 11]} />
        <meshStandardMaterial color="#8fb877" roughness={1} />
      </mesh>
      <gridHelper args={[9, 9, '#6d8a5c', '#7fa06a']} position={[0, 0.005, 0]} />
      <DesignGround onHover={onHover} onPlace={onPlace} onRemove={onRemove} />
      {pieces.length > 0 && <StructureModel pieces={pieces} />}
      <GhostPiece hover={hover} piece={piece} rot={rot} color={color} level={level} occupiedNow={occupiedNow} />
      <DesignerControls />
    </Canvas>
  )
}

function DesignGround({
  onHover,
  onPlace,
  onRemove,
}: {
  onHover: (c: Cell | null) => void
  onPlace: (c: Cell) => void
  onRemove: (c: Cell) => void
}) {
  const drag = useRef<{ button: number } | null>(null)
  const toCell = (p: THREE.Vector3): Cell => [Math.round(p.x), Math.round(p.z)]
  const inArea = (c: Cell) =>
    Math.abs(c[0]) <= DESIGN_HALF && Math.abs(c[1]) <= DESIGN_HALF
  return (
    <mesh
      position={[0, 0, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onPointerMove={e => {
        const c = toCell(e.point)
        onHover(inArea(c) ? c : null)
        if (drag.current) {
          if (drag.current.button === 0) onPlace(c)
          else onRemove(c)
        }
      }}
      onPointerDown={e => {
        const c = toCell(e.point)
        drag.current = { button: e.button }
        if (e.button === 0) onPlace(c)
        else if (e.button === 2) onRemove(c)
      }}
      onPointerUp={() => {
        drag.current = null
      }}
      onPointerLeave={() => {
        drag.current = null
        onHover(null)
      }}
    >
      <planeGeometry args={[DESIGN_HALF * 2 + 1, DESIGN_HALF * 2 + 1]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  )
}

function GhostPiece({
  hover,
  piece,
  rot,
  color,
  level,
  occupiedNow,
}: {
  hover: Cell | null
  piece: PieceType
  rot: number
  color: number
  level: number
  occupiedNow: Set<string>
}) {
  if (!hover) return null
  const def = getPieceDef(piece)
  if (!def) return null
  const occupied = occupiedNow.has(`${hover[0]},${hover[1]},${level}`)
  const Render = def.render
  return (
    <group position={[hover[0], level, hover[1]]}>
      <GhostGroup>
        <Render color={color} rot={rot} />
      </GhostGroup>
      <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.96, 0.96]} />
        <meshBasicMaterial
          color={occupied ? '#e8a13c' : '#7ddb8a'}
          transparent
          opacity={0.55}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function DesignerControls() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(7, 8, 9)
    camera.lookAt(0, 0.5, 0)
  }, [camera])
  return (
    <OrbitControls
      makeDefault
      enablePan={false}
      minDistance={4}
      maxDistance={30}
      maxPolarAngle={Math.PI / 2.1}
      target={[0, 0.8, 0]}
      mouseButtons={{
        LEFT: -1,
        MIDDLE: THREE.MOUSE.ROTATE,
        RIGHT: -1,
      }}
    />
  )
}
