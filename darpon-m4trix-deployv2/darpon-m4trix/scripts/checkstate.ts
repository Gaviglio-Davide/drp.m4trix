import { db } from '../src/lib/db'
async function main() {
  const p = await db.project.findFirst({ where: { name: 'Castello di Davide' } })
  console.log('STATE:', p?.state?.slice(0, 200))
  await db.$disconnect()
}
main()
