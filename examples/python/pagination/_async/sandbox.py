import asyncio

from cogbox import AsyncCogbox, ListSandboxesQuery, SandboxListSortDirection, SandboxListSortField, SandboxState


async def main():
    async with AsyncCogbox() as cogbox:
        async for sandbox in cogbox.list(
            ListSandboxesQuery(
                limit=10,
                labels={"env": "dev"},
                states=[SandboxState.STARTED],
                sort=SandboxListSortField.CREATEDAT,
                order=SandboxListSortDirection.DESC,
            )
        ):
            print(sandbox.id)


if __name__ == "__main__":
    asyncio.run(main())
