import asyncio

from cogbox import AsyncCogbox


async def main():
    async with AsyncCogbox() as cogbox:
        result = await cogbox.snapshot.list(page=2, limit=10)
        for snapshot in result.items:
            print(f"{snapshot.name} ({snapshot.image_name})")


if __name__ == "__main__":
    asyncio.run(main())
