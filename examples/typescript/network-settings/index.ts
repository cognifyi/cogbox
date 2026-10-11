import { Cogbox } from '@cogbox/sdk'

async function main() {
  const cogbox = new Cogbox()

  // Default settings
  const sandbox1 = await cogbox.create()
  console.log('networkBlockAll:', sandbox1.networkBlockAll)
  console.log('networkAllowList:', sandbox1.networkAllowList)

  // Block all network access
  const sandbox2 = await cogbox.create({
    networkBlockAll: true,
  })
  console.log('networkBlockAll:', sandbox2.networkBlockAll)
  console.log('networkAllowList:', sandbox2.networkAllowList)

  // Explicitly allow list of network addresses
  const sandbox3 = await cogbox.create({
    networkAllowList: '192.168.1.0/16,10.0.0.0/24',
  })
  console.log('networkBlockAll:', sandbox3.networkBlockAll)
  console.log('networkAllowList:', sandbox3.networkAllowList)

  await sandbox1.delete()
  await sandbox2.delete()
  await sandbox3.delete()
}

main().catch(console.error)
