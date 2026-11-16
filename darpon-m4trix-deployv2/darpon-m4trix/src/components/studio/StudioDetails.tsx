'use client'

// ============================================================
// DARPX ENGINE — DETAILS PANEL (v18)
// L'ispettore proprietà del Game Studio, in scala 1:1 sullo
// stile di Unreal Engine (Details) e Godot (Inspector):
//  - intestazione con nome, visibilità, blocco, duplica, elimina
//  - ricerca proprietà («Filtra»)
//  - categorie collassabili: Transform, Materiale PBR, Rendering,
//    Fisica, Animazione, Luce, Note
//  - numerici TRASCINABILI (drag orizzontale come in Unreal),
//    con colori assi X rosso / Y verde / Z blu e reset per riga
// ============================================================

import { useRef, useState } from 'react'
import * as THREE from 'three'
import { PREFABS } from '@/lib/engine3d/prefabs'
import type { RLightObj, RObject } from '@/lib/engine3d/types'

type Vec3 = [number, number, number]

const AXIS_COLOR: Record<string, string> = {
  X: '#ff6b6b',
  Y: '#7ce38b',
  Z: '#6bb7ff',
}

const r3 = (v: number) => Math.round(v * 1000) / 1000

// ---------------- numerico trascinabile (stile Unreal) ----------------

function DragNum({
  value,
  onChange,
  step = 0.1,
  min,
  max,
  axis,
  onCommitStart,
}: {
  value: number
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  axis?: string // X / Y / Z → colore dell'asse
  onCommitStart?: () => void // chiamato al primo trascinamento (per l'undo)
}) {
  const [txt, setTxt] = useState<string | null>(null)
  const drag = useRef<{ sx: number; sv: number } | null>(null)
  const didDrag = useRef(false)
  const started = useRef(false)

  const clamp = (v: number) => {
    if (min !== undefined) v = Math.max(min, v)
    if (max !== undefined) v = Math.min(max, v)
    return v
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={txt ?? String(r3(value))}
      onChange={e => {
        setTxt(e.target.value)
        const v = parseFloat(e.target.value.replace(',', '.'))
        if (!Number.isNaN(v)) onChange(clamp(v))
      }}
      onFocus={() => setTxt(String(r3(value)))}
      onBlur={() => setTxt(null)}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') {
          setTxt(null)
          ;(e.target as HTMLInputElement).blur()
        }
      }}
      onPointerDown={e => {
        // trascina SOLO se il campo non ha il focus (altrimenti è selezione testo)
        if (document.activeElement === e.currentTarget || txt !== null) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { sx: e.clientX, sv: value }
        didDrag.current = false
      }}
      onPointerMove={e => {
        if (!drag.current) return
        const dx = e.clientX - drag.current.sx
        if (!didDrag.current && Math.abs(dx) < 3) return
        if (!didDrag.current) {
          didDrag.current = true
          if (!started.current) {
            started.current = true
            onCommitStart?.()
          }
        }
        onChange(clamp(drag.current.sv + dx * step))
      }}
      onPointerUp={e => {
        if (drag.current && !didDrag.current) {
          // click semplice → metti il cursore nel campo per scrivere
          e.currentTarget.focus()
          setTxt(String(r3(value)))
        }
        drag.current = null
        didDrag.current = false
        started.current = false
        try {
          e.currentTarget.releasePointerCapture(e.pointerId)
        } catch {
          /* già rilasciato */
        }
      }}
      className="h-7 w-full min-w-0 cursor-ew-resize rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-1.5 text-left font-mono text-xs text-[var(--tx)] outline-none select-none focus:cursor-text focus:border-[var(--neon)]"
      style={axis ? { boxShadow: `inset 3px 0 0 ${AXIS_COLOR[axis] ?? '#888'}` } : undefined}
      title="Trascina orizzontale per cambiare · click per scrivere"
    />
  )
}

// ---------------- riga di 3 assi + reset ----------------

