import { Cogbox } from '@cogbox/sdk'

async function main() {
  const cogbox = new Cogbox()

  const result = await cogbox.snapshot.list(2, 10)
  console.log(`Found ${result.total} snapshots`)
  result.items.forEach((snapshot) => console.log(`${snapshot.name} (${snapshot.imageName})`))
}

main().catch(console.error)
