'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import { fetchAuth } from '@/lib/http'
import { useUI } from '@/lib/ui-store'
import { useWorld, nextId } from '@/lib/world-store'
import { generateWorld, type GenKind, type GenSize } from '@/lib/worldgen'
import { encodeTerrain } from '@/lib/terrain'
import { askBrain, type AgentReply } from '@/lib/agent-brain'

// ============================================================
// Agente Darpx — assistente AI fluttuante della home.
// Risponde ALL'ISTANTE col cervello locale e, per le domande
// difficili, chiama anche il modello linguistico lato server.
// Esegue AZIONI reali: cambia reparto, prepara la creazione 3D,
// genera mondi interi e te li apre nell'editor.
// ============================================================

type Msg = {
  role: 'user' | 'assistant'
  content: string
  instant?: boolean // risposta del cervello locale
}

const HELLO: Msg = {
  role: 'assistant',
  content:
    'Ciao! 👋 Sono l\'**Agente Darpx**.\n\nRispondo subito e faccio cose concrete: creo mondi, preparo modelli 3D e ti spiego tutto il sito.\n\nDimmi pure cosa ti serve!',
}

export default function DarpxAgent() {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([HELLO])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([
    'Cosa sai fare?',
    'Crea una città medievale',
    'Come ruoto la visuale?',
    'Genera un drago',
  ])
  const listRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)

  const setTab = useUI(s => s.setTab)

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [msgs, thinking, open])

  // ---------- azioni ----------

  const createWorld = useCallback(
    async (kind: GenKind, size: GenSize, density: number) => {
      try {
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
    []
  )

  const runAction = useCallback(
    (reply: AgentReply) => {
      if (reply.action.type === 'navigate') {
        setTab(reply.action.tab)
      } else if (reply.action.type === 'prefill3d') {
        useUI.getState().setDarpxPrefill(reply.action.prompt)
        setTab('darpx')
        toast.info('Prompt pronto nel reparto Darpx.ai — premi Genera! 🧊')
      } else if (reply.action.type === 'createWorld') {
        void createWorld(reply.action.kind, reply.action.size, reply.action.density)
      }
      if (reply.suggestions.length) setSuggestions(reply.suggestions)
    },
    [createWorld, setTab]
  )

  // ---------- invio ----------

  const send = useCallback(
    async (raw?: string) => {
      const text = (raw ?? input).trim()
      if (!text || busyRef.current) return
      busyRef.current = true
      setInput('')
      setMsgs(m => [...m, { role: 'user', content: text }])

      // 1) cervello locale: risposta ISTANTANEA
      const reply = askBrain(text)
      setMsgs(m => [...m, { role: 'assistant', content: reply.text, instant: true }])
      runAction(reply)

      // 2) domanda difficile? chiedo anche al cervello LLM lato server
      if (reply.confidence < 0.55) {
        setThinking(true)
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
              // sostituisce la risposta di cortesia con quella vera
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
    [input, msgs, runAction]
  )

  return (
    <>
      {/* bolla */}
      <motion.button
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] text-white shadow-xl shadow-purple-900/30 ring-2 ring-white/60"
        title="Agente Darpx"
      >
        <AnimatePresence mode="wait">
          {open ? (
            <X className="h-6 w-6" key="x" />
          ) : (
            <Bot className="h-7 w-7" key="bot" />
          )}
        </AnimatePresence>
        {!open && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fuchsia-400 opacity-75" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-fuchsia-500 ring-2 ring-white" />
          </span>
        )}
      </motion.button>

      {/* pannello */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
            className="fixed bottom-[92px] right-5 z-50 flex h-[min(68vh,560px)] w-[min(92vw,400px)] flex-col overflow-hidden rounded-3xl bg-white/95 shadow-2xl ring-1 ring-black/10 backdrop-blur"
          >
            {/* header */}
            <div className="flex items-center gap-2.5 bg-gradient-to-r from-[#7c3aed] to-[#5b21b6] px-4 py-3 text-white">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15">
                <Bot className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black leading-tight">Agente Darpx</p>
                <p className="flex items-center gap-1 text-[11px] text-purple-200">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  sempre attivo · risponde all'istante
                </p>
              </div>
              <Sparkles className="h-4 w-4 text-purple-200" />
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
                        ? 'rounded-br-md bg-[var(--primary)] text-white'
                        : 'rounded-bl-md bg-white text-stone-700 ring-1 ring-black/5'
                    }`}
                  >
                    {renderRich(m.content)}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 ring-1 ring-black/5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--primary)]" />
                    <span className="text-xs text-stone-400">
                        chiedo al cervellone…
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
                  className="shrink-0 rounded-full bg-purple-50 px-3 py-1 text-[11px] font-semibold text-purple-700 transition hover:bg-purple-100"
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
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-[#7c3aed] to-[#5b21b6] text-white shadow-md transition enabled:hover:brightness-110 disabled:opacity-40"
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
