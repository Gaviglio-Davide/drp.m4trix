// ============================================================
// Effetti sonori sintetizzati (WebAudio) — nessun file audio.
// Il contesto audio parte al primo gesto dell'utente.
// ============================================================

let actx: AudioContext | null = null

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!actx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!AC) return null
    actx = new AC()
  }
  if (actx.state === 'suspended') void actx.resume()
  return actx
}

/** riattiva l'audio al primo input (da chiamare su click/keydown) */
export function unlockAudio() {
  ac()
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number,
  delay = 0
) {
  const a = ac()
  if (!a) return
  const t0 = a.currentTime + delay
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur)
  gain.gain.setValueAtTime(vol, t0)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

export const sfx = {
  attack: () => tone(320, 0.09, 'square', 0.06, 140),
  shoot: () => tone(680, 0.08, 'square', 0.05, 220),
  hit: () => tone(160, 0.12, 'sawtooth', 0.07, 60),
  enemyDie: () => {
    tone(220, 0.16, 'sawtooth', 0.06, 50)
    tone(440, 0.1, 'square', 0.03, 80, 0.05)
  },
  hurt: () => tone(110, 0.18, 'sawtooth', 0.08, 45),
  pickup: () => {
    tone(880, 0.07, 'sine', 0.06)
    tone(1320, 0.09, 'sine', 0.06, undefined, 0.06)
  },
  heal: () => {
    tone(520, 0.1, 'sine', 0.06)
    tone(780, 0.14, 'sine', 0.06, undefined, 0.08)
  },
  door: () => {
    tone(300, 0.12, 'triangle', 0.06)
    tone(450, 0.16, 'triangle', 0.06, undefined, 0.1)
  },
  locked: () => tone(140, 0.2, 'square', 0.05, 90),
  transition: () => {
    tone(440, 0.1, 'sine', 0.05)
    tone(660, 0.12, 'sine', 0.05, undefined, 0.08)
    tone(880, 0.14, 'sine', 0.05, undefined, 0.16)
  },
  win: () => {
    ;[523, 659, 784, 1046].forEach((f, i) =>
      tone(f, 0.18, 'triangle', 0.07, undefined, i * 0.12)
    )
  },
  lose: () => {
    ;[400, 300, 220, 140].forEach((f, i) =>
      tone(f, 0.22, 'sawtooth', 0.06, undefined, i * 0.14)
    )
  },
  step: () => tone(90 + Math.random() * 30, 0.03, 'triangle', 0.015),
}
