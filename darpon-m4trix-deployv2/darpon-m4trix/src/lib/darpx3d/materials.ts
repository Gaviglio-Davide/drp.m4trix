// ============================================================
// Darpx3D · materials — materiali PBR generati dalle parole
// "spada d'oro" → metallo dorato lucido · "taverna di legno" →
// legno caldo ruvido · "drago di ghiaccio" → tinte gelide.
// Nessuna texture esterna: tutto colore + parametri PBR.
// ============================================================

import * as THREE from 'three'
import type { RNG } from './rng'

export type MatStyle = {
  id: string
  color?: THREE.ColorRepresentation
  metalness: number
  roughness: number
  emissive?: THREE.ColorRepresentation
  emissiveIntensity?: number
  opacity?: number
  flatShading?: boolean
  side?: THREE.Side
}

// ---------- vocabolario colori IT/EN ----------

export const COLOR_WORDS: Record<string, THREE.ColorRepresentation> = {
  rosso: '#c0392b', red: '#c0392b', cremisi: '#b03030', scarlatto: '#cf2f2f',
  blu: '#2563a8', blue: '#2563a8', azzurro: '#4f9fd8', celeste: '#7fb8e6',
  turchese: '#22a2b8', teal: '#1f8f8f',
  verde: '#3f8f4f', green: '#3f8f4f', smeraldo: '#1f9d63', verde_acqua: '#3aa6a0',
  giallo: '#e0b13a', yellow: '#e0b13a', oro: '#d9a72e', golden: '#d9a72e', dorato: '#d9a72e',
  ambra: '#d99a2e', ambra_colore: '#d99a2e',
  arancio: '#e0762e', arancione: '#e0762e', orange: '#e0762e',
  viola: '#7c4fa8', purple: '#7c4fa8', lavanda: '#a78bcb', lilla: '#b18fd8',
  fucsia: '#c2368f', magenta: '#c2368f', rosa: '#e087ab', pink: '#e087ab',
  nero: '#26262b', black: '#26262b', carbone: '#1f1f24', onice: '#222228',
  bianco: '#eeeeea', white: '#eeeeea', avorio: '#efe9d8', neve: '#f2f5f7',
  grigio: '#8a8a90', gray: '#8a8a90', grigia: '#8a8a90', argento: '#c4c8cf', silver: '#c4c8cf',
  marrone: '#7a5230', brown: '#7a5230', castagna: '#71462a', caffè: '#5d4634', cafe: '#5d4634',
  beige: '#d8c9a8', sabbia: '#dcc9a0', sand: '#dcc9a0', crema: '#eadfc4',
  ocra: '#c98f3d', ruggine: '#a35a2e', terra: '#9a6a45',
  indaco: '#3d4a9e', navy: '#23366b', petrolio: '#1f5f70',
  bronzo: '#b0793c', bronze: '#b0793c', rame: '#c47a4a', copper: '#c47a4a',
  giada: '#4fa87f', jade: '#4fa87f', smeraldo_colore: '#1f9d63',
  ciliegia: '#a52a3f', lavanda_colore: '#a78bcb', corallo: '#e2705c',
}

// ---------- stili di materiale ----------

