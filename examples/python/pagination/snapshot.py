from cogbox import Cogbox


def main():
    cogbox = Cogbox()

    result = cogbox.snapshot.list(page=2, limit=10)
    for snapshot in result.items:
        print(f"{snapshot.name} ({snapshot.image_name})")


if __name__ == "__main__":
    main()
