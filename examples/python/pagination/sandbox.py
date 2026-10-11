from cogbox import Cogbox, ListSandboxesQuery, SandboxListSortDirection, SandboxListSortField, SandboxState


def main():
    cogbox = Cogbox()

    for sandbox in cogbox.list(
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
    main()