const STYLES: Record<string, MatStyle> = {
  metallo: { id: 'metallo', metalness: 0.92, roughness: 0.36 },
  oro: { id: 'oro', color: '#d9a72e', metalness: 0.95, roughness: 0.28 },
  argento: { id: 'argento', color: '#c9ced6', metalness: 0.95, roughness: 0.22 },
  ferro: { id: 'ferro', color: '#5c6068', metalness: 0.9, roughness: 0.5 },
  acciaio: { id: 'acciaio', color: '#9aa3ad', metalness: 0.95, roughness: 0.3 },
  bronzo: { id: 'bronzo', color: '#b0793c', metalness: 0.9, roughness: 0.42 },
  rame: { id: 'rame', color: '#c47a4a', metalness: 0.92, roughness: 0.38 },
  legno: { id: 'legno', color: '#8a5a33', metalness: 0.02, roughness: 0.82 },
  quercia: { id: 'quercia', color: '#7d5230', metalness: 0.02, roughness: 0.85 },
  pino: { id: 'pino', color: '#a87a4a', metalness: 0.02, roughness: 0.8 },
  ebano: { id: 'ebano', color: '#3a2c22', metalness: 0.05, roughness: 0.7 },
  pietra: { id: 'pietra', color: '#9a958c', metalness: 0.0, roughness: 0.95 },
  granito: { id: 'granito', color: '#8d8a86', metalness: 0.0, roughness: 0.92 },
  marmo: { id: 'marmo', color: '#e8e6e0', metalness: 0.0, roughness: 0.25 },
  sabbia: { id: 'sabbia', color: '#dcc9a0', metalness: 0.0, roughness: 0.98 },
  pelle: { id: 'pelle', color: '#d9a380', metalness: 0.0, roughness: 0.65 },
  squame: { id: 'squame', metalness: 0.25, roughness: 0.45 },
  tessuto: { id: 'tessuto', metalness: 0.0, roughness: 0.95 },
  velluto: { id: 'velluto', metalness: 0.0, roughness: 0.85 },
  cuoio: { id: 'cuoio', color: '#7a4f2c', metalness: 0.05, roughness: 0.7 },
  pelliccia: { id: 'pelliccia', metalness: 0.0, roughness: 1.0 },
  cristallo: { id: 'cristallo', metalness: 0.1, roughness: 0.08, opacity: 0.72, emissiveIntensity: 0.25 },
  gemma: { id: 'gemma', metalness: 0.2, roughness: 0.12, emissiveIntensity: 0.3 },
  vetro: { id: 'vetro', metalness: 0.0, roughness: 0.05, opacity: 0.45 },
  fuoco: { id: 'fuoco', color: '#ff7a26', metalness: 0.0, roughness: 0.6, emissive: '#ff6a00', emissiveIntensity: 1.6 },
  lava: { id: 'lava', color: '#d84a12', metalness: 0.0, roughness: 0.7, emissive: '#ff4400', emissiveIntensity: 1.2 },
  ghiaccio: { id: 'ghiaccio', color: '#a8dcf0', metalness: 0.05, roughness: 0.15, opacity: 0.85, emissive: '#4a9fd8', emissiveIntensity: 0.18 },
  neve: { id: 'neve', color: '#f4f8fa', metalness: 0.0, roughness: 0.9 },
  ombra: { id: 'ombra', color: '#241f2e', metalness: 0.3, roughness: 0.6, emissive: '#150f22', emissiveIntensity: 0.35 },
  ossa: { id: 'ossa', color: '#e6ddc8', metalness: 0.0, roughness: 0.75 },
  fungo: { id: 'fungo', metalness: 0.0, roughness: 0.6 },
  carta: { id: 'carta', color: '#efe6cf', metalness: 0.0, roughness: 0.95 },
}

const STYLE_WORDS: Record<string, string> = {
  metallo: 'metallo', metal: 'metallo', metallico: 'metallo', metallic: 'metallo',
  oro: 'oro', gold: 'oro', dorato: 'oro', golden: 'oro', aureo: 'oro',
  argento: 'argento', silver: 'argento', argentato: 'argento',
  ferro: 'ferro', iron: 'ferro', acciaio: 'acciaio', steel: 'acciaio',
  bronzo: 'bronzo', bronze: 'bronzo', rame: 'rame', copper: 'rame',
  legno: 'legno', wooden: 'legno', di_legno: 'legno', quercia: 'quercia', rovere: 'quercia',
  pino: 'pino', ebano: 'ebano',
  pietra: 'pietra', stone: 'pietra', di_pietra: 'pietra', roccia: 'pietra', granito: 'granito',
  marmo: 'marmo', marble: 'marmo', sabbia: 'sabbia', sand: 'sabbia',
  pelle: 'pelle', skin: 'pelle', cuoio: 'cuoio', leather: 'cuoio',
  tessuto: 'tessuto', cloth: 'tessuto', stoffa: 'tessuto', velluto: 'velluto', velvet: 'velluto',
  pelliccia: 'pelliccia', fur: 'pelliccia', pelo: 'pelliccia',
  cristallo: 'cristallo', crystal: 'cristallo', di_cristallo: 'cristallo',
  gemma: 'gemma', vetro: 'vetro', glass: 'vetro',
  fuoco: 'fuoco', fire: 'fuoco', fiamma: 'fuoco', fiammeggiante: 'fuoco', fiammante: 'fuoco',
  lava: 'lava', magma: 'lava', ghiaccio: 'ghiaccio', ice: 'ghiaccio', gelo: 'ghiaccio', ghiacciato: 'ghiaccio', icy: 'ghiaccio',
  neve: 'neve', snowy: 'neve', innevato: 'neve',
  ombra: 'ombra', shadow: 'ombra', oscuro: 'ombra', tenebra: 'ombra', tenebroso: 'ombra',
  osso: 'ossa', ossa: 'ossa', bone: 'ossa', ivory: 'ossa',
}

// ---------- tinte armoniose di riserva (quando il colore non è detto) ----------

