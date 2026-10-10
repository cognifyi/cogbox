# Cogbox Python SDK

The official Python SDK for [Cogbox](https://cogbox.pazity.com), a secure and elastic infrastructure for running AI-generated code. Cogbox provides full composable computers — [sandboxes](https://cogbox.pazity.com/docs/en/sandboxes/) — that you can manage programmatically using the Cogbox SDK.

The SDK provides an interface for sandbox management, file system operations, Git operations, language server protocol support, process and code execution, and computer use. For more information, see the [documentation](https://cogbox.pazity.com/docs/en/python-sdk/).

## Installation

Install the package using **pip**:

```bash
pip install cogbox
```

## Get API key

Generate an API key from the [Cogbox Dashboard ↗](https://cogbox.pazity.com/dashboard/keys) to authenticate SDK requests and access Cogbox services. For more information, see the [API keys](https://cogbox.pazity.com/docs/en/api-keys/) documentation.

## Configuration

Configure the SDK using [environment variables](https://cogbox.pazity.com/docs/en/configuration/#environment-variables) or by passing a [configuration object](https://cogbox.pazity.com/docs/en/configuration/#configuration-in-code):

- `COGBOX_API_KEY`: Your Cogbox [API key](https://cogbox.pazity.com/docs/en/api-keys/)
- `COGBOX_API_URL`: The Cogbox [API URL](https://cogbox.pazity.com/docs/en/tools/api/)
- `COGBOX_TARGET`: Your target [region](https://cogbox.pazity.com/docs/en/regions/) environment (e.g. `us`, `eu`)

```python
from cogbox import Cogbox, CogboxConfig

# Initialize with environment variables
cogbox = Cogbox()

# Initialize with configuration object
config = CogboxConfig(
    api_key="YOUR_API_KEY",
    api_url="YOUR_API_URL",
    target="us"
)
```

## Create a sandbox

Create a sandbox to run your code securely in an isolated environment.

```python
from cogbox import Cogbox, CogboxConfig

config = CogboxConfig(api_key="YOUR_API_KEY")
cogbox = Cogbox(config)
sandbox = cogbox.create()
response = sandbox.process.code_run('print("Hello World")')
```

## Examples and guides

Cogbox provides [examples](https://cogbox.pazity.com/docs/en/getting-started/#examples) and [guides](https://cogbox.pazity.com/docs/en/guides/) for common sandbox operations, best practices, and a wide range of topics, from basic usage to advanced topics, showcasing various types of integrations between Cogbox and other tools.

### Create a sandbox with custom resources

Create a sandbox with [custom resources](https://cogbox.pazity.com/docs/en/sandboxes/#resources) (CPU, memory, disk).

```python
from cogbox import Cogbox, CreateSandboxFromImageParams, Image, Resources

cogbox = Cogbox()
sandbox = cogbox.create(
    CreateSandboxFromImageParams(
        image=Image.debian_slim("3.12"),
        resources=Resources(cpu=2, memory=4, disk=8)
    )
)
```

### Create an ephemeral sandbox

Create an [ephemeral sandbox](https://cogbox.pazity.com/docs/en/sandboxes/#ephemeral-sandboxes) that is automatically deleted when stopped.

```python
from cogbox import Cogbox, CreateSandboxFromSnapshotParams

cogbox = Cogbox()
sandbox = cogbox.create(
    CreateSandboxFromSnapshotParams(ephemeral=True, auto_stop_interval=5)
)
```

### Create a sandbox from a snapshot

Create a sandbox from a [snapshot](https://cogbox.pazity.com/docs/en/snapshots/).

```python
from cogbox import Cogbox, CreateSandboxFromSnapshotParams

cogbox = Cogbox()
sandbox = cogbox.create(
    CreateSandboxFromSnapshotParams(
        snapshot="my-snapshot-name",
        language="python"
    )
)
```

### Execute Commands

Execute commands in the sandbox.

```python
# Execute a shell command
response = sandbox.process.exec('echo "Hello, World!"')
print(response.result)

# Run Python code
response = sandbox.process.code_run('''
x = 10
y = 20
print(f"Sum: {x + y}")
''')
print(response.result)
```

### File Operations

Upload, download, and search files in the sandbox.

```python
# Upload a file
sandbox.fs.upload_file(b'Hello, World!', 'path/to/file.txt')

# Download a file
content = sandbox.fs.download_file('path/to/file.txt')

# Search for files
matches = sandbox.fs.find_files(root_dir, 'search_pattern')
```

### Git Operations

Clone, list branches, and add files to the sandbox.

```python
# Clone a repository
sandbox.git.clone('https://github.com/example/repo', 'path/to/clone')

# List branches
branches = sandbox.git.branches('path/to/repo')

# Add files
sandbox.git.add('path/to/repo', ['file1.txt', 'file2.txt'])
```

### Language Server Protocol

Create and start a language server to get code completions, document symbols, and more.

```python
# Create and start a language server
lsp = sandbox.create_lsp_server('python', 'path/to/project')
lsp.start()

# Notify the lsp for the file
lsp.did_open('path/to/file.py')

# Get document symbols
symbols = lsp.document_symbols('path/to/file.py')

# Get completions
completions = lsp.completions('path/to/file.py', {"line": 10, "character": 15})
```

Code in [\_sync](./src/cogbox/_sync/) directory shouldn't be edited directly. It should be generated from the corresponding async code in the [\_async](./src/cogbox/_async/) directory using the SDK generation scripts in the [scripts](./scripts/) directory.
