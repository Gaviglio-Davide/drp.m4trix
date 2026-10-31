// ============================================================
// Darpx3D · parse — dal prompt in italiano (o inglese) alla
// specifica del modello. Riconosce: soggetto, specie, colori,
// materiali, taglia, caratteristiche (ali, corna, armatura…).
// È il "traduttore" tra il linguaggio umano e il generatore.
// ============================================================

import { hashSeed } from './rng'
import { COLOR_WORDS } from './materials'

export type ArchetypeId =
  | 'dragon' | 'serpent' | 'humanoid' | 'quadruped' | 'bird' | 'fish' | 'robot'
  | 'weapon' | 'shield' | 'vehicle' | 'building' | 'tree' | 'prop'

export type SizeClass = 'tiny' | 'small' | 'normal' | 'big' | 'huge'

export type GenSpec = {
  archetype: ArchetypeId
  species: string          // chiave specie ('drago', 'cavallo', 'spada'…)
  speciesLabel: string     // nome bello per l'utente
  subject: string          // prompt normalizzato
  seed: number
  sizeClass: SizeClass
  features: Set<string>    // 'wings','horns','armor','fire','spikes','saddle','helmet','crest','hood','club'
  colorHex?: string
  styleId?: string         // 'oro','legno','pietra'… (per materiali)
  held?: 'sword' | 'axe' | 'staff' | 'spear' | null
  name: string
}

// ---------- normalizzazione ----------

