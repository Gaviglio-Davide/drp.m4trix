import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const projects = await db.project.findMany({
    where: { ownerId: user.id },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      state: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { saves: true } },
    },
  })
  return NextResponse.json({ projects })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  if (!name) {
    return NextResponse.json(
      { error: 'Il progetto deve avere un nome' },
      { status: 400 }
    )
  }
  if (name.length > 60) {
    return NextResponse.json(
      { error: 'Nome troppo lungo (max 60 caratteri)' },
      { status: 400 }
    )
  }
  const project = await db.project.create({
    data: {
      name,
      ownerId: user.id,
      state: JSON.stringify({ objects: [], customAssets: [] }),
    },
  })
  return NextResponse.json({ project })
}
