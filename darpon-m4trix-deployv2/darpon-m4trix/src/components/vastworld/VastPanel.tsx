'use client'

// ============================================================
// darpon.m4trix — V13 PANNELLO MONDO VASTO
// La "funzione gigante": genera un mondo INFINITO di sola natura
// (montagne, colline, alberi, laghi) con opzioni realistiche.
// Vivre dentro l'editor dei Mondi 3D: un bottone, un dialogo,
// e il rettangolo sparisci per sempre.
// ============================================================

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Globe2, Trash2 } from 'lucide-react'
import { useWorld } from '@/lib/world-store'
import {
  VAST_DEFAULT, VAST_TOD_LABEL, vastSpawn,
  type VastConfig, type VastTod,
} from '@/lib/vastworld'

const SLIDERS: { key: 'mountains' | 'hills' | 'trees' | 'water'; label: string; min: string; max: string }[] = [
  { key: 'mountains', label: '🏔 Montagne', min: 'pianure', max: 'Himalaya' },
  { key: 'hills', label: '⛰ Colline', min: 'piatte', max: 'mosse' },
  { key: 'trees', label: '🌲 Foreste', min: 'radure', max: 'giungla' },
  { key: 'water', label: '💧 Acqua', min: 'arida', max: 'arcipelago' },
]

const QUALITY: { id: NonNullable<VastConfig['quality']>; label: string; desc: string }[] = [
  { id: 'basso', label: 'Bassa', desc: 'PC datati · ~190 m visibili' },
  { id: 'medio', label: 'Media', desc: 'consigliata · ~260 m visibili' },
  { id: 'alto', label: 'Alta', desc: 'PC potenti · ~350 m visibili' },
]

export default function VastPanel() {
  const vast = useWorld(s => s.vast)
  const setVast = useWorld(s => s.setVast)
  const [open, setOpen] = useState(false)
  const [cfg, setCfg] = useState<VastConfig>(vast ?? VAST_DEFAULT)

  const generate = () => {
    setVast(cfg)
    setOpen(false)
    const sp = vastSpawn(cfg)
    toast.success(
      `🌍 Mondo vasto generato! ${Math.round(cfg.mountains * 100)}% montagne · seed ${cfg.seed}. Cammina: il mondo non finisce più!`
    )
    // porta il giocatore su un punto asciutto
    window.dispatchEvent(new CustomEvent('vast-spawn', { detail: sp }))
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant={vast ? 'default' : 'ghost'}
            size="sm"
            title={vast ? 'Mondo Vasto attivo: clicca per modificare le opzioni' : 'Genera un MONDO VASTO infinito di montagne, colline e foreste'}
          >
            <Globe2 className="h-4 w-4" />
            <span className="hidden lg:inline">Mondo Vasto</span>
            {vast && <span className="ml-1 h-2 w-2 rounded-full bg-emerald-400" />}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[var(--tx)]">
              🌍 Mondo Vasto — natura infinita
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-[var(--tx-dim)]">
            Genera un mondo <b>senza confini</b>: montagne con creste realistiche, colline
            morbide, foreste di pini querce e betulle, laghi e mare. Il terreno nasce dal
            <b> seed</b> mentre cammini: pesa 0 byte nel database e non finisce mai.
            Le strutture che hai piazzato restano al loro posto, sopra il nuovo paesaggio.
          </p>

          <div className="flex flex-col gap-3">
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Seed del mondo</span>
                <input
                  type="number"
                  value={cfg.seed}
                  onChange={e => setCfg({ ...cfg, seed: Math.abs(Math.floor(Number(e.target.value) || 0)) })}
                  className="h-8 rounded-md border border-[var(--line)] bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)]"
                />
              </label>
              <Button
                variant="outline" size="sm" className="cp-btn h-8"
                onClick={() => setCfg({ ...cfg, seed: Math.floor(Math.random() * 1e9) })}
              >
                🎲 Casuale
              </Button>
            </div>

            {SLIDERS.map(s => (
              <label key={s.key} className="flex flex-col gap-1">
                <span className="flex justify-between text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
                  <span>{s.label}</span>
                  <span>{Math.round(cfg[s.key] * 100)}%</span>
                </span>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={cfg[s.key]}
                  onChange={e => setCfg({ ...cfg, [s.key]: Number(e.target.value) })}
                  className="accent-[var(--neon)]"
                />
                <span className="flex justify-between text-[9px] text-[var(--tx-faint)]">
                  <span>{s.min}</span><span>{s.max}</span>
                </span>
              </label>
            ))}

            <div>
              <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Ora del giorno</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {(Object.keys(VAST_TOD_LABEL) as VastTod[]).map(t => (
                  <button
                    key={t}
                    className={`cp-chip ${cfg.tod === t ? 'cp-chip-active' : ''}`}
                    onClick={() => setCfg({ ...cfg, tod: t })}
                  >
                    {VAST_TOD_LABEL[t]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Qualità grafica</span>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {QUALITY.map(q => (
                  <button
                    key={q.id}
                    className={`rounded-lg border p-2 text-left text-xs transition-colors ${
                      cfg.quality === q.id
                        ? 'border-[var(--neon)] bg-[var(--primary-soft)] text-[var(--tx)]'
                        : 'border-[var(--line)] text-[var(--tx-dim)] hover:bg-[var(--panel-hover)]'
                    }`}
                    onClick={() => setCfg({ ...cfg, quality: q.id })}
                  >
                    <span className="block font-bold">{q.label}</span>
                    <span className="block text-[9px] leading-tight opacity-80">{q.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            {vast && (
              <Button
                variant="outline" className="cp-btn text-red-400"
                onClick={() => {
                  setVast(null)
                  setOpen(false)
                  toast.info('Mondo vasto rimosso: torni al rettangolo classico')
                }}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Rimuovi mondo vasto
              </Button>
            )}
            <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={generate}>
              🌍 Genera mondo vasto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
