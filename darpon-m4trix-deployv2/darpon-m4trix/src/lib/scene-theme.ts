// ============================================================
// Temi visivi del mondo 3D.
// v7: UN SOLO STILE — «realistico». Le vecchie scelte
// «cartoon» e «medievale» sono state ritirate: ora tutto il
// mondo (edifici, luce, erba, acqua) ha resa realistica con
// texture PBR procedurali. I progetti salvati con lo stile
// vecchio vengono mappati automaticamente su questo tema.
// ============================================================

export type WorldStyle = 'cartoon' | 'medievale' | 'realistico'

export type SceneTheme = {
  id: WorldStyle
  label: string
  icon: string
  sky: string
  fogColor: string
  fogNear: number
  fogFar: number
  ocean: string
  sand: string
  grass: string
  sunIntensity: number
  ambientIntensity: number
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  sunPosition: [number, number, number]
  turbidity: number
  rayleigh: number
}

const realistico: SceneTheme = {
  id: 'realistico',
  label: 'Realistico',
  icon: '🌿',
  // pomeriggio limpido, luce naturale calda
  sky: '#a9c4d8',
  fogColor: '#b8ccd9',
  fogNear: 78,
  fogFar: 210,
  ocean: '#2e6a7e',
  sand: '#c9b48c',
  grass: '#6d8a4e',
  sunIntensity: 1.55,
  ambientIntensity: 0.38,
  hemiSky: '#bcd6e8',
  hemiGround: '#55603f',
  hemiIntensity: 0.5,
  sunPosition: [22, 30, 14],
  turbidity: 6,
  rayleigh: 1.1,
}

export const SCENE_THEMES: Record<WorldStyle, SceneTheme> = {
  realistico,
  // mantenuti solo per retrocompatibilità dei progetti vecchi:
  // qualsiasi stile salvato in passato ora usa il tema realistico
  cartoon: realistico,
  medievale: realistico,
}

export const WORLD_STYLES: WorldStyle[] = ['realistico']

export function getTheme(style: string | undefined | null): SceneTheme {
  void style
  return SCENE_THEMES.realistico
}
