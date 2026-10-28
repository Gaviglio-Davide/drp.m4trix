// ============================================================
// Temi visivi del mondo 3D, selezionabili dall'utente.
//  - cartoon: il look originale, colorato e morbido
//  - medievale: atmosfera realistica che si sposa con i
//    modelli medievali (cavaliere, taverne, draghi ecc.)
// ============================================================

export type WorldStyle = 'cartoon' | 'medievale'

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

export const SCENE_THEMES: Record<WorldStyle, SceneTheme> = {
  cartoon: {
    id: 'cartoon',
    label: 'Cartoon',
    icon: '🌈',
    sky: '#bfe3f2',
    fogColor: '#bfe3f2',
    fogNear: 70,
    fogFar: 170,
    ocean: '#3f9db8',
    sand: '#e8d5a3',
    grass: '#7fb069',
    sunIntensity: 1.35,
    ambientIntensity: 0.55,
    hemiSky: '#cfe8ff',
    hemiGround: '#8a9a6b',
    hemiIntensity: 0.5,
    sunPosition: [18, 28, 12],
    turbidity: 5,
    rayleigh: 0.6,
  },
  medievale: {
    id: 'medievale',
    label: 'Medievale',
    icon: '🏰',
    sky: '#9fb2bb',
    fogColor: '#93a5ac',
    fogNear: 60,
    fogFar: 165,
    ocean: '#42606a',
    sand: '#a08d68',
    grass: '#6b7d53',
    sunIntensity: 1.0,
    ambientIntensity: 0.45,
    hemiSky: '#b6c3c9',
    hemiGround: '#57654a',
    hemiIntensity: 0.45,
    sunPosition: [14, 24, -10],
    turbidity: 8,
    rayleigh: 1.4,
  },
}

export const WORLD_STYLES: WorldStyle[] = ['cartoon', 'medievale']

export function getTheme(style: string | undefined | null): SceneTheme {
  const t = SCENE_THEMES[style as WorldStyle]
  return t ?? SCENE_THEMES.cartoon
}
