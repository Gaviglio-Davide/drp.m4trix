import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'

// ============================================================
// Area admin: sessione separata da quella utente, protetta da
// password (variabile d'ambiente ADMIN_PASSWORD su Vercel).
// ============================================================

const ADMIN_COOKIE = 'darponmatrix_admin'
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'darpon-m4trix-dev-secret-change-me-0189273'
)

export const DEFAULT_ADMIN_PASSWORD = 'darpon-admin-2026'

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD
}

/** true se ADMIN_PASSWORD non è impostata (si usa quella predefinita) */
export function usingDefaultAdminPassword(): boolean {
  return !process.env.ADMIN_PASSWORD
}

export async function createAdminSession(): Promise<void> {
  const token = await new SignJWT({ role: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('12h')
    .sign(SECRET)
  // Stessa logica https/iframe della sessione utente (vedi auth.ts)
  const h = await headers()
  const proto = (h.get('x-forwarded-proto') ?? 'http')
    .split(',')[0]
    .trim()
    .toLowerCase()
  const isHttps = proto === 'https'
  const store = await cookies()
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 60 * 60 * 12,
    path: '/',
  })
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies()
  store.delete(ADMIN_COOKIE)
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies()
  const token = store.get(ADMIN_COOKIE)?.value
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, SECRET)
    return payload.role === 'admin'
  } catch {
    return false
  }
}

/** Da usare in cima a ogni /api/admin/*: ritorna una risposta 401 o null */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdmin()) return null
  return NextResponse.json({ error: 'Area riservata agli amministratori' }, { status: 401 })
}

// ------------------------------------------------------------
// Limite semplice ai tentativi di login admin (in-memory):
// max 8 tentativi per IP ogni 5 minuti.
// ------------------------------------------------------------
const attempts = new Map<string, { count: number; reset: number }>()

export function rateLimitAdmin(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.reset < now) {
    attempts.set(key, { count: 1, reset: now + 5 * 60 * 1000 })
    return true
  }
  entry.count += 1
  return entry.count <= 8
}
