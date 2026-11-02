'use client'

// ============================================================
// REPARTO: CREA DA SCRIPT — il gioco nasce da una sceneggiatura.
// 1) l'utente scrive (o incolla) l'idea del gioco
// 2) il parser italiano rileva: ambientazione, nemici, arma,
//    obiettivo, dimensione, difficoltà, protagonista, titolo
// 3) IL WIZARD CHIEDE ALL'UTENTE le scelte importanti:
//    2D o 3D · (3D: quale mondo importare + prima/terza persona)
//    (2D: tipo di mappa e dimensione) · arma · obiettivo ·
//    difficoltà · numero nemici · boss
// 4) scheda di dettaglio MODIFICABILE e poi si genera
// 5) lo stesso script con seed diverso = gioco diverso
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Sparkles, Wand2 } from 'lucide-react'
import { analyzeScript, type ScriptAnalysis } from '@/lib/gamesmith/analyze'
import { generateGame, generateGame3D, type WorldImport } from '@/lib/gamesmith/generate'
import { createGame, saveGame, type GameMeta } from '@/lib/game2d/persist'
import type { EntityKind, GameProject, Objective, PaletteId } from '@/lib/game2d/types'
import { gameDimension, PALETTES } from '@/lib/game2d/types'
import GamePlayer from '@/components/studio/GamePlayer'
import GamePlayer3D from '@/components/studio/GamePlayer3D'
import { useUI } from '@/lib/ui-store'
import { sectionOf } from '@/lib/ui-store'
import { fetchAuth } from '@/lib/http'
import { isGameProjectState } from '@/lib/game2d/persist'
import { nextId, parseState, type ProjectMeta } from '@/lib/world-store'
import { generateWorld } from '@/lib/worldgen'
import { encodeTerrain } from '@/lib/terrain'
import { getAssetDef } from '@/lib/assets'

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
  'Preparo il campo di battaglia…',
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

// ---------- definizione delle domande del wizard ----------

type StepId = 'dimension' | 'world' | 'camera' | 'layout' | 'size' | 'weapon' | 'objective' | 'difficulty' | 'enemyCount' | 'boss'

type WorldChoice = { id: string; name: string; updatedAt: string }

