import { Cogbox } from '@cogbox/sdk'

async function main() {
  const cogbox = new Cogbox()

  // Default interval
  const sandbox1 = await cogbox.create()
  console.log(sandbox1.autoArchiveInterval)

  // Set interval to 1 hour
  await sandbox1.setAutoArchiveInterval(60)
  console.log(sandbox1.autoArchiveInterval)

  // Max interval
  const sandbox2 = await cogbox.create({
    autoArchiveInterval: 0,
  })
  console.log(sandbox2.autoArchiveInterval)

  // 1 day interval
  const sandbox3 = await cogbox.create({
    autoArchiveInterval: 1440,
  })
  console.log(sandbox3.autoArchiveInterval)

  await sandbox1.delete()
  await sandbox2.delete()
  await sandbox3.delete()
}

main().catch(console.error)
