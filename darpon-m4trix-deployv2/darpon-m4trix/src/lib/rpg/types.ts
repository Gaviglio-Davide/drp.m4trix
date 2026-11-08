'use client'

// ============================================================
// darpon.m4trix — V13 HUB RPG
// Tipi dei dati che trasformano un gioco in un RPG vero:
//  - STORIA (trama e capitoli)
//  - PERSONAGGI (protagonista, alleati, nemici, boss, PNG)
//  - DIALOGHI ad albero con scelte ed effetti
//  - PERCORSI PNG (camminano per le loro strade nel mondo)
//  - OGGETTI (armi, armature, pozioni, amuleti, da missione)
//  - ALBERO ABILITÀ (potenziamenti a nodi con requisiti)
//  - MAGIE (proiettile, cura, scudo, area)
//  - CASE ENTRABILI (scene interne raggiunte dalle porte)
// Tutto opzionale e retrocompatibile: vive dentro settings.rpg
// del GameProject esistente (nessuna migrazione del DB).
// ============================================================

export type RpgRole = 'protagonista' | 'alleato' | 'nemico' | 'boss' | 'png'

export type RpgCharacter = {
  id: string
  name: string
  role: RpgRole
  desc: string
  hp: number
  dmg: number
  speed: number // moltiplicatore
  color: string
  modelUrl?: string | null // GLB opzionale tra i progetti importati
}

export type DialogueAction =
  | { kind: 'nessuna' }
  | { kind: 'missione'; questId: string }
  | { kind: 'dai'; itemId: string }
  | { kind: 'cura' }
  | { kind: 'negozio' }

export type DialogueChoice = {
  id: string
  text: string
  next?: string | null // nodo successivo (null = chiudi)
  action?: DialogueAction
}

export type DialogueNode = {
  id: string
  text: string
  choices: DialogueChoice[]
}

export type RpgDialogue = {
  id: string
  characterId: string
  title: string
  start: string // id nodo iniziale
  nodes: DialogueNode[]
}

export type NpcRoute = {
  id: string
  characterId: string
  sceneId: string
  loop: boolean // torna al primo punto (patrullamento)
  speed: number // tile/s
  waypoints: { x: number; y: number }[] // coordinate tile nella scena
}

export type Rarity = 'comune' | 'raro' | 'epico' | 'leggendario'

export type RpgItemKind = 'arma' | 'armatura' | 'pozione' | 'amuleto' | 'missione'

export type RpgItem = {
  id: string
  name: string
  kind: RpgItemKind
  desc: string
  dmg?: number // arma
  def?: number // armatura/amuleto
  heal?: number // pozione
  mana?: number // pozione di mana
  rarity: Rarity
  price: number
  icon: string // emoji
}

export type SkillEffect = {
  dmg?: number // + danni flat
  hp?: number // + vita max
  stamina?: number // + stamina max
  mana?: number // + mana max
  speed?: number // % velocità
  crit?: number // % critico
  parry?: boolean // sblocca parafrasi perfetta
  spell?: string // sblocca magia (id)
  regen?: number // rigenerazione stamina/s
}

export type SkillNode = {
  id: string
  name: string
  desc: string
  cost: number // punti abilità
  req: string[] // id nodi richiesti
  effect: SkillEffect
  icon: string
}

export type SpellKind = 'proiettile' | 'cura' | 'scudo' | 'area'

export type RpgSpell = {
  id: string
  name: string
  kind: SpellKind
  mana: number
  dmg?: number
  heal?: number
  cd: number // ricarica in secondi
  color: string
  icon: string
}

export type CombatOptions = {
  parry: boolean // parata al momento giusto (tasto destro/F)
  dodge: boolean // schivata volteggiata (Shift/E)
  sprint: boolean // corsa con stamina
  mana: boolean // sistema magico
  combo: boolean // combo e colpi critici
  xp: boolean // esperienza e livelli
}

export type RpgStory = {
  logline: string // una frase: di cosa parla il gioco
  synopsis: string // la storia completa
  chapters: { title: string; text: string }[]
}

export type QuestState = {
  id: string
  title: string
  done: boolean
}

export type RpgConfig = {
  story?: RpgStory
  characters?: RpgCharacter[]
  dialogues?: RpgDialogue[]
  routes?: NpcRoute[]
  items?: RpgItem[]
  skills?: SkillNode[]
  spells?: RpgSpell[]
  combat?: Partial<CombatOptions>
  startItems?: string[] // id oggetti in inventario all'avvio
  xpPerKill?: number
  interiorNote?: string
}

