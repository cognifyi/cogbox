from cogbox import Cogbox, CreateSandboxFromSnapshotParams


def main():
    cogbox = Cogbox()

    # Default interval
    sandbox1 = cogbox.create()
    print(sandbox1.auto_archive_interval)

    # Set interval to 1 hour
    sandbox1.set_auto_archive_interval(60)
    print(sandbox1.auto_archive_interval)

    # Max interval
    sandbox2 = cogbox.create(params=CreateSandboxFromSnapshotParams(auto_archive_interval=0))
    print(sandbox2.auto_archive_interval)

    # 1 day interval
    sandbox3 = cogbox.create(params=CreateSandboxFromSnapshotParams(auto_archive_interval=1440))
    print(sandbox3.auto_archive_interval)

    sandbox1.delete()
    sandbox2.delete()
    sandbox3.delete()


if __name__ == "__main__":
    main()
