'use client'

// ============================================================
// DARPX ENGINE — OUTLINER (v18)
// La lista gerarchica del mondo, in scala 1:1 su Unreal Engine:
// ricerca, icone per tipo, click per selezionare, occhietto per
// nascondere/mostrare in gioco, lucello per il blocco.
// ============================================================

import { useState } from 'react'
import { PREFABS } from '@/lib/engine3d/prefabs'
import type { RWorld } from '@/lib/engine3d/types'

export default function StudioOutliner({
  world,
  selectedId,
  onSelect,
  onPatchObj,
}: {
  world: RWorld
  selectedId: string | null
  onSelect: (id: string) => void
  onPatchObj: (id: string, fn: (o: RWorld['objects'][number]) => void) => void
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toLowerCase()

  const rows = [
    ...world.objects.map(o => ({
      id: o.id,
      kind: 'obj' as const,
      icon: o.prefab === 'glb' ? '🧍' : PREFABS[o.prefab]?.icon ?? '📦',
      name: o.name || PREFABS[o.prefab]?.name || (o.prefab === 'glb' ? 'Personaggio GLB' : o.prefab),
      hidden: !!o.hidden,
      locked: !!o.locked,
    })),
    ...world.lights.map(l => ({
      id: l.id,
      kind: 'light' as const,
      icon: l.kind === 'point' ? '💡' : '🔦',
      name: l.kind === 'point' ? 'Luce di punto' : 'Riflettore',
      hidden: false,
      locked: false,
    })),
  ].filter(r => !query || r.name.toLowerCase().includes(query))

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-black uppercase tracking-wider text-[var(--tx-faint)]">
          Outliner
        </p>
        <span className="text-[10px] text-[var(--tx-faint)]">{rows.length}</span>
      </div>
      <input
        value={q}
        onChange={e => setQ(e.target.value)}
        placeholder="🔎 Cerca oggetto…"
        className="h-7 w-full rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-xs text-[var(--tx)] outline-none focus:border-[var(--neon)]"
      />
      <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel-soft)]">
        {rows.length === 0 && (
          <p className="p-3 text-center text-[11px] text-[var(--tx-faint)]">
            {world.objects.length + world.lights.length === 0
              ? 'Mondo vuoto: piazza qualcosa dalla palette'
              : 'Nessun risultato'}
          </p>
        )}
        {rows.map(r => (
          <div
            key={r.id}
            className={`flex items-center gap-1.5 border-b border-[var(--line)] px-2 py-1 text-xs last:border-b-0 ${
              selectedId === r.id
                ? 'bg-[var(--primary-soft)] text-[var(--tx)]'
                : 'text-[var(--tx-dim)] hover:bg-[var(--panel)]'
            }`}
          >
            <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" onClick={() => onSelect(r.id)}>
              <span className="shrink-0">{r.icon}</span>
              <span className={`truncate ${r.hidden ? 'line-through opacity-50' : ''}`}>{r.name}</span>
              {r.locked && <span className="shrink-0 text-[10px]" title="Bloccato">🔒</span>}
            </button>
            {r.kind === 'obj' && (
              <button
                className="shrink-0 px-1 text-[12px] opacity-70 hover:opacity-100"
                title={r.hidden ? 'Mostra in gioco' : 'Nascondi in gioco (H con selezione)'}
                onClick={() => onPatchObj(r.id, o => { o.hidden = !o.hidden })}
              >
                {r.hidden ? '🙈' : '👁'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