// ---------------- default ----------------

export const DEFAULT_COMBAT: CombatOptions = {
  parry: true,
  dodge: true,
  sprint: true,
  mana: true,
  combo: true,
  xp: true,
}

export const RARITY_LABEL: Record<Rarity, string> = {
  comune: 'Comune',
  raro: 'Raro',
  epico: 'Epico',
  leggendario: 'Leggendario',
}

export const RARITY_COLOR: Record<Rarity, string> = {
  comune: '#9aa4b2',
  raro: '#4aa3ff',
  epico: '#b26bff',
  leggendario: '#ffb43a',
}

export const ITEM_KIND_LABEL: Record<RpgItemKind, string> = {
  arma: '⚔ Arma',
  armatura: '🛡 Armatura',
  pozione: '🧪 Pozione',
  amuleto: '📿 Amuleto',
  missione: '📜 Oggetto missione',
}

export const ROLE_LABEL: Record<RpgRole, string> = {
  protagonista: '★ Protagonista',
  alleato: '🤝 Alleato',
  nemico: '👹 Nemico',
  boss: '👑 Boss',
  png: '🚶 PNG (vita del mondo)',
}

export const SPELL_KIND_LABEL: Record<SpellKind, string> = {
  proiettile: '✨ Proiettile magico',
  cura: '💚 Cura',
  scudo: '🔵 Scudo',
  area: '💥 Esplosione ad area',
}

/** albero abilità di serie, pronto da usare e modificabile */
export function defaultSkills(): SkillNode[] {
  return [
    { id: 'vigore', name: 'Vigore', desc: '+20 vita massima', cost: 1, req: [], effect: { hp: 20 }, icon: '❤️' },
    { id: 'forza', name: 'Forza bruta', desc: '+4 danni con le armi', cost: 1, req: [], effect: { dmg: 4 }, icon: '⚔️' },
    { id: 'respiro', name: 'Respiro', desc: '+25 stamina massima', cost: 1, req: [], effect: { stamina: 25 }, icon: '💨' },
    { id: 'atleta', name: 'Atleta', desc: '+12% velocità di movimento', cost: 2, req: ['respiro'], effect: { speed: 12 }, icon: '🏃' },
    { id: 'parata', name: 'Parafrasi perfetta', desc: 'Sblocca la parata: premi F al momento giusto', cost: 2, req: ['vigore'], effect: { parry: true }, icon: '🛡️' },
    { id: 'critico', name: 'Colpo critico', desc: '+15% probabilità di colpo critico', cost: 2, req: ['forza'], effect: { crit: 15 }, icon: '💥' },
    { id: 'magia', name: 'Vena arcana', desc: '+30 mana massima', cost: 1, req: [], effect: { mana: 30 }, icon: '🔮' },
    { id: 'rigenerazione', name: 'Secondo fiato', desc: '+4 stamina rigenerata al secondo', cost: 2, req: ['atleta'], effect: { regen: 4 }, icon: '🌀' },
    { id: 'maestro', name: 'Maestro d\u2019armi', desc: '+6 danni e +10% critico', cost: 3, req: ['critico'], effect: { dmg: 6, crit: 10 }, icon: '🗡️' },
  ]
}

/** magie di serie */
export function defaultSpells(): RpgSpell[] {
  return [
    { id: 'sfera', name: 'Sfera di fuoco', kind: 'proiettile', mana: 12, dmg: 14, cd: 1.2, color: '#ff7a2b', icon: '🔥' },
    { id: 'cura', name: 'Luce guaritrice', kind: 'cura', mana: 18, heal: 30, cd: 5, color: '#7cffb2', icon: '💚' },
    { id: 'scudo', name: 'Barriera arcana', kind: 'scudo', mana: 22, cd: 10, color: '#4aa3ff', icon: '🔵' },
    { id: 'nova', name: 'Nova di ghiaccio', kind: 'area', mana: 26, dmg: 20, cd: 6, color: '#9fd8ff', icon: '❄️' },
  ]
}

export function emptyRpg(): RpgConfig {
  return {
    characters: [],
    dialogues: [],
    routes: [],
    items: [],
    skills: [],
    spells: [],
    combat: { ...DEFAULT_COMBAT },
    startItems: [],
    xpPerKill: 20,
  }
}

export function parseRpg(v: unknown): RpgConfig | null {
  if (!v || typeof v !== 'object') return null
  // conservazione permissiva: ciò che non è riconosciuto resta com'è
  return v as RpgConfig
}
