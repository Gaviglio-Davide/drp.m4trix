'use client'

// ============================================================
// darpon.m4trix — V15 ANIM EDITORS
// Il reparto «Animazioni & Interazioni» del Game Studio:
//   🔄 Oggetti · 🚶 Nemici · 🗣 PNG · 💡 Guida
// Tutto viene salvato dentro settings del progetto (autosave DB)
// e applicato DAVVERO nei giochi, sia 2D che 3D Mondo Vasto:
//   - monete/bottini che ruotano e fluttuano
//   - IA dei nemici: normale, sempre all'attacco, pacati
//   - PNG che camminano per il mondo
//   - velocità generale delle animazioni
// ============================================================

import { useState } from 'react'
import { X } from 'lucide-react'
import type { GameProject } from '@/lib/game2d/types'

type TabId = 'oggetti' | 'nemici' | 'png' | 'guida'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'oggetti', label: 'Oggetti', icon: '🔄' },
  { id: 'nemici', label: 'Nemici', icon: '🚶' },
  { id: 'png', label: 'PNG', icon: '🗣️' },
  { id: 'guida', label: 'Guida', icon: '💡' },
]

type Props = {
  project: GameProject
  mutate: (fn: (p: GameProject) => void) => void
  onClose: () => void
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string
  hint?: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors ${
        value
          ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
          : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
      }`}
    >
      <span className="min-w-0">
        <span className="block text-sm font-bold text-[var(--tx)]">{label}</span>
        {hint && (
          <span className="block text-[11px] leading-tight text-[var(--tx-dim)]">{hint}</span>
        )}
      </span>
      <span
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          value ? 'bg-[var(--neon)]' : 'bg-[var(--line-strong)]'
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  )
}

export default function AnimEditors({ project, mutate, onClose }: Props) {
  const [tab, setTab] = useState<TabId>('oggetti')
  const s = project.settings

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* intestazione */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="neon-text font-[family-name:var(--font-display)] text-lg font-black tracking-widest uppercase">
            🎬 Animazioni &amp; Interazioni
          </h2>
          <button
            onClick={onClose}
            className="cp-chip hover:text-[var(--neon)]"
            title="Chiudi"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-xs text-[var(--tx-dim)]">
          Le regole valgono per TUTTO il gioco e si vedono premendo ▶ GIOCA.
          Tutto si salva da solo.
        </p>

        {/* tab */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`cp-chip ${tab === t.id ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ---- TAB OGGETTI ---- */}
        {tab === 'oggetti' && (
          <div className="flex flex-col gap-2.5">
            <ToggleRow
              label="🔄 Monete e bottini ruotano"
              hint="Nei giochi 3D girano su sé stessi come veri tesori"
              value={s.animSpin !== false}
              onChange={v => mutate(p => { p.settings.animSpin = v })}
            />
            <ToggleRow
              label="🎈 Oggetti che fluttuano"
              hint="Monete, pozioni e chiavi levitano su e giù (2D e 3D)"
              value={s.animBob === true}
              onChange={v => mutate(p => { p.settings.animBob = v })}
            />
            <div className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-[var(--tx)]">⏱ Velocità animazioni</span>
                <span className="cp-chip">{(s.animSpeed ?? 1).toFixed(1)}×</span>
              </div>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={s.animSpeed ?? 1}
                onChange={e =>
                  mutate(p => { p.settings.animSpeed = Number(e.target.value) })
                }
                className="mt-2 w-full accent-[var(--neon)]"
              />
              <p className="mt-1 text-[11px] text-[var(--tx-dim)]">
                Rallenta (0.5×) o accelera (2×) TUTTE le animazioni del gioco.
              </p>
            </div>
          </div>
        )}

        {/* ---- TAB NEMICI ---- */}
        {tab === 'nemici' && (
          <div className="flex flex-col gap-2.5">
            {(
              [
                {
                  id: 'normale',
                  icon: '⚔️',
                  t: 'Normale',
                  d: 'Pattugliano il loro posto e ti inseguono solo se ti avvicini',
                },
                {
                  id: 'aggressivi',
                  icon: '🔥',
                  t: 'Sempre all\u2019attacco',
                  d: 'Ti inseguono da qualsiasi distanza, senza pietà',
                },
                {
                  id: 'fermi',
                  icon: '🕊️',
                  t: 'Pacati (fermi)',
                  d: 'Restano fermi e si difendono solo se li tocchi. Le torrette sparano comunque',
                },
              ] as const
            ).map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => mutate(p => { p.settings.enemyMode = m.id })}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  (s.enemyMode ?? 'normale') === m.id
                    ? 'border-[var(--neon)] bg-[var(--primary-soft)]'
                    : 'border-[var(--line)] hover:bg-[var(--panel-hover)]'
                }`}
              >
                <span className="block text-sm font-bold text-[var(--tx)]">
                  {m.icon} {m.t}
                </span>
                <span className="block text-[11px] leading-tight text-[var(--tx-dim)]">
                  {m.d}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* ---- TAB PNG ---- */}
        {tab === 'png' && (
          <div className="flex flex-col gap-2.5">
            <ToggleRow
              label="🗣️ I PNG camminano per il mondo"
              hint="Villaggi vivi: i personaggi vagano attorno al loro posto (2D e 3D)"
              value={s.npcWalk !== false}
              onChange={v => mutate(p => { p.settings.npcWalk = v })}
            />
            <div className="rounded-lg border border-[var(--line)] p-3 text-[12px] leading-relaxed text-[var(--tx-dim)]">
              💡 I PNG continuano a parlare quando ti avvicini (o premi{' '}
              <b className="text-[var(--tx)]">E</b>). Per i PERCORSI precisi
              (strade e vie) usa l&apos;hub <b className="text-[var(--tx)]">📖 RPG → Percorsi PNG</b>.
            </div>
          </div>
        )}

        {/* ---- TAB GUIDA ---- */}
        {tab === 'guida' && (
          <div className="flex flex-col gap-2 rounded-lg border border-[var(--line)] p-3 text-[12px] leading-relaxed text-[var(--tx-dim)]">
            <p className="font-bold text-[var(--tx)]">Come funziona il reparto</p>
            <p>
              • <b className="text-[var(--tx)]">Oggetti</b>: rotazione e fluttuazione dei
              raccogliibili, e la velocità di tutte le animazioni.
            </p>
            <p>
              • <b className="text-[var(--tx)]">Nemici</b>: scegli come si muovono. «Aggressivi»
              rende il gioco difficile, «Pacati» lo trasforma in un&apos;esplorazione tranquilla.
            </p>
            <p>
              • <b className="text-[var(--tx)]">PNG</b>: i personaggi camminano e non bloccano
              più il passaggio.
            </p>
            <p>
              • Tutto è salvato nel gioco: puoi avere regole diverse in ogni tuo gioco.
            </p>
            <p className="text-[var(--neon)]">
              ▶ Premi GIOCA per vedere subito le novità in azione!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
