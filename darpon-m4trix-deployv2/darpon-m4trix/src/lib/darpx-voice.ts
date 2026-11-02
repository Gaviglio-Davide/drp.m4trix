'use client'

// ============================================================
// DARPX VOICE — la voce e le orecchie del samurai digitale
// ------------------------------------------------------------
// • speak(): il samurai PARLE le risposte (Web Speech API del
//   browser, gratis, senza chiavi, voce italiana)
// • listen(): il samurai SENTE ciò che dici (microfono → testo,
//   ricognizione vocale del browser)
// Nessuna API esterna: tutto è già dentro Chrome/Edge/Safari.
// ============================================================

/* ---------- stato condiviso ---------- */

let ttsSpeaking = false
let ttsQueued = 0

/* ---------- parlato (TTS) ---------- */

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** pulisce il testo per la voce: niente markdown, niente emoji */
function cleanForVoice(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1') // **grassetto** → testo
    .replace(/[*_`#>]/g, ' ')
    .replace(
      /[\u{1F000}-\u{1FAFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]|[\u{2700}-\u{27BF}]|[\u{2B00}-\u{2BFF}]/gu,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** spezza in blocchi brevi (i browser tagliano le frasi lunghe) */
function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?…:;\n]+[.!?…:;\n]*/g) ?? [text]
  const chunks: string[] = []
  let cur = ''
  for (const s of sentences) {
    if ((cur + s).length > 170 && cur) {
      chunks.push(cur.trim())
      cur = s
    } else {
      cur += s
    }
    // frase singola lunghissima: taglio duro
    while (cur.length > 220) {
      chunks.push(cur.slice(0, 200).trim())
      cur = cur.slice(200)
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks
}

function pickItVoice(): SpeechSynthesisVoice | null {
  if (!ttsSupported()) return null
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return null
  return (
    voices.find(v => v.lang.toLowerCase().startsWith('it') && /google/i.test(v.name)) ??
    voices.find(v => v.lang.toLowerCase().startsWith('it')) ??
    null
  )
}

/** il samurai parla. onEnd arriva quando ha finito (o è stato interrotto) */
export function speak(text: string, opts?: { onStart?: () => void; onEnd?: () => void }): void {
  if (!ttsSupported()) return
  stopSpeak()
  const clean = cleanForVoice(text)
  if (!clean) return
  const chunks = chunkText(clean)
  const total = chunks.length
  ttsQueued = total
  ttsSpeaking = true
  opts?.onStart?.()

  // piccolo delay: alcuni browser ignorano speak() subito dopo cancel()
  setTimeout(() => {
    const voice = pickItVoice()
    chunks.forEach(chunk => {
      const u = new SpeechSynthesisUtterance(chunk)
      if (voice) u.voice = voice
      u.lang = 'it-IT'
      u.rate = 1.04
      u.pitch = 0.82 // voce più scura, da samurai
      u.volume = 1
      u.onend = () => {
        ttsQueued -= 1
        if (ttsQueued <= 0) {
          ttsSpeaking = false
          opts?.onEnd?.()
        }
      }
      u.onerror = () => {
        ttsQueued -= 1
        if (ttsQueued <= 0) {
          ttsSpeaking = false
          opts?.onEnd?.()
        }
      }
      window.speechSynthesis.speak(u)
    })
  }, 60)
}

/** interrompe la voce a metà */
export function stopSpeak(): void {
  if (!ttsSupported()) return
  ttsQueued = 0
  ttsSpeaking = false
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* noop */
  }
}

export function isSpeaking(): boolean {
  return ttsSpeaking
}

/** pre-carica l'elenco voci (async in alcuni browser) */
export function warmupVoices(): void {
  if (!ttsSupported()) return
  window.speechSynthesis.getVoices()
}

/* ---------- ascolto (STT / microfono) ---------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
type SRAny = any

export function micSupported(): boolean {
  if (typeof window === 'undefined') return false
  const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
  return !!SR
}

export type MicHandle = { stop: () => void }

/** il samurai ascolta il microfono e trascrive quello che dici */
export function listen(opts: {
  onPartial: (text: string) => void
  onFinal: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
}): MicHandle | null {
  const SR: SRAny =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
      : undefined
  if (!SR) {
    opts.onError('Questo browser non supporta il microfono: prova Chrome o Edge')
    return null
  }

  const rec: SRAny = new SR()
  rec.lang = 'it-IT'
  rec.interimResults = true
  rec.continuous = false
  rec.maxAlternatives = 1

  let finalText = ''
  let closed = false

  const close = () => {
    if (closed) return
    closed = true
    try {
      rec.abort()
    } catch {
      /* noop */
    }
    opts.onDone()
  }

  rec.onresult = (event: SRAny) => {
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const res = event.results[i]
      if (res.isFinal) {
        finalText += res[0].transcript
        opts.onFinal(finalText.trim())
      } else {
        interim += res[0].transcript
      }
    }
    if (interim) opts.onPartial((finalText + ' ' + interim).trim())
  }
  rec.onerror = (event: SRAny) => {
    const code = event?.error ?? 'sconosciuto'
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      opts.onError('Permesso del microfono negato: permettilo dal lucchetto in alto')
    } else if (code === 'no-speech') {
      // non è un errore vero: non hai detto nulla
    } else {
      opts.onError('Microfono in errore: ' + code)
    }
    close()
  }
  rec.onend = () => {
    close()
  }

  try {
    rec.start()
  } catch {
    opts.onError('Non riesco ad accendere il microfono')
    return null
  }

  return {
    stop: () => {
      closed = true
      try {
        rec.stop()
      } catch {
        /* noop */
      }
    },
  }
}
