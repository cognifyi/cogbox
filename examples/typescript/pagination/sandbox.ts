import { Cogbox, SandboxListSortDirection, SandboxListSortField, SandboxState } from '@cogbox/sdk'

async function main() {
  const cogbox = new Cogbox()

  for await (const sandbox of cogbox.list({
    limit: 10,
    labels: { env: 'dev' },
    states: [SandboxState.STARTED],
    sort: SandboxListSortField.CREATED_AT,
    order: SandboxListSortDirection.DESC,
  })) {
    console.log(sandbox.id)
  }
}

main().catch(console.error)