const HARMONY_SETS: THREE.ColorRepresentation[][] = [
  ['#7fa86b', '#5d8a4f', '#c9b458', '#8a6a42'],   // bosco
  ['#8f5a3a', '#6a3f28', '#c98f5a', '#3f2c20'],   // terra
  ['#4a6f9e', '#31517a', '#7fa8cf', '#28405c'],   // mare
  ['#9e4a4a', '#7a2f34', '#c97a6a', '#5c2328'],   // sangue
  ['#5a4a8f', '#3f3470', '#8f7ac9', '#2c245c'],   // notte
  ['#8f7a4a', '#6f5a30', '#c9b478', '#4a3c22'],   // deserto
  ['#4a8f88', '#2f7068', '#7ac9bd', '#1f5450'],   // palude
  ['#8f4a6f', '#702f52', '#c97a9e', '#54243c'],   // orchidea
]

export type MatBag = {
  /** materiale principale (corpo/torce/legno) */
  primary: THREE.MeshStandardMaterial
  /** secondario (pancia/interni/dettagli) */
  secondary: THREE.MeshStandardMaterial
  /** dettaglio (occhi, gemme, emissivi) */
  accent: THREE.MeshStandardMaterial
  /** materiale "punte" (corna/claws/artigli) */
  horn: THREE.MeshStandardMaterial
  /** materiale membrana (ali/veli) */
  membrane: THREE.MeshStandardMaterial
  byId: (id: string) => THREE.MeshStandardMaterial
}

/** costruisce il set di materiali dal testo del prompt e dal seed */
export function buildMaterials(
  promptNorm: string,
  rng: RNG,
  colorHex?: THREE.ColorRepresentation,
  styleHint?: string
): MatBag {
  // stile rilevato (hint dal parser, con fallback sul testo)
  let styleId = styleHint ?? ''
  if (!styleId) {
    for (const w of Object.keys(STYLE_WORDS)) {
      if (promptNorm.includes(w)) {
        styleId = STYLE_WORDS[w]
        break
      }
    }
  }
  // colore rilevato
  let color: THREE.ColorRepresentation | undefined = colorHex
  if (!color) {
    for (const w of Object.keys(COLOR_WORDS)) {
      if (promptNorm.includes(w)) {
        color = COLOR_WORDS[w]
        break
      }
    }
  }
  const harmony = rng.pick(HARMONY_SETS)

  const base = STYLES[styleId] ?? STYLES.metallo
  const baseCol = new THREE.Color(color ?? harmony[0])
  // deriva il secondario: più chiaro e caldo
  const secCol = new THREE.Color(harmony[1]).lerp(baseCol, 0.35)

  const mk = (s: MatStyle, c: THREE.ColorRepresentation, mul = 1): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c),
      metalness: THREE.MathUtils.clamp(s.metalness * mul, 0, 1),
      roughness: THREE.MathUtils.clamp(s.roughness * (1 + (1 - mul) * 0.2), 0.03, 1),
      flatShading: s.flatShading ?? false,
    })
    if (s.emissive) {
      m.emissive = new THREE.Color(s.emissive)
      m.emissiveIntensity = s.emissiveIntensity ?? 0.5
    }
    if (s.opacity !== undefined && s.opacity < 1) {
      m.transparent = true
      m.opacity = s.opacity
    }
    return m
  }

  const primary = mk(base, baseCol)
  const secondary = mk(
    { ...base, metalness: base.metalness * 0.6 },
    secCol
  )
  const accent = new THREE.MeshStandardMaterial({
    color: new THREE.Color(styleId === 'fuoco' || styleId === 'lava' ? '#ffd24a' : color ?? '#ffd24a'),
    emissive: new THREE.Color(styleId === 'fuoco' || styleId === 'lava' ? '#ff9500' : color ?? '#ffb02e'),
    emissiveIntensity: 0.9,
    roughness: 0.4,
  })
  const horn = new THREE.MeshStandardMaterial({
    color: new THREE.Color(styleId === 'ombra' ? '#3a3448' : '#e6ddc8'),
    roughness: 0.55,
    metalness: 0.05,
  })
  const membrane = new THREE.MeshStandardMaterial({
    color: baseCol.clone().lerp(new THREE.Color('#f0d8c8'), 0.25),
    roughness: 0.75,
    metalness: 0.05,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.96,
  })

  const extra = new Map<string, THREE.MeshStandardMaterial>()
  const byId = (id: string): THREE.MeshStandardMaterial => {
    if (id === 'primary') return primary
    if (id === 'secondary') return secondary
    if (id === 'accent') return accent
    if (id === 'horn') return horn
    if (id === 'membrane') return membrane
    if (!extra.has(id)) {
      const s = STYLES[id] ?? STYLES.metallo
      extra.set(id, mk(s, s.color ?? baseCol))
    }
    return extra.get(id)!
  }

  return { primary, secondary, accent, horn, membrane, byId }
}
