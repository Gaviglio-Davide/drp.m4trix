import { db } from '../src/lib/db'
async function main() {
  const users = await db.user.findMany({ select: { id: true, email: true, name: true, accentColor: true } })
  console.log('USERS:', JSON.stringify(users))
  const projects = await db.project.findMany({ select: { id: true, name: true, ownerId: true } })
  console.log('PROJECTS:', JSON.stringify(projects))
  await db.$disconnect()
}
main()
