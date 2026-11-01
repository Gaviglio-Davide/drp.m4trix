'use client'

// ============================================================
// REPARTO: CREA DA SCRIPT — il gioco nasce da una sceneggiatura.
// 1) l'utente scrive (o incolla) l'idea del gioco
// 2) il parser italiano rileva: ambientazione, nemici, arma,
//    obiettivo, dimensione, difficoltà, protagonista, titolo
// 3) la scheda di dettaglio è MODIFICABILE (più domande, non
//    modelli in 2 secondi) e poi si genera il gioco giocabile
// 4) lo stesso script con seed diverso = gioco diverso
// ============================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Sparkles, Wand2 } from 'lucide-react'
import { analyzeScript, type ScriptAnalysis } from '@/lib/gamesmith/analyze'
import { generateGame } from '@/lib/gamesmith/generate'
import { createGame, saveGame, type GameMeta } from '@/lib/game2d/persist'
import type { EntityKind, Objective, PaletteId } from '@/lib/game2d/types'
import { PALETTES } from '@/lib/game2d/types'
import GamePlayer from '@/components/studio/GamePlayer'
import { useUI } from '@/lib/ui-store'
import { sectionOf } from '@/lib/ui-store'

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: '◆ Esempio cyber',
    text: `Il gioco si chiama "Neon Blood". Il protagonista si chiama Kaya, un cacciatore di taglie nei sotterranei di Nova City. Ci sono droni e soldati del sindacato ovunque, e torrette automatiche nei cortili. Arma: blaster al plasma. Obiettivo: recuperare le chiavi e fuggire dal portale. Difficile, mappa grande.`,
  },
  {
    label: '◆ Esempio fantasy',
    text: `Il gioco si chiama "Il Sigillo Rubato". Il protagonista si chiama Bran il Rosso. Un drago ha occupato il castello: trova e sconfiggi il boss. Ci sono orchi, guardiani neri e golem di pietra nelle cripte. Sono armato di spada leggendaria. Mappa grande, difficoltà normale, tanti nemici.`,
  },
  {
    label: '◆ Esempio horror',
    text: `Il gioco si chiama "Settore 13". Il protagonista si chiama Vera, una sopravvissuta del laboratorio. Zombie infetti in un bunker buio come mansion abbandonata. Poche guardie ma difficile. Obiettivo: recupera le chiavi e raggiungi il portale. Arma: pistola.`,
  },
]

const GEN_STEPS = [
  'Analizzo la sceneggiatura…',
  'Disegno la mappa e i percorsi…',
  'Semo nemici, boss e torrette…',
  'Scrivo i dialoghi del gioco…',
  'Compilo il gioco giocabile…',
]

const ENEMY_OPTIONS: { kind: EntityKind; label: string }[] = [
  { kind: 'drone', label: 'Droni' },
  { kind: 'soldato', label: 'Soldati' },
  { kind: 'zombie', label: 'Zombie' },
  { kind: 'slime', label: 'Slime' },
  { kind: 'guardiano', label: 'Guardiani' },
  { kind: 'golem', label: 'Golem' },
  { kind: 'ratto', label: 'Ratti' },
  { kind: 'turret', label: 'Torrette' },
]

