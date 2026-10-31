'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAuth } from '@/lib/http'
import { useUI } from '@/lib/ui-store'
import { useWorld, nextId } from '@/lib/world-store'
import { generateWorld, type GenKind, type GenSize } from '@/lib/worldgen'
import { encodeTerrain } from '@/lib/terrain'
import {
  askBrain,
  emptyBrainContext,
  type AgentReply,
  type BrainContext,
} from '@/lib/agent-brain'
import DarpxAvatar, { type AvatarMood } from '@/components/DarpxAvatar'

// ============================================================
// Agente Darpx v7 — con CORPO E CARATTERE 💜
// • La bolla ora ospita l'AVATAR DARPX (il guizzo d'ombra con
//   fiamma olografica): cammina, pensa, parla, festeggia
// • Ricorda il CONTESTO: «ancora» rifà l'ultima azione variandola
// • Quando è tranquillo VIAGGIA per il fondo dello schermo
// • Per le domande difficili interpella il LLM lato server
// ============================================================

type Msg = {
  role: 'user' | 'assistant'
  content: string
  instant?: boolean // risposta del cervello locale (sostituibile dal LLM)
}

const HELLO: Msg = {
  role: 'assistant',
  content:
    'Ciao! 👋 Sono l\'**Agente Darpx**.\n\nPosso **generare modelli 3D col mio motore interno** 🧬, creare mondi, migliorare i tuoi GLB, cambiare il tema del sito e spiegarti tutto.\n\nScrivi come ti pare: capisco anche gli errori di battitura. E se scrivi **«ancora»** rifaccio l\'ultima cosa con una variante nuova!',
}

