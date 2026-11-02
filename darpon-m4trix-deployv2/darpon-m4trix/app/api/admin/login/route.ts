import { NextRequest, NextResponse } from 'next/server'
import {
  adminPassword,
  clearAdminSession,
  createAdminSession,
  isAdmin,
  rateLimitAdmin,
  usingDefaultAdminPassword,
} from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    admin: await isAdmin(),
    usingDefaultPassword: usingDefaultAdminPassword(),
  })
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local'
  if (!rateLimitAdmin(ip)) {
    return NextResponse.json(
      { error: 'Troppi tentativi, riprova tra qualche minuto' },
      { status: 429 }
    )
  }
  const body = await req.json().catch(() => ({}))
  const password = String(body.password ?? '')
  if (password !== adminPassword()) {
    return NextResponse.json({ error: 'Password admin errata' }, { status: 401 })
  }
  await createAdminSession()
  return NextResponse.json({ admin: true })
}

export async function DELETE() {
  await clearAdminSession()
  return NextResponse.json({ admin: false })
}