export default function CreaDaScript() {
  const site = useUI(s => s.site)
  const sec = sectionOf(site.sections, 'creagame')
  const [script, setScript] = useState('')
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null)
  const [cfg, setCfg] = useState<ScriptAnalysis | null>(null)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [step, setStep] = useState(-1) // -1 = idle, 0..n in corso
  const [result, setResult] = useState<GameMeta | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)

  const run = async (newSeed: boolean) => {
    if (!cfg || busy) return
    setBusy(true)
    if (newSeed) {
      const s = Math.floor(Math.random() * 1e9)
      setSeed(s)
      var usedSeed = s
    } else {
      var usedSeed = seed
    }
    setResult(null)
    for (let i = 0; i < GEN_STEPS.length; i++) {
      setStep(i)
      await new Promise(res => setTimeout(res, 420))
    }
    try {
      const game = generateGame(cfg, usedSeed)
      let meta: GameMeta
      if (result) {
        meta = await saveGame(result.id, game)
      } else {
        meta = await createGame(game.title, game)
      }
      setResult(meta)
      setStep(-1)
      toast.success('Gioco compilato! Premi GIOCA. 🎮')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Generazione fallita')
      setStep(-1)
    } finally {
      setBusy(false)
    }
  }

  const doAnalyze = () => {
    if (script.trim().length < 12) {
      toast.error('Scrivi almeno una frase sulla tua idea di gioco!')
      return
    }
    const a = analyzeScript(script)
    setAnalysis(a)
    setCfg({ ...a })
    setResult(null)
    setSeed(Math.floor(Math.random() * 1e9))
  }

  const openInStudio = () => {
    if (!result) return
    useUI.getState().setStudioOpenId(result.id)
    useUI.getState().setTab('gamestudio')
  }

  // ---------- player ----------
  if (playing && result) {
    return (
      <GamePlayer
        project={result.game}
        onExit={() => setPlaying(false)}
        onEdit={openInStudio}
      />
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="neon-title text-2xl font-black tracking-wide">
          {sec.title || 'CREA DA SCRIPT'}
        </h1>
        <p className="max-w-2xl text-sm text-[var(--tx-dim)]">
          {sec.subtitle ||
            'Scrivi il tuo gioco come una sceneggiatura: il sistema rileva ambientazione, nemici, arma e obiettivo, ti chiede conferma dei dettagli e compila un gioco giocabile con combattimento. Poi lo modifichi nel Game Studio.'}
        </p>
      </motion.div>

      {/* ---- passaggio 1: lo script ---- */}
      <div className="cp-panel p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
            1 ▸ La tua sceneggiatura
          </span>
          <div className="flex gap-1.5">
            {EXAMPLES.map(ex => (
              <button
                key={ex.label}
                className="cp-chip hover:text-[var(--neon)]"
                onClick={() => setScript(ex.text)}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>
        <textarea
          value={script}
          onChange={e => setScript(e.target.value)}
          placeholder={`Es: Il gioco si chiama "Cromo Selvaggio". Il protagonista si chiama Rook, un corriere dei sogni. Nella città ci sono droni polizia e gang di cyborg. Il mio eroe usa un blaster. Deve recuperare 3 chip e scappare dal portale. Difficile, mappa grande, con boss finale: il Signore dei Droni.`}
          className="min-h-40 w-full resize-y bg-[var(--panel-soft)] p-3 font-[family-name:var(--font-geist-mono)] text-sm text-[var(--tx)] ring-1 ring-[var(--line)] outline-none focus:ring-[var(--neon)]"
        />
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-[var(--tx-faint)]">
            Suggerimento: più dettagli scrivi (nemici, arma, obiettivo,
            protagonista, difficoltà), più il gioco rispetta la tua idea.
            Nessun problema se sbagli lettere: capisco lo stesso.
          </p>
          <Button className="cp-btn shrink-0" onClick={doAnalyze} disabled={busy}>
            <Wand2 className="mr-1 h-4 w-4" /> Analizza lo script
          </Button>
        </div>
      </div>

      {/* ---- passaggio 2: scheda di dettaglio ---- */}
      {analysis && cfg && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="cp-panel p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
              2 ▸ Scheda di dettaglio (modificabile)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.found.map(f => (
                <span key={f} className="cp-chip">{f}</span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Titolo del gioco</Label>
              <Input
                className="h-8 bg-[var(--panel-soft)] text-sm"
                value={cfg.title}
                onChange={e => setCfg({ ...cfg, title: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Protagonista</Label>
              <Input
                className="h-8 bg-[var(--panel-soft)] text-sm"
                value={cfg.protagonist}
                onChange={e => setCfg({ ...cfg, protagonist: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Ambientazione</Label>
              <select
                className="h-8 bg-[var(--panel-soft)] px-2 text-sm text-[var(--tx)] ring-1 ring-[var(--line)]"
                value={cfg.paletteId}
                onChange={e => setCfg({ ...cfg, paletteId: e.target.value as PaletteId })}
              >
                {Object.values(PALETTES).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Nemici</Label>
              <div className="flex flex-wrap gap-1">
                {ENEMY_OPTIONS.map(o => {
                  const on = cfg.enemyKinds.includes(o.kind)
                  return (
                    <button
                      key={o.kind}
                      className={`cp-chip ${on ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                      onClick={() =>
                        setCfg({
                          ...cfg,
                          enemyKinds: on
                            ? cfg.enemyKinds.filter(k => k !== o.kind)
                            : [...cfg.enemyKinds, o.kind],
                        })
                      }
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Arma dell'eroe</Label>
              <div className="flex gap-1">
                {(['spada', 'blaster'] as const).map(w => (
                  <button
                    key={w}
                    className={`cp-chip ${cfg.weapon === w ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                    onClick={() => setCfg({ ...cfg, weapon: w })}
                  >
                    {w === 'spada' ? '⚔ Spada' : '🔫 Blaster'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Obiettivo</Label>
              <div className="flex flex-wrap gap-1">
                {([
                  ['goal', '→ Portale'],
                  ['boss', '☠ Elimina boss'],
                  ['collezione', '🔑 Colleziona'],
                ] as [Objective, string][]).map(([o, label]) => (
                  <button
                    key={o}
                    className={`cp-chip ${cfg.objective === o ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                    onClick={() => setCfg({ ...cfg, objective: o })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Dimensione mappa</Label>
              <div className="flex gap-1">
                {(['piccolo', 'medio', 'grande'] as const).map(s2 => (
                  <button
                    key={s2}
                    className={`cp-chip ${cfg.size === s2 ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                    onClick={() => setCfg({ ...cfg, size: s2 })}
                  >
                    {s2}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">Difficoltà</Label>
              <div className="flex gap-1">
                {([1, 2, 3] as const).map(d => (
                  <button
                    key={d}
                    className={`cp-chip ${cfg.difficulty === d ? 'cp-chip-active' : 'hover:text-[var(--neon)]'}`}
                    onClick={() => setCfg({ ...cfg, difficulty: d })}
                  >
                    {['facile', 'normale', 'difficile'][d - 1]}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <Label className="text-[10px] tracking-wider text-[var(--tx-dim)] uppercase">
                Numero nemici: {cfg.enemyCount}
              </Label>
              <input
                type="range"
                min={3}
                max={30}
                value={cfg.enemyCount}
                onChange={e => setCfg({ ...cfg, enemyCount: Number(e.target.value) })}
                className="mt-2 accent-[var(--neon)]"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3">
            <span className="cp-chip">seed #{seed}</span>
            <Button
              className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]"
              onClick={() => void run(false)}
              disabled={busy}
            >
              <Sparkles className="mr-1 h-4 w-4" /> Crea il gioco giocabile
            </Button>
            {result && (
              <Button variant="outline" className="cp-btn" onClick={() => void run(true)} disabled={busy}>
                🎲 Genera variante (stesso script, mondo diverso)
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* ---- passaggio 3: compilazione ---- */}
      {(step >= 0 || (busy && !result)) && cfg && (
        <div className="cp-panel p-4">
          <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
            3 ▸ Compilazione
          </span>
          <div className="mt-3 flex flex-col gap-1.5 font-[family-name:var(--font-geist-mono)] text-sm">
            {GEN_STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex items-center gap-2 ${
                  i < step ? 'text-emerald-400' : i === step ? 'text-[var(--neon)]' : 'text-[var(--tx-faint)]'
                }`}
              >
                <span>{i < step ? '✔' : i === step ? '▸' : '·'}</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ---- risultato ---- */}
      {result && step < 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="cp-panel cp-panel-neon p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="cp-chip cp-chip-active mb-2 w-fit">Gioco pronto</div>
              <h2 className="neon-title text-xl font-black">{result.game.title}</h2>
              <p className="mt-1 text-xs text-[var(--tx-dim)]">
                {result.game.scenes.length} mappa · {result.game.scenes[0].entities.filter(e => e.type === 'enemy').length} nemici
                {result.game.scenes[0].entities.some(e => e.props.kind === 'boss') ? ' · con BOSS' : ''} ·{' '}
                {result.game.settings.weapon === 'blaster' ? 'blaster' : 'spada'} · seed #{result.game.seed}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={() => setPlaying(true)}>
                ▶ Gioca subito
              </Button>
              <Button variant="outline" className="cp-btn" onClick={openInStudio}>
                ✎ Modifica nel Game Studio
              </Button>
              <Button variant="outline" className="cp-btn" onClick={() => void run(true)}>
                🎲 Altra variante
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      <p className="text-[11px] leading-relaxed text-[var(--tx-faint)]">
        I giochi generati restano salvati nel tuo account e li trovi nel reparto{' '}
        <b className="text-[var(--neon)]">Game Studio</b>: lì puoi aggiungere
        livelli, cambiare nemici, scrivere dialoghi e costruire a mano.
      </p>
    </div>
  )
}
