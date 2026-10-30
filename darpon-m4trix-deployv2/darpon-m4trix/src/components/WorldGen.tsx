'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dices, Loader2, Mountain, Plus, Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchAuth } from '@/lib/http'
import { useWorld, nextId } from '@/lib/world-store'
import {
  generateWorld,
  GEN_KINDS,
  suggestedName,
  type GenKind,
  type GenSize,
} from '@/lib/worldgen'
import { encodeTerrain } from '@/lib/terrain'
import { sectionOf, useUI } from '@/lib/ui-store'

const SIZES: { id: GenSize; label: string; hint: string }[] = [
  { id: 's', label: 'Piccola', hint: 'quartiere' },
  { id: 'm', label: 'Media', hint: 'borgo' },
  { id: 'l', label: 'Grande', hint: 'città' },
  { id: 'xl', label: 'Enorme', hint: 'metropoli' },
]

export default function WorldGen() {
  const openProject = useWorld(s => s.openProject)
  const site = useUI(s => s.site)
  const section = sectionOf(site.sections, 'genera')
  const [kind, setKind] = useState<GenKind>('citta')
  const [size, setSize] = useState<GenSize>('m')
  const [density, setDensity] = useState(0.6)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 90000) + 1000)
  const [creating, setCreating] = useState(false)

  const preview = useMemo(
    () =>
      generateWorld({ kind, size, density, seed }),
    [kind, size, density, seed]
  )

  const create = async () => {
    setCreating(true)
    try {
      const result = generateWorld({ kind, size, density, seed })
      const name = suggestedName({ kind, size, density, seed })
      const objects = result.objects.map(o => ({ ...o, id: nextId() }))
      const terrain = encodeTerrain(result.terrain)
      const stateJson = JSON.stringify({
        objects,
        customAssets: [],
        ...(terrain ? { terrain } : {}),
      })

      const res = await fetchAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        project?: { id: string; createdAt: string; updatedAt: string }
        error?: string
      }
      if (!res.ok || !data.project) {
        throw new Error(data.error ?? 'Creazione non riuscita')
      }
      const p = data.project
      const patch = await fetchAuth(`/api/projects/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: stateJson }),
      })
      if (!patch.ok) throw new Error('Salvataggio del mondo non riuscito')

      openProject({
        id: p.id,
        name,
        state: stateJson,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      })
      toast.success('Mondo generato! Modificalo come vuoi 🌍')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore generazione')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="rounded-3xl bg-white/85 p-5 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-[var(--primary)]" />
          <h2 className="text-lg font-semibold">{section.title === 'Genera' ? 'Generatore di mondi' : section.title}</h2>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {section.subtitle ||
            <>Un intero mondo in un click: strade, case, mura e paesaggi generati
            con l&apos;algoritmo interno. Tutto resta modificabile con
            l&apos;editor, oggetto per oggetto.</>}
        </p>

        {/* tipo di mondo */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {GEN_KINDS.map(g => (
            <button
              key={g.id}
              onClick={() => setKind(g.id)}
              className={`rounded-2xl border p-3 text-left transition-all ${
                kind === g.id
                  ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                  : 'hover:bg-stone-50'
              }`}
            >
              <div className="text-2xl">{g.icon}</div>
              <div className="mt-1 text-sm font-semibold">{g.label}</div>
              <div className="mt-0.5 text-[11px] leading-tight text-stone-500">
                {g.desc}
              </div>
            </button>
          ))}
        </div>

        {/* dimensione */}
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Dimensione
          </p>
          <div className="mt-2 flex gap-2">
            {SIZES.map(s => (
              <button
                key={s.id}
                onClick={() => setSize(s.id)}
                className={`flex-1 rounded-xl border px-3 py-2 text-center transition-all ${
                  size === s.id
                    ? 'bg-[var(--primary-soft)] ring-2 ring-[var(--primary)]'
                    : 'hover:bg-stone-50'
                }`}
              >
                <div className="text-sm font-semibold">{s.label}</div>
                <div className="text-[10px] text-stone-500">{s.hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* densità */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
              Quanti edifici
            </p>
            <span className="text-xs font-medium text-stone-500">
              {Math.round(density * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={density}
            onChange={e => setDensity(Number(e.target.value))}
            className="mt-2 w-full accent-[var(--primary)]"
          />
        </div>

        {/* seed */}
        <div className="mt-4 flex items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Variante
          </p>
          <code className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-semibold">
            #{seed}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSeed(Math.floor(Math.random() * 90000) + 1000)}
          >
            <Dices className="mr-1 h-4 w-4" /> Altra variante
          </Button>
        </div>

        {/* anteprima statistiche */}
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-2xl bg-stone-50 p-3 text-center">
          <div>
            <div className="text-lg font-bold text-[var(--primary)]">
              {preview.stats.case}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              edifici
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-[var(--primary)]">
              {preview.stats.strade}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              strade
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-[var(--primary)]">
              {preview.stats.alberi}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              alberi
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-[var(--primary)]">
              {preview.stats.mura}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400">
              mura
            </div>
          </div>
        </div>

        {preview.terrain && (
          <p className="mt-3 flex items-center gap-1 text-[11px] text-stone-500">
            <Mountain className="h-3.5 w-3.5" /> Questo mondo ha anche colline e
            dislivelli scolpiti nel terreno.
          </p>
        )}

        <Button className="mt-4 w-full" onClick={create} disabled={creating}>
          {creating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sto generando…
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" /> Crea questo mondo
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