export default function CreaDaScript() {
  const site = useUI(s => s.site)
  const sec = sectionOf(site.sections, 'creagame')
  const [script, setScript] = useState('')
  const [analysis, setAnalysis] = useState<ScriptAnalysis | null>(null)
  const [cfg, setCfg] = useState<ScriptAnalysis | null>(null)
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [step, setStep] = useState(-1) // -1 = idle, 0..n compilazione
  const [result, setResult] = useState<GameMeta | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)

  // wizard
  const [qIdx, setQIdx] = useState(0)
  const [worlds, setWorlds] = useState<WorldChoice[] | null>(null) // null = non caricati
  const [worldBusy, setWorldBusy] = useState(false)
  const [worldImport, setWorldImport] = useState<WorldImport | null>(null)

  const is3D = cfg?.dimension === '3d'

  // passi del wizard, dipendono dalla scelta 2D/3D
  const steps: StepId[] = analysis && cfg ? (
    cfg.dimension === '3d'
      ? ['dimension', 'world', 'camera', 'weapon', 'objective', 'difficulty', 'enemyCount', 'boss']
      : ['dimension', 'layout', 'size', 'weapon', 'objective', 'difficulty', 'enemyCount', 'boss']
  ) : []

  const run = async (newSeed: boolean) => {
    if (!cfg || busy) return
    setBusy(true)
    let usedSeed = seed
    if (newSeed) {
      usedSeed = Math.floor(Math.random() * 1e9)
      setSeed(usedSeed)
    }
    setResult(null)
    for (let i = 0; i < GEN_STEPS.length; i++) {
      setStep(i)
      await new Promise(res => setTimeout(res, 420))
    }
    try {
      let game: GameProject
      if (cfg.dimension === '3d' && cfg.worldProjectId) {
        if (!worldImport || worldImport.id !== cfg.worldProjectId) {
          const wi = await loadWorldImport(cfg.worldProjectId, cfg.worldProjectName ?? 'mondo')
          setWorldImport(wi)
          game = generateGame3D(cfg, usedSeed, wi)
        } else {
          game = generateGame3D(cfg, usedSeed, worldImport)
        }
      } else {
        game = generateGame(cfg, usedSeed)
      }
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
    setWorldImport(null)
    setWorlds(null)
    setQIdx(0)
    setSeed(Math.floor(Math.random() * 1e9))
  }

  const openInStudio = () => {
    if (!result) return
    useUI.getState().setStudioOpenId(result.id)
    useUI.getState().setTab('gamestudio')
  }

  // ---------- lista mondi 3D (hook PRIMA di ogni early return) ----------
  const loadWorlds = useCallback(async () => {
    setWorldBusy(true)
    try {
      const res = await fetchAuth('/api/projects')
      const data = await res.json().catch(() => ({}))
      const list: WorldChoice[] = (data.projects ?? [])
        .filter((p: ProjectMeta) => !isGameProjectState(p.state))
        .map((p: ProjectMeta) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }))
      list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      setWorlds(list)
    } catch {
      setWorlds([])
    } finally {
      setWorldBusy(false)
    }
  }, [])

  // quando la domanda "world" diventa visibile, carica la lista
  const currentStep = steps[qIdx]
  useEffect(() => {
    if (currentStep === 'world' && worlds === null) void loadWorlds()
  }, [currentStep, worlds, loadWorlds])

  // ---------- player ----------
  if (playing && result) {
    return gameDimension(result.game) === '3d' ? (
      <GamePlayer3D
        project={result.game}
        onExit={() => setPlaying(false)}
        onEdit={openInStudio}
      />
    ) : (
      <GamePlayer
        project={result.game}
        onExit={() => setPlaying(false)}
        onEdit={openInStudio}
      />
    )
  }

  // ---------- risposta a una domanda ----------
  const answer = (patch: Partial<ScriptAnalysis>) => {
    if (!cfg) return
    setCfg({ ...cfg, ...patch })
    setQIdx(i => i + 1)
  }

  // crea un mondo nuovo con il generatore procedurale
  const createNewWorld = async () => {
    if (!cfg || worldBusy) return
    setWorldBusy(true)
    try {
      const wseed = Math.floor(Math.random() * 1e9)
      const kind = cfg.paletteId === 'fantasy' || cfg.paletteId === 'horror' ? 'villaggio' : 'paesaggio'
      const gen = generateWorld({ kind, size: 'm', density: 0.55, seed: wseed })
      const name = `Mondo di ${cfg.title}`.slice(0, 60)
      const res = await fetchAuth('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Errore durante la creazione del mondo')
      const state = JSON.stringify({
        objects: gen.objects.map(o => ({ ...o, id: nextId() })),
        customAssets: [],
        terrain: encodeTerrain(gen.terrain),
      })
      await fetchAuth(`/api/projects/${data.project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      })
      toast.success(`Mondo "${name}" generato! Lo trovi anche nei Mondi 3D.`)
      answer({ worldProjectId: data.project.id, worldProjectName: name })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Errore')
    } finally {
      setWorldBusy(false)
    }
  }

  const pickWorld = (w: WorldChoice) => {
    setWorldImport(null)
    answer({ worldProjectId: w.id, worldProjectName: w.name })
  }

  const back = () => setQIdx(i => Math.max(0, i - 1))

  // scarica i dati del mondo per calcolare le celle bloccate
  const loadWorldImport = async (id: string, name: string): Promise<WorldImport> => {
    const res = await fetchAuth(`/api/projects/${id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data.project) throw new Error('Mondo non disponibile')
    const st = parseState(data.project.state)
    const blocked: string[] = []
    for (const o of st.objects) {
      const def = getAssetDef(o.asset, st.customAssets)
      if (def && !def.walkable) blocked.push(`${o.x},${o.z}`)
    }
    return { id, name: data.project.name ?? name, blocked }
  }

  return (
    <div className="flex flex-col gap-4">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="neon-title text-2xl font-black tracking-wide">
          {sec.title || 'CREA DA SCRIPT'}
        </h1>
        <p className="max-w-2xl text-sm text-[var(--tx-dim)]">
          {sec.subtitle ||
            'Scrivi il tuo gioco come una sceneggiatura: il sistema rileva ambientazione, nemici, arma e obiettivo, ti fa le domande giuste (2D o 3D, prima o terza persona…) e compila un gioco giocabile con combattimento. Poi lo modifichi nel Game Studio.'}
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

      {/* ---- passaggio 2: WIZARD a domande ---- */}
      {analysis && cfg && qIdx < steps.length && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="cp-panel p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
              2 ▸ Rispondi alle domande ({qIdx + 1}/{steps.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {analysis.found.slice(0, 4).map(f => (
                <span key={f} className="cp-chip">{f}</span>
              ))}
            </div>
          </div>

          {/* pallini di avanzamento */}
          <div className="mb-4 flex gap-1.5">
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full ${i < qIdx ? 'bg-[var(--neon)]' : i === qIdx ? 'bg-[var(--neon-2)]' : 'bg-[var(--panel-hover)]'}`}
              />
            ))}
          </div>

          {currentStep === 'dimension' && (
            <Question
              n={qIdx + 1}
              title="Come immagini il tuo gioco?"
              hint="Puoi cambiarlo anche dopo: la scelta si applica alla generazione."
            >
              <BigOption
                icon="🕹️"
                title="2D — classico e veloce"
                desc="Vista dall'alto stile arcade: mappa generata da zero, perfetto per provare subito."
                onClick={() => answer({ dimension: '2d' })}
              />
              <BigOption
                icon="🌍"
                title="3D — dentro un tuo mondo"
                desc="Il gioco nasce in uno dei TUOI mondi 3D (o in uno nuovo): esplori, combatti e vinci in tre dimensioni."
                onClick={() => answer({ dimension: '3d' })}
                accent
              />
            </Question>
          )}

          {currentStep === 'world' && (
            <Question
              n={qIdx + 1}
              title="In quale mondo 3D si gioca?"
              hint="Sono i mondi creati nel reparto Mondi 3D (quello di prova)."
            >
              {worlds === null || worldBusy ? (
                <div className="flex items-center gap-2 py-6 text-sm text-[var(--tx-dim)]">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--neon)]" />
                  Carico i tuoi mondi…
                </div>
              ) : worlds.length === 0 ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[var(--tx-dim)]">
                    Non hai ancora nessun mondo 3D. Nessun problema:
                  </p>
                  <BigOption
                    icon="🎨"
                    title="Genera un mondo nuovo per me"
                    desc="Creo un progetto mondo con case, alberi e strade: lo troverai anche nel reparto Mondi 3D."
                    onClick={() => void createNewWorld()}
                    accent
                  />
                </div>
              ) : (
                <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
                  {worlds.map(w => (
                    <button
                      key={w.id}
                      onClick={() => pickWorld(w)}
                      className="flex items-center justify-between gap-3 bg-[var(--panel-soft)] p-3 text-left ring-1 ring-[var(--line)] transition-colors hover:bg-[var(--panel-hover)] hover:ring-[var(--neon)]"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold text-[var(--tx)]">🌍 {w.name}</span>
                        <span className="text-[11px] text-[var(--tx-faint)]">
                          modificato {new Date(w.updatedAt).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </span>
                      <span className="cp-chip shrink-0">scegli</span>
                    </button>
                  ))}
                  <BigOption
                    icon="🎨"
                    title="Oppure genera un mondo nuovo per me"
                    desc="Un mondo nuovo con case, alberi e strade, salvato anche nei Mondi 3D."
                    onClick={() => void createNewWorld()}
                  />
                </div>
              )}
            </Question>
          )}

          {currentStep === 'camera' && (
            <Question
              n={qIdx + 1}
              title="Come vuoi vedere il mondo?"
              hint="Si applica al gioco 3D nel mondo scelto."
            >
              <BigOption
                icon="🧍"
                title="Terza persona"
                desc="Vedi il tuo eroe dietro le spalle mentre esplora e combatte (stile avventura)."
                onClick={() => answer({ camera: 'terza' })}
              />
              <BigOption
                icon="👁️"
                title="Prima persona"
                desc="Sei TU dentro l'eroe: vedi il mondo con i suoi occhi, con mirino al centro."
                onClick={() => answer({ camera: 'prima' })}
                accent
              />
            </Question>
          )}

          {currentStep === 'layout' && (
            <Question
              n={qIdx + 1}
              title="Che tipo di mappa 2D vuoi?"
              hint="Se lo script suggerisce già un'ambientazione, lascia decidere a me."
            >
              <BigOption icon="🏛️" title="Stanze e dungeon" desc="Sale connesse da corridoi, stile dungeon classico." onClick={() => answer({ layout: 'stanze' })} />
              <BigOption icon="🌆" title="Città a isolati" desc="Strade, isolati, cortili e piazze." onClick={() => answer({ layout: 'citta' })} />
              <BigOption icon="🕳️" title="Caverne" desc="Grotte organiche scavate nella roccia." onClick={() => answer({ layout: 'caverne' })} />
              <BigOption icon="🏝️" title="Isola" desc="Erba, mare attorno, stagni e sentieri." onClick={() => answer({ layout: 'isola' })} />
              <BigOption icon="🎲" title="Lascia decidere a te" desc="Scelgo il layout più adatto all'ambientazione dello script." onClick={() => answer({ layout: 'auto' })} accent />
            </Question>
          )}

          {currentStep === 'size' && (
            <Question n={qIdx + 1} title="Quanto grande deve essere la mappa?">
              <BigOption icon="▪️" title="Piccola" desc="Partita breve, 5-10 minuti." onClick={() => answer({ size: 'piccolo' })} />
              <BigOption icon="🔲" title="Media" desc="Equilibrata: esplorazione e azione." onClick={() => answer({ size: 'medio' })} />
              <BigOption icon="🗺️" title="Grande" desc="Tanta esplorazione, tanti nemici." onClick={() => answer({ size: 'grande' })} accent />
            </Question>
          )}

          {currentStep === 'weapon' && (
            <Question n={qIdx + 1} title="Come combatte il tuo eroe?">
              <BigOption icon="⚔️" title="Mischia — spada" desc="Colpi ravvicinati potenti, arco di attacco davanti a te." onClick={() => answer({ weapon: 'spada' })} />
              <BigOption icon="🔫" title="Distanza — blaster" desc="Proiettili al plasma: colpisci da lontano." onClick={() => answer({ weapon: 'blaster' })} accent />
            </Question>
          )}

          {currentStep === 'objective' && (
            <Question n={qIdx + 1} title="Qual è l'obiettivo del gioco?">
              <BigOption icon="🌀" title="Raggiungi il portale" desc="Sopravvivi e raggiungi l'uscita dorata." onClick={() => answer({ objective: 'goal' })} />
              <BigOption icon="☠️" title="Elimina il BOSS" desc="Trova e sconfiggi il boss finale." onClick={() => answer({ objective: 'boss', boss: true })} />
              <BigOption icon="🔑" title="Colleziona le chiavi" desc="Trova 3 chiavi sparse, poi il portale si apre." onClick={() => answer({ objective: 'collezione' })} accent />
            </Question>
          )}

          {currentStep === 'difficulty' && (
            <Question n={qIdx + 1} title="Che difficoltà vuoi?">
              <BigOption icon="🟢" title="Facile" desc="Più vita, nemici più deboli e meno aggressivi." onClick={() => answer({ difficulty: 1 })} />
              <BigOption icon="🟡" title="Normale" desc="L'esperienza pensata per tutti." onClick={() => answer({ difficulty: 2 })} accent />
              <BigOption icon="🔴" title="Difficile" desc="Nemici duri, aggressivi e numerosi." onClick={() => answer({ difficulty: 3 })} />
            </Question>
          )}

          {currentStep === 'enemyCount' && (
            <Question n={qIdx + 1} title={`Quanti nemici? (${cfg.enemyCount})`} hint={is3D ? 'Nel mondo 3D compariranno nei punti liberi.' : 'Saranno sparsi su tutta la mappa.'}>
              <input
                type="range"
                min={3}
                max={30}
                value={cfg.enemyCount}
                onChange={e => setCfg({ ...cfg, enemyCount: Number(e.target.value) })}
                className="mt-2 w-full accent-[var(--neon)]"
              />
              <div className="mt-4 flex justify-end">
                <Button className="cp-btn bg-[var(--neon)] font-bold text-[#04060d]" onClick={() => setQIdx(i => i + 1)}>
                  Conferma →
                </Button>
              </div>
            </Question>
          )}

          {currentStep === 'boss' && (
            <Question n={qIdx + 1} title="Vuoi un BOSS finale?">
              <BigOption icon="👹" title="Sì, con BOSS" desc="Un nemico enorme e letale nascosto nel livello." onClick={() => answer({ boss: true })} accent />
              <BigOption icon="🚫" title="No, solo nemici normali" desc="La sfida resta nei numeri e nella difficoltà." onClick={() => answer({ boss: false })} />
            </Question>
          )}

          {qIdx > 0 && (
            <button onClick={back} className="cp-chip mt-4 hover:text-[var(--neon)]">
              ← domanda precedente
            </button>
          )}
        </motion.div>
      )}

      {/* ---- passaggio 3: scheda di dettaglio ---- */}
      {analysis && cfg && qIdx >= steps.length && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="cp-panel p-4"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
              3 ▸ Scheda di dettaglio (modificabile)
            </span>
            <div className="flex flex-wrap gap-1.5">
              <span className="cp-chip cp-chip-active">{cfg.dimension === '3d' ? '🌍 3D' : '🕹️ 2D'}</span>
              {cfg.dimension === '3d' && <span className="cp-chip">{cfg.camera === 'prima' ? '👁️ prima persona' : '🧍 terza persona'}</span>}
              {cfg.dimension === '3d' && cfg.worldProjectName && <span className="cp-chip">🌍 {cfg.worldProjectName}</span>}
              {cfg.dimension !== '3d' && <span className="cp-chip">mappa: {cfg.layout === 'auto' ? 'automatica' : cfg.layout}</span>}
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
                    onClick={() => setCfg({ ...cfg, objective: o, ...(o === 'boss' ? { boss: true } : {}) })}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {cfg.dimension !== '3d' && (
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
            )}
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
            <button
              className="cp-chip hover:text-[var(--neon)]"
              onClick={() => { setQIdx(0); setResult(null) }}
            >
              ↺ rifai le domande
            </button>
          </div>
        </motion.div>
      )}

      {/* ---- passaggio 4: compilazione ---- */}
      {(step >= 0 || (busy && !result)) && cfg && (
        <div className="cp-panel p-4">
          <span className="neon-text font-[family-name:var(--font-display)] text-xs font-bold tracking-[0.18em] uppercase">
            4 ▸ Compilazione
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
              <div className="cp-chip cp-chip-active mb-2 w-fit">
                {gameDimension(result.game) === '3d' ? 'Gioco 3D pronto' : 'Gioco pronto'}
              </div>
              <h2 className="neon-title text-xl font-black">{result.game.title}</h2>
              <p className="mt-1 text-xs text-[var(--tx-dim)]">
                {gameDimension(result.game) === '3d' ? (
                  <>
                    🌍 mondo: {result.game.settings.worldProjectName} ·{' '}
                    {result.game.settings.camera === 'prima' ? 'prima persona' : 'terza persona'} ·{' '}
                    {result.game.scenes[0].entities.filter(e => e.type === 'enemy').length} nemici
                    {result.game.scenes[0].entities.some(e => e.props.kind === 'boss') ? ' · con BOSS' : ''} ·{' '}
                    {result.game.settings.weapon === 'blaster' ? 'blaster' : 'spada'} · seed #{result.game.seed}
                  </>
                ) : (
                  <>
                    {result.game.scenes.length} mappa · {result.game.scenes[0].entities.filter(e => e.type === 'enemy').length} nemici
                    {result.game.scenes[0].entities.some(e => e.props.kind === 'boss') ? ' · con BOSS' : ''} ·{' '}
                    {result.game.settings.weapon === 'blaster' ? 'blaster' : 'spada'} · seed #{result.game.seed}
                  </>
                )}
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
        livelli, cambiare nemici, scrivere dialoghi e costruire a mano. I giochi
        3D restano collegati al loro mondo: se lo modifichi nei Mondi 3D,
        il gioco usa sempre l'ultima versione.
      </p>
    </div>
  )
}

// ---------- componenti del wizard ----------

function Question({
  n,
  title,
  hint,
  children,
}: {
  n: number
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="text-lg font-bold text-[var(--tx)]">
        <span className="mr-2 neon-text font-[family-name:var(--font-geist-mono)]">Q{n}</span>
        {title}
      </h3>
      {hint && <p className="mb-3 mt-0.5 text-xs text-[var(--tx-faint)]">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  )
}

function BigOption({
  icon,
  title,
  desc,
  onClick,
  accent,
}: {
  icon: string
  title: string
  desc: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-start gap-3 p-3.5 text-left ring-1 transition-all ${
        accent
          ? 'bg-[var(--panel-soft)] ring-[var(--line)] hover:bg-[var(--primary-soft)] hover:ring-[var(--neon)]'
          : 'bg-[var(--panel-soft)] ring-[var(--line)] hover:bg-[var(--panel-hover)] hover:ring-[var(--neon)]'
      }`}
    >
      <span className="text-2xl leading-none">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--tx)]">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--tx-dim)]">{desc}</span>
      </span>
      <span className="cp-chip shrink-0 opacity-0 transition-opacity group-hover:opacity-100">scegli →</span>
    </button>
  )
}
