'use client'

// ============================================================
// REPARTO STRUTTURE della home: spazio separato da "I miei mondi"
// dove progettare case, torri e edifici pezzo per pezzo.
// Le strutture salvate restano nella libreria dell'account e
// vengono importate automaticamente in ogni mondo (barra oggetti).
// ============================================================

import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'
import {
  Library,
  Copy,
  Hammer,
  Loader2,
  Pencil,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  PIECE_DEFS,
  StructureModel,
  GhostGroup,
  getPieceDef,
  type PieceType,
  type StructurePiece,
} from '@/lib/assets'
import { PALETTE } from '@/lib/world-store'
import { useStructures } from '@/lib/structures-store'

const DESIGN_HALF = 4 // griglia 9x9 celle: -4..4
const MAX_LEVEL = 6

type Cell = [number, number]

export default function StructuresLab() {
  const structures = useStructures(s => s.structures)
  const loaded = useStructures(s => s.loaded)
  const load = useStructures(s => s.load)
  const addStructure = useStructures(s => s.add)
  const renameStructure = useStructures(s => s.rename)
  const duplicateStructure = useStructures(s => s.duplicate)
  const removeStructure = useStructures(s => s.remove)

  const [pieces, setPieces] = useState<StructurePiece[]>([])
  const [history, setHistory] = useState<StructurePiece[][]>([])
  const [piece, setPiece] = useState<PieceType>('pavimento')
  const [rot, setRot] = useState(0)
  const [color, setColor] = useState(1)
  const [level, setLevel] = useState(0)
  const [hover, setHover] = useState<Cell | null>(null)
  const [name, setName] = useState('La mia casa')
  const [saving, setSaving] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameName, setRenameName] = useState('')

  useEffect(() => {
    load()
  }, [load])

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
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.code === 'KeyR') setRot(r => (r + 1) % 4)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history, pieces])

  const save = () => {
    if (!pieces.length) {
      toast.error('Piazza almeno un pezzo prima di salvare')
      return
    }
    setSaving(true)
    try {
      const clean = name.trim() || 'Struttura'
      addStructure(clean, pieces.map(p => ({ ...p })))
      toast.success(`"${clean}" salvata nella libreria! Apri un mondo per piazzarla 🏗️`)
      setPieces([])
      setHistory([])
      setName('La mia casa')
    } finally {
      setSaving(false)
    }
  }

  const occupiedNow = useMemo(
    () => new Set(pieces.map(p => `${p.x},${p.z},${p.y}`)),
    [pieces]
  )

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mt-6"
    >
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black tracking-tight text-stone-800">
            <Hammer className="h-5 w-5 text-[var(--primary)]" />
            Reparto strutture
          </h2>
          <p className="text-sm text-stone-500">
            Progetta case, torri e fortificazioni <b>fuori</b> dai mondi. Le
            strutture salvate finiscono in libreria e le ritrovi pronte in
            ogni mondo, nella barra oggetti.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            className="h-9 w-48"
            placeholder="Nome della struttura"
          />
          <Button onClick={save} disabled={saving || !pieces.length} className="shadow-md">
            {saving ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Hammer className="mr-1 h-4 w-4" />
            )}
            Salva in libreria
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* designer 3D */}
        <div className="lg:col-span-2">
          <div className="relative h-[430px] overflow-hidden rounded-2xl bg-sky-100 ring-1 ring-black/5">
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
                Livello di costruzione: <b>{level}</b> · clic = piazza · clic
                destro = demolisci · R = ruota · Ctrl+Z = annulla
              </div>
            </div>
          </div>

          {/* controlli pezzi */}
          <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-stone-50 p-3 ring-1 ring-black/5">
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
            </div>
            <p className="text-[11px] text-stone-400">
              Consigli: pavimento al livello 0, poi muri, porte e finestre; il
              tetto sta bene a qualsiasi livello. Con i livelli alti costruisci
              torri su più piani.
            </p>
          </div>
        </div>

        {/* libreria strutture */}
        <div className="rounded-2xl border border-black/5 bg-white/70 p-3">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-stone-700">
            <Library className="h-4 w-4 text-[var(--primary)]" />
            Libreria ({structures.length})
          </h3>
          {!loaded ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-stone-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Carico...
            </div>
          ) : structures.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 px-3 py-8 text-center">
              <p className="text-3xl">🏗️</p>
              <p className="mt-2 text-sm font-medium text-stone-500">
                Nessuna struttura ancora
              </p>
              <p className="mt-1 text-xs text-stone-400">
                Costruisci qualcosa a sinistra e premi «Salva in libreria».
              </p>
            </div>
          ) : (
            <ol className="flex max-h-[560px] flex-col gap-1.5 overflow-y-auto pr-1">
              {structures.map(s => (
                <li
                  key={s.id}
                  className="rounded-xl border border-black/5 bg-white px-3 py-2"
                >
                  {renameId === s.id ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        value={renameName}
                        onChange={e => setRenameName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            renameStructure(s.id, renameName)
                            setRenameId(null)
                            toast.success('Struttura rinominata!')
                          }
                        }}
                        className="h-8"
                        autoFocus
                      />
                      <Button
                        size="sm"
                        className="h-8"
                        onClick={() => {
                          renameStructure(s.id, renameName)
                          setRenameId(null)
                          toast.success('Struttura rinominata!')
                        }}
                      >
                        Ok
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏗️</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-stone-800">
                          {s.name}
                        </p>
                        <p className="text-xs text-stone-400">
                          {s.pieces.length} pezzi ·{' '}
                          {new Date(s.createdAt).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-stone-400 hover:text-stone-700"
                        title="Rinomina"
                        onClick={() => {
                          setRenameId(s.id)
                          setRenameName(s.name)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-stone-400 hover:text-stone-700"
                        title="Duplica"
                        onClick={() => {
                          duplicateStructure(s.id)
                          toast.success('Duplicata!')
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-stone-400 hover:text-red-600"
                            title="Elimina"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Eliminare «{s.name}»?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              Sparirà dalla libreria. I mondi dove l&apos;hai
                              già piazzata non perdono le copie esistenti.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-red-600 hover:bg-red-700"
                              onClick={() => removeStructure(s.id)}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {structures.length > 0 && (
            <p className="mt-2 rounded-xl bg-[var(--primary-soft)] px-3 py-2 text-[11px] font-medium text-[var(--primary-strong)]">
              💡 Apri un mondo: le strutture della libreria compaiono da sole
              nella barra oggetti, pronte da piazzare.
            </p>
          )}
        </div>
      </div>
    </motion.section>
  )
}

// ============================================================
// Scena 3D del designer (identica a quella del vecchio dialog)
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
