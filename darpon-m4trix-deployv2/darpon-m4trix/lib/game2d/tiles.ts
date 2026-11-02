// ============================================================
// Registro dei tile del Game Studio.
// Il numero nel grid della scena corrisponde a un TileDef.
// ============================================================

export type TileDef = {
  id: number
  name: string
  solid: boolean
  /** danno al secondo se ci cammini sopra */
  damage?: number
  /** porta: transizione o chiusa a chiave */
  door?: 'free' | 'locked'
  /** colore di fallback se la palette non copre il tile */
  color?: string
}

export const TILES: Record<number, TileDef> = {
  0: { id: 0, name: 'Pavimento', solid: false },
  1: { id: 1, name: 'Muro', solid: true },
  2: { id: 2, name: 'Acqua', solid: true },
  3: { id: 3, name: 'Lava', solid: false, damage: 16 },
  4: { id: 4, name: 'Erba', solid: false },
  5: { id: 5, name: 'Strada', solid: false },
  6: { id: 6, name: 'Porta chiusa', solid: false, door: 'locked' },
  7: { id: 7, name: 'Porta', solid: false, door: 'free' },
  8: { id: 8, name: 'Vuoto', solid: true },
}

export const SOLID_TILE = (t: number): boolean => TILES[t]?.solid ?? true
export const DOOR_TILE = (t: number): 'free' | 'locked' | undefined =>
  TILES[t]?.door
export const TILE_DAMAGE = (t: number): number => TILES[t]?.damage ?? 0

/** palette editor: colori rappresentativi per i bottoni tile */
export const TILE_SWATCH: Record<number, string> = {
  0: '#101624',
  1: '#2b3a66',
  2: '#062a4a',
  3: '#ff2bd6',
  4: '#1c3320',
  5: '#3a3222',
  6: '#ff2bd6',
  7: '#00f0ff',
  8: '#000000',
}
