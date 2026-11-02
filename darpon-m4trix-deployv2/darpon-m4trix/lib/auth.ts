import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { db, ensureSchemaOnce } from '@/lib/db'

const SESSION_COOKIE = 'darponmatrix_session'
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? 'darpon-m4trix-dev-secret-change-me-0189273'
)

export type SessionUser = {
  id: string
  email: string
  name: string | null
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(SECRET)
}

export async function setSessionCookie(userId: string) {
  const token = await createSessionToken(userId)
  // L'app spesso gira dentro un iframe cross-site (pannello di anteprima):
  // con SameSite=Lax il browser NON allega il cookie alle fetch successive
  // e ogni operazione (creare progetti, salvare) fallisce con 401 anche
  // dopo un login riuscito. Su HTTPS usiamo quindi SameSite=None + Secure,
  // valido sia nell'iframe sia in una finestra normale; in locale su http
  // restiamo su Lax perché None richiede un contesto sicuro.
  const h = await headers()
  const proto = (h.get('x-forwarded-proto') ?? 'http')
    .split(',')[0]
    .trim()
    .toLowerCase()
  const isHttps = proto === 'https'
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: isHttps ? 'none' : 'lax',
    secure: isHttps,
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  })
}

export async function clearSessionCookie() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Garantisce che le tabelle esistano anche su un database appena creato
  // (deploy Vercel + Postgres): nessun comando manuale richiesto.
  await ensureSchemaOnce().catch(() => {})
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, SECRET)
    const userId = payload.sub
    if (!userId) return null
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, accentColor: true },
    })
    return user
  } catch (e) {
    console.error('[auth] getSessionUser failed:', e)
    return null
  }
}