export function normPrompt(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s' -]/g, ' ')
    .replace(/'/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const has = (t: string, ...ws: string[]) => ws.some(w => t.includes(w))

/** corrispondenza per parola intera (evita «re» dentro «forziere», «ala» dentro «parola») */
export function hasWord(t: string, w: string): boolean {
  const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  return re.test(t)
}

// ---------- vocabolario specie ----------

type SpeciesDef = {
  key: string
  label: string
  archetype: ArchetypeId
  words: string[]
  features?: string[]
  held?: GenSpec['held']
  props?: Record<string, number | string | boolean>
}

export const SPECIES: SpeciesDef[] = [
  // ---- creature ----
  { key: 'drago', label: 'Drago', archetype: 'dragon', words: ['drago', 'draghi', 'dragon', 'drake', 'viverna', 'wyvern', 'wyvern'], features: ['wings', 'horns', 'spikes', 'scales'] },
  { key: 'serpente', label: 'Serpente', archetype: 'serpent', words: ['serpente', 'serpenti', 'biscia', 'cobra', 'vipera', 'pitone', 'snake', 'python'], features: ['scales'] },
  { key: 'cavaliere', label: 'Cavaliere', archetype: 'humanoid', words: ['cavaliere', 'cavaliera', 'knight', 'paladino', 'crociato', 'guerriero', 'warrior', 'soldato', 'soldier', 'spadaccino', 'vichingo', 'berserker'], features: ['armor', 'helmet'], held: 'sword' },
  { key: 'mago', label: 'Mago', archetype: 'humanoid', words: ['mago', 'stregone', 'strega', 'maga', 'wizard', 'negromante', 'sciamano', 'druido', 'incantatore'], features: ['hood'], held: 'staff' },
  { key: 're', label: 'Re', archetype: 'humanoid', words: ['re', 'regina', 'queen', 'king', 'principe', 'principessa', 'princess', 'imperatore'], features: ['crown', 'cape'], held: 'spear' },
  { key: 'arciere', label: 'Arciere', archetype: 'humanoid', words: ['arciere', 'arciera', 'arcier', 'cacciatore', 'ranger', 'esploratore'], features: ['hood'], held: 'spear' },
  { key: 'persona', label: 'Persona', archetype: 'humanoid', words: ['persona', 'umano', 'umana', 'uomo', 'donna', 'ragazzo', 'ragazza', 'bambino', 'bambina', 'contadino', 'villano', 'personaggio', 'character', 'ninja', 'monaco', 'bardo'], held: null },
  { key: 'gigante', label: 'Gigante', archetype: 'humanoid', words: ['gigante', 'gigantessa', 'colosso', 'titan'], features: ['club'] },
  { key: 'cavallo', label: 'Cavallo', archetype: 'quadruped', words: ['cavallo', 'cavalla', 'destriero', 'puledro', 'horse', 'pony', 'unicorn', 'unicorno'], features: ['saddle'] },
  { key: 'lupo', label: 'Lupo', archetype: 'quadruped', words: ['lupo', 'lupa', 'lupetto', 'wolf', 'cane', 'cagnolino', 'dog', 'pastore tedesco', 'volpe', 'fox', 'sciacallo'], props: { snout: 'short', tail: 'tube' } },
  { key: 'orso', label: 'Orso', archetype: 'quadruped', words: ['orso', 'orsa', 'bear', 'cinghiale'], props: { snout: 'short', bulk: 1.35 } },
  { key: 'cervo', label: 'Cervo', archetype: 'quadruped', words: ['cervo', 'cervetta', 'daino', 'renna', 'capriolo'], features: ['antlers'] },
  { key: 'leone', label: 'Leone', archetype: 'quadruped', words: ['leone', 'leonessa', 'lion', 'tigre', 'tiger', 'pantera', 'leopardo', 'giaguaro'], features: ['mane'] },
  { key: 'grifo', label: 'Grifone', archetype: 'quadruped', words: ['grifone', 'griffin', 'ippogrifo'], features: ['wings', 'beak'] },
  { key: 'aquila', label: 'Aquila', archetype: 'bird', words: ['aquila', 'aquilotto', 'eagle', 'falco', 'hawk', 'gufo', 'owl', 'corvo', 'crow', 'uccello', 'uccellino', 'bird', 'passero', 'gabbiano', 'fenice', 'phoenix', 'papero', 'anatra', 'gallo'] },
  { key: 'pesce', label: 'Pesce', archetype: 'fish', words: ['pesce', 'pesci', 'squalo', 'shark', 'trota', 'carpa', 'koi', 'delfino', 'balena', 'orca', 'pesce pagliaccio'] },
  { key: 'robot', label: 'Robot', archetype: 'robot', words: ['robot', 'androide', 'mech', 'droide', 'automa', 'golem', 'robotto'] },
  // ---- oggetti ----
  { key: 'spada', label: 'Spada', archetype: 'weapon', words: ['spada', 'spadone', 'lama', 'sciabola', 'katana', 'spadina', 'sword', 'blade', 'pugnale', 'coltello', 'daga', 'stiletto'], props: { kind: 'sword' } },
  { key: 'ascia', label: 'Ascia', archetype: 'weapon', words: ['ascia', 'scure', 'axe', 'mazza', 'mazza ferrata', 'martello', 'hammer', 'martellone', 'clava'], props: { kind: 'axe' } },
  { key: 'lancia', label: 'Lancia', archetype: 'weapon', words: ['lancia', 'picca', 'alabarda', 'giavellotto', 'spear', 'tridente'], props: { kind: 'spear' } },
  { key: 'bastone', label: 'Bastone', archetype: 'weapon', words: ['bastone', 'bacchetta', 'scettro', 'staff', 'wand', 'scettro magico'], props: { kind: 'staff' } },
  { key: 'scudo', label: 'Scudo', archetype: 'shield', words: ['scudo', 'shield', 'targhetta', 'rotella', 'roncova'] },
  { key: 'nave', label: 'Nave', archetype: 'vehicle', words: ['nave', 'veliero', 'galeone', 'ship', 'barca', 'battello', 'canoa', 'schifano', 'nave pirata'], props: { kind: 'ship' } },
  { key: 'carro', label: 'Carro', archetype: 'vehicle', words: ['carro', 'carretto', 'carriage', 'carrozza', 'carretto trainato', 'wagone', 'carro da guerra'], props: { kind: 'cart' } },
  { key: 'casa', label: 'Casa', archetype: 'building', words: ['casa', 'casetta', 'house', 'cottage', 'casupola', 'casotta', 'chalet'], props: { kind: 'house' } },
  { key: 'taverna', label: 'Taverna', archetype: 'building', words: ['taverna', 'locanda', 'osteria', 'inn', 'pub'], props: { kind: 'house', floors: 2 } },
  { key: 'torre', label: 'Torre', archetype: 'building', words: ['torre', 'tower', 'torretta', 'faro', 'torre di guardia'], props: { kind: 'tower' } },
  { key: 'castello', label: 'Castello', archetype: 'building', words: ['castello', 'castle', 'fortezza', 'rocca', 'fortino', 'cittadella', 'keep'], props: { kind: 'castle' } },
  { key: 'mulino', label: 'Mulino', archetype: 'building', words: ['mulino', 'mill', 'mulino a vento'], props: { kind: 'mill' } },
  { key: 'quercia', label: 'Quercia', archetype: 'tree', words: ['quercia', 'quercione', 'oak', 'albero secolare', 'albero', 'tree', 'salice', 'frassino', 'castagno'], props: { kind: 'broadleaf' } },
  { key: 'pino', label: 'Pino', archetype: 'tree', words: ['pino', 'abete', 'spruce', 'pine', 'conifera', 'cipresso'], props: { kind: 'pine' } },
  { key: 'palma', label: 'Palma', archetype: 'tree', words: ['palma', 'palmetta', 'palm', 'cocco'], props: { kind: 'palm' } },
  { key: 'pozione', label: 'Pozione', archetype: 'prop', words: ['pozione', 'fiala', 'ampolla', 'potion', 'elisir'], props: { kind: 'potion' } },
  { key: 'cristallo', label: 'Cristallo', archetype: 'prop', words: ['cristallo', 'crystal', 'gemma', 'gemma preziosa', 'geode', 'ametista', 'smeraldo pietra', 'quarzo'], props: { kind: 'crystal' } },
  { key: 'forziere', label: 'Forziere', archetype: 'prop', words: ['forziere', 'scrigno', 'baule', 'cassa', 'chest', 'cofanetto'], props: { kind: 'chest' } },
  { key: 'botte', label: 'Botte', archetype: 'prop', words: ['botte', 'barile', 'barilotto', 'barrel', 'cask'], props: { kind: 'barrel' } },
  { key: 'torcia', label: 'Torcia', archetype: 'prop', words: ['torcia', 'fiaccola', 'torch', 'lampione da tavolo', 'candela', 'candle', 'lanterna'], props: { kind: 'torch' } },
  { key: 'fungo', label: 'Fungo', archetype: 'prop', words: ['fungo', 'funghetto', 'mushroom', 'spugola', 'porcino'], props: { kind: 'mushroom' } },
]

// ---------- caratteristiche ----------

const FEATURE_WORDS: [string, string[]][] = [
  ['wings', ['ali', 'ala', 'alato', 'alata', 'con le ali', 'winged', 'volante', 'che vola', 'pegaso', 'pegasus']],
  ['horns', ['corna', 'cornuto', 'corno', 'corni', 'horned', 'horn', 'unicorno', 'unicorn', 'diavolo', 'demone', 'demonio']],
  ['armor', ['armatura', 'corazzato', 'corazzata', 'armored', 'armour', 'piastre', 'corazza']],
  ['fire', ['fuoco', 'fiamma', 'fiammeggiante', 'ardente', 'incendiario', 'fire', 'flaming', 'fiammante', 'fenice', 'phoenix', 'bruciante', 'magma', 'lava']],
  ['spikes', ['spine', 'spinoso', 'spinosa', 'spuntoni', 'cresta di spine', 'spiky', 'aculei', 'aculeato']],
  ['scales', ['squame', 'squamoso', 'squamosa', 'scaglioso', 'scaled', 'rettile', 'rettile']]
  ,
  ['saddle', ['sella', 'sellato', 'saddle', 'da guerra', 'da battaglia', 'bardato']],
  ['helmet', ['elmo', 'elmetto', 'elmo piumato', 'helmet', 'cimiero', 'visiera']],
  ['crest', ['cresta', 'pennacchio', 'cimiero piumato']],
  ['hood', ['cappuccio', 'incappucciato', 'hood', 'mantello']],
  ['mane', ['chioma', 'criniera', 'mane']],
  ['antlers', ['palchi', 'corna di cervo', 'corna ramificate']],
  ['beak', ['becco', 'rostro']],
  ['big', ['gigante', 'gigantesco', 'enorme', 'colossale', 'huge', 'giant', 'titano', 'immane', 'sproporzionato']],
  ['tiny', ['piccolo', 'piccola', 'minuscolo', 'minuscola', 'tiny', 'mini', 'miniatura', 'cucciolo', 'nano', 'piccoletto']],
  ['round', ['tondo', 'tonda', 'rotondo', 'circolare', 'round']],
  ['tower', ['a forma di torre', 'torre']],
  ['heart', ['a forma di cuore', 'cuore']],
]

const STYLE_HINTS: Record<string, string> = {
  pietra: 'pietra', stone: 'pietra', granito: 'granito', marmo: 'marmo', roccia: 'pietra',
  legno: 'legno', wooden: 'legno', ebano: 'ebano', quercia: 'quercia',
  oro: 'oro', dorato: 'oro', golden: 'oro', gold: 'oro', aureo: 'oro',
  argento: 'argento', silver: 'argento', ferro: 'ferro', acciaio: 'acciaio',
  bronzo: 'bronzo', rame: 'rame', cristallo: 'cristallo', vetro: 'vetro',
  ghiaccio: 'ghiaccio', ice: 'ghiaccio', neve: 'neve', fuoco: 'fuoco', lava: 'lava',
  ombra: 'ombra', tenebra: 'ombra', ossa: 'ossa', osso: 'ossa',
}

// colori anche come aggettivo nel nome
const COLOR_LABELS: Record<string, string> = {
  rosso: 'rosso', red: 'rosso', blu: 'blu', blue: 'blu', azzurro: 'azzurro', celeste: 'celeste',
  verde: 'verde', green: 'verde', giallo: 'giallo', yellow: 'giallo', oro: 'dorato', arancio: 'arancione',
  arancione: 'arancione', orange: 'arancione', viola: 'viola', purple: 'viola', lavanda: 'lavanda',
  fucsia: 'fucsia', rosa: 'rosa', pink: 'rosa', nero: 'nero', black: 'nero', bianco: 'bianco',
  white: 'bianco', grigio: 'grigio', gray: 'grigio', argento: 'argenteo', silver: 'argenteo',
  marrone: 'marrone', brown: 'marrone', turchese: 'turchese', teal: 'turchese', indaco: 'indaco',
  smeraldo: 'smeraldo', ciliegia: 'ciliegia', corallo: 'corallo', ambra: 'ambra', ruggine: 'ruggine',
}

/** analizza il prompt → GenSpec completo */
export function parsePrompt(prompt: string, seedOverride?: number): GenSpec {
  const subject = normPrompt(prompt) || 'creatura'
  const seed = seedOverride ?? hashSeed(subject)

  // specie: prima le CREATURE (un mago con il bastone resta un mago,
  // non un bastone!), poi gli oggetti; a parità vince la parola più lunga
  const CREATURE_ARCH = ['dragon', 'serpent', 'humanoid', 'quadruped', 'bird', 'fish', 'robot']
  let best: SpeciesDef | null = null
  let bestLen = 0
  let bestIsCreature = false
  for (const sp of SPECIES) {
    const isCreature = CREATURE_ARCH.includes(sp.archetype)
    for (const w of sp.words) {
      if (!hasWord(subject, w)) continue
      const better =
        (!bestIsCreature && isCreature) ||
        (isCreature === bestIsCreature && w.length > bestLen) ||
        (!best)
      if (better) {
        best = sp
        bestLen = w.length
        bestIsCreature = isCreature
      }
    }
  }
  const species: SpeciesDef = best ?? {
    key: 'creatura',
    label: 'Creatura',
    archetype: 'dragon',
    words: [],
    features: ['horns', 'spikes'],
  }

  const features = new Set<string>(species.features ?? [])
  for (const [f, ws] of FEATURE_WORDS) {
    if (ws.some(w => hasWord(subject, w))) features.add(f)
  }
  // modificatori contestuali sensati
  if (species.key === 'unicorn' || species.key === 'cavallo') {
    if (has(subject, 'unicorn', 'unicorno')) features.add('horns')
    if (has(subject, 'pegaso', 'pegasus', 'volante', 'ali')) features.add('wings')
  }
  if (species.archetype === 'dragon' && !features.has('wings')) {
    // i draghi di default volano (a meno che non sia chiesto "senza ali")
    if (!has(subject, 'senza ali', 'ali atrofizzate', 'privo di ali')) features.add('wings')
  }
  if (species.archetype === 'humanoid' && has(subject, 'gigante', 'enorme')) features.add('big')

  // colore
  let colorHex: string | undefined
  let colorLabel = ''
  for (const w of Object.keys(COLOR_WORDS)) {
    if (hasWord(subject, w)) {
      colorHex = String(COLOR_WORDS[w])
      colorLabel = COLOR_LABELS[w] ?? ''
      break
    }
  }
  // stile materiale
  let styleId: string | undefined
  for (const w of Object.keys(STYLE_HINTS)) {
    if (hasWord(subject, w)) {
      styleId = STYLE_HINTS[w]
      break
    }
  }

  // taglia
  let sizeClass: SizeClass = 'normal'
  if (features.has('big')) sizeClass = 'huge'
  else if (has(subject, 'grande', 'grosso', 'grossa', 'imponente', 'big', 'large', 'alto', 'alta', 'lungo', 'lunga')) sizeClass = 'big'
  else if (features.has('tiny')) sizeClass = 'tiny'
  else if (has(subject, 'piccolo', 'piccola', 'cucciolo', 'mini', 'small', 'compatto', 'compatta')) sizeClass = 'small'

  // arma in mano per umanoidi
  let held: GenSpec['held'] = species.held ?? null
  if (species.archetype === 'humanoid') {
    if (has(subject, 'spada', 'sword', 'katana', 'lama')) held = 'sword'
    else if (has(subject, 'ascia', 'scure', 'axe', 'mazza', 'martello', 'clava')) held = 'axe'
    else if (has(subject, 'bastone', 'scettro', 'staff', 'bacchetta')) held = 'staff'
    else if (has(subject, 'lancia', 'spear', 'alabarda', 'tridente')) held = 'spear'
    else if (has(subject, 'senza arma', 'a mani nude', 'disarmato')) held = null
    if (features.has('club')) held = 'axe'
  }

  // nome bello
  const parts: string[] = [species.label]
  if (colorLabel) parts.push(colorLabel)
  const styleNames: Record<string, string> = {
    oro: 'dorato', argento: 'd\'argento', ferro: 'di ferro', acciaio: 'd\'acciaio',
    legno: 'di legno', pietra: 'di pietra', marmo: 'di marmo', cristallo: 'di cristallo',
    ghiaccio: 'di ghiaccio', fuoco: 'infuocato', ombra: 'd\'ombra', ossa: 'd\'ossa',
  }
  if (!colorLabel && styleId && styleNames[styleId]) parts.push(styleNames[styleId])
  const name = `${parts.join(' ')} · Darpx #${String(seed % 10000).padStart(4, '0')}`

  return {
    archetype: species.archetype,
    species: species.key,
    speciesLabel: species.label,
    subject,
    seed,
    sizeClass,
    features,
    colorHex,
    styleId,
    held,
    name,
  }
}

/** suggerimenti per la UI */
export const PROMPT_SUGGESTIONS = [
  'un drago rosso feroce con le corna',
  'un cavaliere con armatura dorata e spada',
  'una spada leggendaria d\'oro con gemma',
  'un cavallo da guerra con la sella',
  'una taverna di legno a due piani',
  'un lupo grigio della foresta',
  'un robot di ferro con il cuore luminoso',
  'un albero secolare dalle chiome grandi',
  'una pozione magica viola fumante',
  'un cristallo di ghiaccio luminoso',
]