export default function DarpxAgent() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([HELLO])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [thinkLabel, setThinkLabel] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([
    'Cosa sai fare?',
    'Genera un drago rosso',
    'Crea una città medievale',
    'Metti il tema viola',
  ])
  const [mood, setMood] = useState<AvatarMood>('idle')
  const moodTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // viaggio nel sito (quando la bolla è chiusa e l'utente è tranquillo)
  const [travelX, setTravelX] = useState(0)
  const [traveling, setTraveling] = useState(false)
  const lastActivity = useRef(Date.now())

  const listRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const brainCtx = useRef<BrainContext>(emptyBrainContext())

  const setTab = useUI(s => s.setTab)
  const setAccent = useWorld(s => s.setAccent)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, thinking, open])

  /** umore temporaneo: dopo N secondi torna idle */
  const setMoodFor = useCallback((m: AvatarMood, ms: number) => {
    setMood(m)
    if (moodTimer.current) clearTimeout(moodTimer.current)
    if (m !== 'idle' && m !== 'walk') {
      moodTimer.current = setTimeout(() => setMood('idle'), ms)
    }
  }, [])

  // ---------- il viaggio dell'avatar ----------
  useEffect(() => {
    const iv = setInterval(() => {
      const idleFor = Date.now() - lastActivity.current
      if (!open && !traveling && !busyRef.current && idleFor > 16000) {
        // parte per una passeggiata sul fondo dello schermo
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
        const maxLeft = Math.min(340, vw * 0.34)
        const target = -Math.round(20 + Math.random() * maxLeft)
        setTraveling(true)
        setMood('walk')
        setTravelX(target)
      }
    }, 2500)
    return () => clearInterval(iv)
  }, [open, traveling])

  const stopTravel = useCallback(() => {
    setTraveling(false)
    setMood('idle')
    lastActivity.current = Date.now()
  }, [])

  // ---------- azioni ----------

  const createWorld = useCallback(
    async (kind: GenKind, size: GenSize, density: number) => {
      try {
        setMoodFor('happy', 2600)
        const seed = Math.floor(Math.random() * 90000) + 1000
        const result = generateWorld({ kind, size, density, seed })
        const name = `${kind === 'citta' ? 'Città medievale' : kind === 'villaggio' ? 'Villaggio' : kind === 'fortezza' ? 'Fortezza' : 'Paesaggio'} · Agente #${seed}`
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
        const patch = await fetchAuth(`/api/projects/${data.project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: stateJson }),
        })
        if (!patch.ok) throw new Error('Salvataggio non riuscito')
        useWorld.getState().openProject({
          id: data.project.id,
          name,
          state: stateJson,
          createdAt: data.project.createdAt,
          updatedAt: data.project.updatedAt,
        })
        toast.success('Mondo generato dall\'agente! 🌍')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Errore creazione mondo')
      }
    },
    [setMoodFor]
  )

  const runAction = useCallback(
    (reply: AgentReply) => {
      if (reply.action.type === 'navigate') {
        setTab(reply.action.tab)
        setMoodFor('happy', 1800)
      } else if (reply.action.type === 'prefill3d') {
        // il motore interno parte da solo: precompila e apre il laboratorio
        useUI.getState().setDarpxPrefill(reply.action.prompt)
        setTab('darpx')
        setMoodFor('glitch', 3200)
        toast.info('Motore interno acceso: ti chiedo un paio di dettagli 🧬')
      } else if (reply.action.type === 'createWorld') {
        void createWorld(reply.action.kind, reply.action.size, reply.action.density)
      } else if (reply.action.type === 'setTheme') {
        setAccent(reply.action.themeId, true)
        setMoodFor('happy', 2000)
        toast.success('Tema aggiornato! 🎨')
      }
      if (reply.suggestions.length) setSuggestions(reply.suggestions)
    },
    [createWorld, setTab, setAccent, setMoodFor]
  )

  // ---------- invio ----------

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim()
      if (!text || busyRef.current) return
      busyRef.current = true
      lastActivity.current = Date.now()
      stopTravel()
      setInput('')
      setMsgs(m => [...m, { role: 'user', content: text }])

      // 1) riflessione: il cervello locale elabora (con memoria di contesto)
      const { reply, ctx } = askBrain(text, brainCtx.current)
      brainCtx.current = ctx

      if (reply.confidence >= 0.99) {
        // azioni e saluti: risposta asciutta
        setMsgs(m => [...m, { role: 'assistant', content: reply.text, instant: true }])
        runAction(reply)
        setMoodFor('talk', 2600)
      } else {
        setThinking(true)
        setThinkLabel('Sto pensando…')
        setMood('think')
        await new Promise(r => setTimeout(r, 480 + Math.random() * 520))
        setMsgs(m => [...m, { role: 'assistant', content: reply.text, instant: true }])
        runAction(reply)
        setMoodFor('talk', 2600)
        setThinking(false)
      }

      // 2) risposta incerta? chiedo anche al cervello LLM lato server
      if (reply.confidence < 0.75) {
        setThinking(true)
        setThinkLabel('Approfondisco…')
        setMood('think')
        try {
          const history = msgs
            .slice(-8)
            .map(m => ({ role: m.role, content: m.content }))
          const res = await fetchAuth('/api/agent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text, history }),
          })
          if (res.ok) {
            const data = (await res.json()) as { answer?: string }
            if (data.answer && data.answer.trim()) {
              setMsgs(m => {
                const next = [...m]
                for (let i = next.length - 1; i >= 0; i--) {
                  if (next[i].role === 'assistant' && next[i].instant) {
                    next[i] = { role: 'assistant', content: data.answer! }
                    break
                  }
                }
                return next
              })
              setMoodFor('talk', 2600)
            }
          }
        } catch {
          // resta la risposta locale
        } finally {
          setThinking(false)
        }
      }
      busyRef.current = false
    },
    [input, msgs, runAction, setMoodFor, stopTravel]
  )

  // stili legati al tema corrente (CSS variables, si aggiornano da sole)
  const grad = 'linear-gradient(to bottom, var(--primary), var(--primary-strong))'
  const gradH = 'linear-gradient(to right, var(--primary), var(--primary-strong))'

  const bubbleMood: AvatarMood = thinking ? 'think' : traveling ? 'walk' : mood

  return (
    <>
      {/* bolla con l'avatar che viaggia */}
      <div
        className="fixed bottom-5 right-5 z-50"
        style={{ transform: `translateX(${travelX}px)`, transition: traveling ? 'transform 5.2s ease-in-out' : 'transform 0.35s ease' }}
      >
        <motion.button
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => {
            stopTravel()
            setTravelX(0)
            setOpen(o => !o)
          }}
          style={{ backgroundImage: grad }}
          className="relative flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-xl shadow-black/25 ring-2 ring-white/60"
          title="Agente Darpx"
        >
          {open ? (
            <X className="h-6 w-6" />
          ) : (
            <DarpxAvatar mood={bubbleMood} size={58} />
          )}
          {!open && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ background: 'var(--primary-strong)' }}
              />
              <span className="relative inline-flex h-4 w-4 rounded-full bg-white ring-2" style={{ ['--tw-ring-color' as never]: 'var(--primary)' }} />
            </span>
          )}
        </motion.button>
        {traveling && !open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-none absolute left-1/2 top-full mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-medium text-white/90 shadow"
          >
            🚶 sto girando per il sito…
          </motion.div>
        )}
      </div>

      {/* pannello */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed bottom-[100px] right-5 z-50 flex h-[min(68vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-3xl bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur"
          >
            {/* header con avatar */}
            <div
              className="flex items-center gap-2.5 px-4 py-3 text-white"
              style={{ backgroundImage: gradH }}
            >
              <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-black/25">
                <DarpxAvatar mood={thinking ? 'think' : mood} size={42} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-tight">Agente Darpx</p>
                <p className="flex items-center gap-1 text-[11px] text-white/75">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  {thinking ? 'sta riflettendo…' : mood === 'talk' ? 'parla con te' : mood === 'happy' ? 'felice!' : 'motore 3D interno attivo'}
                </p>
              </div>
              <Sparkles className="h-4 w-4 text-white/75" />
            </div>

            {/* messaggi */}
            <div
              ref={listRef}
              className="flex-1 space-y-2.5 overflow-y-auto bg-stone-50/70 px-3.5 py-3"
            >
              {msgs.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm ${
                      m.role === 'user'
                        ? 'rounded-br-md text-white'
                        : 'rounded-bl-md bg-white text-stone-700 ring-1 ring-black/5'
                    }`}
                    style={
                      m.role === 'user'
                        ? { background: 'var(--primary)' }
                        : undefined
                    }
                  >
                    {renderRich(m.content)}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 ring-1 ring-black/5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" style={{ color: 'var(--primary)' }} />
                    <span className="text-xs text-stone-400">
                      {thinkLabel || 'Sto pensando…'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* suggerimenti */}
            <div className="flex gap-1.5 overflow-x-auto border-t border-black/5 bg-white px-3 py-2">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition hover:brightness-95"
                  style={{ background: 'var(--primary-soft)', color: 'var(--primary-strong)' }}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* input */}
            <div className="flex items-center gap-2 border-t border-black/5 bg-white p-2.5">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && void send()}
                placeholder="Chiedi o comando qualcosa…"
                className="h-10 flex-1 rounded-xl bg-stone-100 px-3.5 text-sm outline-none ring-[var(--primary)] transition focus:ring-2"
                maxLength={500}
              />
              <button
                onClick={() => void send()}
                disabled={!input.trim()}
                style={{ backgroundImage: grad }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md transition enabled:hover:brightness-110 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/** mini-markdown: **grassetto** e righe multiple */
function renderRich(text: string) {
  return text.split('\n').map((line, i) => {
    const parts = line.split(/\*\*(.+?)\*\*/g)
    return (
      <span key={i} className="block">
        {parts.map((p, j) =>
          j % 2 === 1 ? <b key={j}>{p}</b> : <span key={j}>{p}</span>
        )}
      </span>
    )
  })
}
