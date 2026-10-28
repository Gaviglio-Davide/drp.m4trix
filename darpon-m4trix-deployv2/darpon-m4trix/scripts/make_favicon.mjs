// Genera la favicon "falò stile Dark Souls": spada conficcata nella
// cenere con fiamme a strati. Output: src/app/icon.png (512),
// src/app/apple-icon.png (180), anteprima 32px in build-test.
import sharp from 'sharp'
import { mkdirSync } from 'fs'

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.58" r="0.55">
      <stop offset="0%" stop-color="#ff9d2e" stop-opacity="0.38"/>
      <stop offset="55%" stop-color="#ff7f2a" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#ff7f2a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="fOuter" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#c2410c"/>
      <stop offset="55%" stop-color="#f2620f"/>
      <stop offset="100%" stop-color="#ff9d2e"/>
    </linearGradient>
    <linearGradient id="fMid" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#f97316"/>
      <stop offset="100%" stop-color="#ffb347"/>
    </linearGradient>
    <linearGradient id="fCore" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0%" stop-color="#ffb347"/>
      <stop offset="100%" stop-color="#ffe08a"/>
    </linearGradient>
    <linearGradient id="blade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#8a8a94"/>
      <stop offset="45%" stop-color="#5c5c66"/>
      <stop offset="100%" stop-color="#33333b"/>
    </linearGradient>
  </defs>

  <ellipse cx="256" cy="310" rx="165" ry="150" fill="url(#glow)"/>

  <!-- fiamma esterna -->
  <path fill="url(#fOuter)" stroke="#7c2d12" stroke-width="7" stroke-linejoin="round" d="
    M128 422
    C 104 384, 132 356, 122 316
    C 144 330, 156 300, 148 266
    C 166 282, 182 262, 184 228
    C 196 246, 210 234, 214 206
    C 222 176, 236 162, 250 128
    C 254 118, 258 118, 262 128
    C 276 162, 290 176, 298 206
    C 302 234, 316 246, 328 228
    C 330 262, 346 282, 364 266
    C 356 300, 368 330, 390 316
    C 380 356, 408 384, 384 422
    C 348 448, 164 448, 128 422 Z"/>

  <!-- fiamma media -->
  <path fill="url(#fMid)" d="
    M158 424
    C 140 392, 162 368, 154 340
    C 174 352, 184 332, 184 310
    C 200 322, 214 302, 218 276
    C 230 292, 242 274, 246 248
    C 250 224, 254 210, 262 196
    C 270 210, 274 224, 278 248
    C 282 274, 294 292, 306 276
    C 310 302, 324 322, 340 310
    C 340 332, 350 352, 370 340
    C 362 368, 384 392, 366 424
    C 330 446, 194 446, 158 424 Z"/>

  <!-- spada conficcata (punta in giù) -->
  <g>
    <circle cx="256" cy="112" r="17" fill="#3f3f47" stroke="#6e6e78" stroke-width="5"/>
    <rect x="245" y="126" width="22" height="48" rx="7" fill="#4a382c"/>
    <line x1="248" y1="138" x2="264" y2="138" stroke="#6b543f" stroke-width="4"/>
    <line x1="248" y1="152" x2="264" y2="152" stroke="#6b543f" stroke-width="4"/>
    <rect x="193" y="172" width="126" height="19" rx="9.5" fill="#4c4c55"/>
    <rect x="200" y="177" width="112" height="4" rx="2" fill="#74747e"/>
    <path fill="url(#blade)" d="M241 191 L271 191 L271 330 Q271 348 256 362 Q241 348 241 330 Z"/>
    <rect x="253" y="196" width="5" height="150" fill="#9c9ca6" opacity="0.85"/>
  </g>

  <!-- nucleo fiamma davanti alla lama -->
  <path fill="url(#fCore)" opacity="0.92" d="
    M206 420
    C 196 392, 214 376, 210 352
    C 224 362, 234 348, 236 326
    C 244 340, 252 330, 254 306
    C 256 322, 262 336, 270 326
    C 272 348, 280 362, 294 352
    C 290 376, 308 392, 298 420
    C 272 436, 230 436, 206 420 Z"/>

  <!-- monticello di cenere -->
  <path fill="#2e2a26" d="M118 430 C 150 396, 362 396, 394 430 C 396 444, 390 452, 372 452 L 140 452 C 122 452, 116 444, 118 430 Z"/>
  <path fill="#45403a" d="M150 414 C 190 396, 322 396, 362 414 C 330 404, 182 404, 150 414 Z"/>
  <circle cx="150" cy="436" r="11" fill="#57504a"/>
  <circle cx="360" cy="434" r="9" fill="#57504a"/>
  <circle cx="336" cy="444" r="6" fill="#6a625a"/>
  <rect x="163" y="424" width="26" height="8" rx="4" fill="#cfc7b8" transform="rotate(-14 176 428)"/>

  <!-- scintille -->
  <circle cx="312" cy="140" r="5" fill="#ffd97a" opacity="0.95"/>
  <circle cx="204" cy="176" r="4" fill="#ffb347" opacity="0.9"/>
  <circle cx="340" cy="206" r="4" fill="#ff9d42" opacity="0.85"/>
  <circle cx="182" cy="252" r="4.5" fill="#ffd97a" opacity="0.8"/>
  <circle cx="330" cy="118" r="3" fill="#ffe08a" opacity="0.9"/>
</svg>`

mkdirSync('/home/z/my-project/src/app', { recursive: true })
mkdirSync('/home/z/my-project/build-test', { recursive: true })

const buf = Buffer.from(svg)
await sharp(buf).png().toFile('/home/z/my-project/src/app/icon.png')
await sharp(buf).resize(180, 180).png().toFile('/home/z/my-project/src/app/apple-icon.png')
await sharp(buf).resize(32, 32).png().toFile('/home/z/my-project/build-test/icon-preview-32.png')
await sharp(buf).resize(64, 64).png().toFile('/home/z/my-project/build-test/icon-preview-64.png')
console.log('favicon generate ✓')