function VecRow({
  label,
  value,
  onChange,
  step = 0.1,
  min,
  max,
  onReset,
  onCommitStart,
}: {
  label: string // Location / Rotation / Scale
  value: Vec3
  onChange: (v: Vec3) => void
  step?: number
  min?: number
  max?: number
  onReset: () => void
  onCommitStart?: () => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-faint)]">{label}</span>
        <button
          onClick={onReset}
          title={`Resetta ${label}`}
          className="text-[11px] text-[var(--tx-faint)] hover:text-[var(--neon)]"
        >
          ↺
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {(['X', 'Y', 'Z'] as const).map((ax, i) => (
          <label key={ax} className="flex items-center gap-0.5">
            <span
              className="w-2.5 shrink-0 text-center text-[10px] font-black"
              style={{ color: AXIS_COLOR[ax] }}
            >
              {ax}
            </span>
            <DragNum
              value={value[i]}
              step={step}
              min={min}
              max={max}
              axis={ax}
              onCommitStart={onCommitStart}
              onChange={v => {
                const next = [...value] as Vec3
                next[i] = v
                onChange(next)
              }}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

// ---------------- categoria collassabile + filtri di ricerca ----------------

function Cat({
  title,
  badge,
  labels,
  query,
  open,
  onToggle,
  children,
}: {
  title: string
  badge?: string
  labels: string[] // etichette dei campi, per la ricerca
  query: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  const q = query.trim().toLowerCase()
  const hit = !q || labels.some(l => l.toLowerCase().includes(q))
  if (!hit) return null
  return (
    <div className="border-t border-[var(--line)] first:border-t-0">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 py-2 text-left"
      >
        <span className={`text-[10px] text-[var(--tx-faint)] transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
        <span className="flex-1 text-[11px] font-black uppercase tracking-wider text-[var(--tx-dim)]">
          {title}
        </span>
        {badge && <span className="rounded bg-[var(--primary-soft)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--tx-dim)]">{badge}</span>}
      </button>
      {open && <div className="flex flex-col gap-2.5 pb-3">{children}</div>}
    </div>
  )
}

function BoolRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between text-[11px] text-[var(--tx-dim)]">
      {label}
      <input
        type="checkbox"
        checked={value}
        onChange={e => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--neon)]"
      />
    </label>
  )
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center justify-between text-[11px] text-[var(--tx-dim)]">
      {label}
      <input
        type="color"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="h-7 w-14 cursor-pointer rounded border border-[var(--line)] bg-transparent"
      />
    </label>
  )
}

function SlideRow({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  return (
    <label className="block">
      <span className="mb-0.5 flex justify-between text-[11px] text-[var(--tx-dim)]">
        {label}
        <span className="font-mono text-[var(--tx)]">{r3(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[var(--line)] accent-[var(--neon)]"
      />
    </label>
  )
}

// ============================================================
// PANNELLO PRINCIPALE
// ============================================================

export default function StudioDetails({
  obj,
  light,
  onPatchObj,
  onPatchLight,
  onDuplicate,
  onDelete,
  onFocus,
}: {
  obj: RObject | null
  light: RLightObj | null
  onPatchObj: (fn: (o: RObject) => void) => void
  onPatchLight: (fn: (l: RLightObj) => void) => void
  onDuplicate: () => void
  onDelete: () => void
  onFocus: () => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Record<string, boolean>>({
    transform: true,
    material: true,
    render: false,
    fisica: false,
    anim: false,
    luce: true,
    note: false,
  })
  const toggle = (k: string) => setOpen(o => ({ ...o, [k]: !o[k] }))
  const [uniformScale, setUniformScale] = useState(false)

  const glb = !!obj && obj.prefab === 'glb' && !!obj.url
  const def = obj ? PREFABS[obj.prefab] : null
  const title = obj
    ? obj.name || def?.name || obj.prefab
    : light
      ? light.kind === 'point'
        ? 'Luce di punto'
        : 'Riflettore (Spot)'
      : ''

  // nulla selezionato: pannello vuoto stile Unreal
  if (!obj && !light) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
        <span className="text-3xl opacity-40">🎯</span>
        <p className="text-sm font-bold text-[var(--tx-dim)]">Nessuna selezione</p>
        <p className="max-w-[220px] text-xs text-[var(--tx-faint)]">
          Clicca un oggetto nella scena o nell&apos;Outliner per aprire tutte le sue
          proprietà qui, come nel Details di Unreal.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* ---------- intestazione ---------- */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-base">{obj ? def?.icon ?? (glb ? '🧍' : '📦') : light?.kind === 'point' ? '💡' : '🔦'}</span>
          {obj ? (
            <input
              value={obj.name ?? ''}
              onChange={e => onPatchObj(o => { o.name = e.target.value })}
              placeholder={def?.name ?? obj.prefab}
              className="h-7 min-w-0 flex-1 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm font-bold text-[var(--tx)] outline-none focus:border-[var(--neon)]"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--tx)]">{title}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {obj && (
            <>
              <button
                className={`cp-chip text-[11px] ${obj.hidden ? 'text-amber-400' : ''}`}
                title={obj.hidden ? 'Nascosto in gioco: clicca per mostrarlo' : 'Nascondi in modalità gioco'}
                onClick={() => onPatchObj(o => { o.hidden = !o.hidden })}
              >
                {obj.hidden ? '🙈 nascosto' : '👁 visibile'}
              </button>
              <button
                className={`cp-chip text-[11px] ${obj.locked ? 'text-sky-400' : ''}`}
                title={obj.locked ? 'Bloccato: il gizmo non lo muove' : 'Blocca: il gizmo non lo muoverà'}
                onClick={() => onPatchObj(o => { o.locked = !o.locked })}
              >
                {obj.locked ? '🔒 bloccato' : '🔓 libero'}
              </button>
              <button className="cp-chip text-[11px]" title="Duplica (CTRL+D)" onClick={onDuplicate}>⧉ duplica</button>
            </>
          )}
          <button className="cp-chip text-[11px]" title="Inquadra con la camera (F)" onClick={onFocus}>🎯 inquadra</button>
          <button
            className="cp-chip text-[11px] text-red-400"
            title="Elimina (CANC)"
            onClick={onDelete}
          >
            🗑 elimina
          </button>
        </div>
        <p className="font-mono text-[9px] text-[var(--tx-faint)]">
          {obj ? obj.prefab === 'glb' ? `glb · ${obj.url?.split('/').pop()}` : `prefab · ${obj.prefab}` : light?.id} ·{' '}
          {(obj ? obj.id : light?.id ?? '—').slice(0, 8)}
        </p>
      </div>

      {/* ---------- ricerca ---------- */}
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="🔎 Filtra le proprietà…"
        className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
      />

      {/* ---------- categorie ---------- */}
      <div className="flex flex-col">
        {/* TRANSFORM */}
        {obj && (
          <Cat title="Transform" labels={['location', 'rotation', 'scale', 'posizione', 'rotazione', 'scala', 'transform']} query={query} open={open.transform} onToggle={() => toggle('transform')}>
            <VecRow
              label="Location"
              value={obj.p}
              step={0.1}
              onCommitStart={() => onPatchObj(() => {})}
              onChange={v => onPatchObj(o => { o.p = v })}
              onReset={() => onPatchObj(o => { o.p = [0, 0, 0] })}
            />
            <VecRow
              label="Rotation (gradi)"
              value={obj.r}
              step={1}
              onCommitStart={() => onPatchObj(() => {})}
              onChange={v => onPatchObj(o => { o.r = v })}
              onReset={() => onPatchObj(o => { o.r = [0, 0, 0] })}
            />
            <VecRow
              label="Scale"
              value={obj.s}
              step={0.05}
              min={0.01}
              onCommitStart={() => onPatchObj(() => {})}
              onChange={v => {
                if (uniformScale) {
                  const d = v[2] !== obj.s[2] ? v[2] : v[0] !== obj.s[0] ? v[0] : v[1]
                  onPatchObj(o => { o.s = [d, d, d] })
                } else {
                  onPatchObj(o => { o.s = v })
                }
              }}
              onReset={() => onPatchObj(o => { o.s = [1, 1, 1] })}
            />
            <BoolRow label="Scala uniforme (link assi)" value={uniformScale} onChange={setUniformScale} />
            {obj.locked && (
              <p className="rounded-md bg-sky-500/10 px-2 py-1 text-[10px] text-sky-400">
                🔒 Oggetto bloccato: sbloccalo dall&apos;intestazione per muoverlo col gizmo.
              </p>
            )}
          </Cat>
        )}

        {light && (
          <Cat title="Transform" labels={['location', 'posizione', 'transform']} query={query} open={open.transform} onToggle={() => toggle('transform')}>
            <VecRow
              label="Location"
              value={light.p}
              step={0.25}
              onChange={v => onPatchLight(l => { l.p = v })}
              onReset={() => onPatchLight(l => { l.p = [0, 2, 0] })}
            />
          </Cat>
        )}

        {/* MATERIALE PBR (solo prefab, non GLB) */}
        {obj && !glb && (
          <Cat title="Materiale PBR" labels={['colore', 'colore', 'roughness', 'rugosità', 'metallicità', 'metal', 'emissivo', 'glow', 'materiale']} query={query} open={open.material} onToggle={() => toggle('material')}>
            <ColorRow label="Colore" value={obj.mat?.color ?? '#ffffff'} onChange={v => onPatchObj(o => { o.mat = { ...o.mat, color: v } })} />
            <SlideRow label="Rugosità (Roughness)" value={obj.mat?.rough ?? 0.5} onChange={v => onPatchObj(o => { o.mat = { ...o.mat, rough: v } })} />
            <SlideRow label="Metallicità (Metallic)" value={obj.mat?.metal ?? 0.1} onChange={v => onPatchObj(o => { o.mat = { ...o.mat, metal: v } })} />
            <ColorRow label="Emissivo (glow)" value={obj.mat?.emissive ?? '#000000'} onChange={v => onPatchObj(o => { o.mat = { ...o.mat, emissive: v } })} />
            {(obj.mat?.emissive && obj.mat.emissive !== '#000000') ? (
              <SlideRow label="Intensità glow" value={obj.mat?.eInt ?? 1} min={0} max={4} step={0.05} onChange={v => onPatchObj(o => { o.mat = { ...o.mat, eInt: v } })} />
            ) : null}
            {obj.mat && (
              <button className="cp-chip w-fit text-[10px] hover:text-[var(--neon)]" onClick={() => onPatchObj(o => { o.mat = undefined })}>
                ↺ materiale originale
              </button>
            )}
          </Cat>
        )}

        {/* ANIMAZIONE (solo GLB) */}
        {glb && obj && (
          <Cat title="Animazione" labels={['clip', 'animazione', 'velocità', 'speed', 'anim']} query={query} open={open.anim} onToggle={() => toggle('anim')}>
            <label className="flex items-center gap-1 text-[11px] text-[var(--tx-dim)]">
              <span className="w-16 shrink-0">Clip n°</span>
              <DragNum
                value={obj.anim ?? 0}
                step={1}
                min={0}
                max={12}
                onChange={v => onPatchObj(o => { o.anim = Math.max(0, Math.round(v)) })}
              />
            </label>
            <SlideRow label="Velocità animazione" value={obj.animSpeed ?? 1} min={0} max={3} step={0.05} onChange={v => onPatchObj(o => { o.animSpeed = v })} />
            <p className="text-[10px] leading-relaxed text-[var(--tx-faint)]">
              0 = la prima animazione del modello. Nei Cyber Samurai la clip
              giusta è sempre la 0. Velocità 0 = animazione ferma.
            </p>
          </Cat>
        )}

        {/* RENDERING */}
        {obj && (
          <Cat title="Rendering" labels={['visibilità', 'hidden', 'hidden', 'visibile', 'nascosto', 'render']} query={query} open={open.render} onToggle={() => toggle('render')}>
            <BoolRow
              label="Visibile in modalità GIOCO"
              value={!obj.hidden}
              onChange={v => onPatchObj(o => { o.hidden = !v })}
            />
            <p className="text-[10px] leading-relaxed text-[var(--tx-faint)]">
              Gli oggetti nascosti restano visibili nell&apos;EDITOR (per ritrovarli
              con l&apos;Outliner) ma scompaiono quando si preme ▶ PROVA.
            </p>
          </Cat>
        )}

        {/* FISICA */}
        {obj && (
          <Cat title="Fisica" labels={['collisione', 'collide', 'attraversabile', 'fisica', 'physics']} query={query} open={open.fisica} onToggle={() => toggle('fisica')}>
            <BoolRow
              label="Collisione (il giocatore ci urta)"
              value={!obj.noCollide}
              onChange={v => onPatchObj(o => { o.noCollide = !v })}
            />
            <BoolRow
              label="Bloccato (gizmo disattivato)"
              value={!!obj.locked}
              onChange={v => onPatchObj(o => { o.locked = v })}
            />
          </Cat>
        )}

        {/* LUCE */}
        {light && (
          <Cat title="Luce" labels={['colore', 'intensità', 'distanza', 'angolo', 'spot', 'luce']} query={query} open={open.luce} onToggle={() => toggle('luce')}>
            <ColorRow label="Colore" value={light.color} onChange={v => onPatchLight(l => { l.color = v })} />
            <SlideRow label="Intensità" value={light.intensity} min={0} max={60} step={0.5} onChange={v => onPatchLight(l => { l.intensity = v })} />
            <SlideRow label="Raggio (Distance)" value={light.distance} min={1} max={60} step={0.5} onChange={v => onPatchLight(l => { l.distance = v })} />
            {light.kind === 'spot' && (
              <SlideRow label="Angolo cono (Spot Angle)" value={light.angle ?? 0.7} min={0.1} max={1.5} step={0.01} onChange={v => onPatchLight(l => { l.angle = v })} />
            )}
          </Cat>
        )}

        {/* NOTE / TAG */}
        {obj && (
          <Cat title="Note & Tag" labels={['nota', 'tag', 'etichetta', 'descrizione', 'note']} query={query} open={open.note} onToggle={() => toggle('note')}>
            <textarea
              value={obj.note ?? ''}
              onChange={e => onPatchObj(o => { o.note = e.target.value })}
              rows={3}
              placeholder="Es. « porta della taverna · magica · level 2 »"
              className="w-full rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 py-1.5 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
            />
          </Cat>
        )}
      </div>
    </div>
  )
}

/** helper per lo snap usato dallo studio: arrotonda a 1/4 di metro */
export function snapVec(v: Vec3, on: boolean): Vec3 {
  return on ? ([Math.round(v[0] * 4) / 4, Math.round(v[1] * 4) / 4, Math.round(v[2] * 4) / 4] as Vec3) : v
}

/** posizione mondiale di un gruppo (per l'inquadratura con F) */
export function worldPosOf(g: THREE.Object3D | null): THREE.Vector3 | null {
  if (!g) return null
  const p = new THREE.Vector3()
  g.getWorldPosition(p)
  return p
}
