# Cogbox Java SDK

The official Java SDK for [Cogbox](https://cogbox.pazity.com), a secure and elastic infrastructure for running AI-generated code. Cogbox provides full composable computers — [sandboxes](https://cogbox.pazity.com/docs/en/sandboxes/) — that you can manage programmatically using the Cogbox SDK.

The SDK provides an interface for sandbox management, file system operations, Git operations, language server protocol support, process and code execution, and computer use. For more information, see the [documentation](https://cogbox.pazity.com/docs/en/java-sdk/).

## Installation

Add the dependency using **Gradle**:

```kotlin
dependencies {
    implementation("io.cogbox:sdk:x.y.z")
}
```

or using **Maven**:

```xml
<dependency>
  <groupId>io.cogbox</groupId>
  <artifactId>sdk</artifactId>
  <version>x.y.z</version>
</dependency>
```

## Get API key

Generate an API key from the [Cogbox Dashboard ↗](https://cogbox.pazity.com/dashboard/keys) to authenticate SDK requests and access Cogbox services. For more information, see the [API keys](https://cogbox.pazity.com/docs/en/api-keys/) documentation.

## Configuration

Configure the SDK using [environment variables](https://cogbox.pazity.com/docs/en/configuration/#environment-variables) or by passing a [configuration object](https://cogbox.pazity.com/docs/en/configuration/#configuration-in-code):

- `COGBOX_API_KEY`: Your Cogbox [API key](https://cogbox.pazity.com/docs/en/api-keys/)
- `COGBOX_API_URL`: The Cogbox [API URL](https://cogbox.pazity.com/docs/en/tools/api/)
- `COGBOX_TARGET`: Your target [region](https://cogbox.pazity.com/docs/en/regions/) environment (e.g. `us`, `eu`)

```java
import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.CogboxConfig;

// Initialize with environment variables
Cogbox cogbox = new Cogbox();

// Initialize with configuration object
CogboxConfig config = new CogboxConfig.Builder()
    .apiKey("YOUR_API_KEY")
    .apiUrl("YOUR_API_URL")
    .target("us")
    .build();
Cogbox cogbox = new Cogbox(config);
```

## Create a sandbox

Create a sandbox to run your code securely in an isolated environment.

```java
import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Sandbox;
import io.cogbox.sdk.model.CreateSandboxFromSnapshotParams;
import io.cogbox.sdk.model.ExecuteResponse;

try (Cogbox cogbox = new Cogbox()) {
    CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
    params.setLanguage("python");
    Sandbox sandbox = cogbox.create(params);

    ExecuteResponse response = sandbox.process.codeRun("print('Hello World!')");
    System.out.println(response.getResult());

    sandbox.delete();
}
```

## Examples and guides

Cogbox provides [examples](https://cogbox.pazity.com/docs/en/getting-started/#examples) and [guides](https://cogbox.pazity.com/docs/en/guides/) for common sandbox operations, best practices, and a wide range of topics, from basic usage to advanced topics, showcasing various types of integrations between Cogbox and other tools.

### Create a sandbox with custom resources

Create a sandbox with [custom resources](https://cogbox.pazity.com/docs/en/sandboxes/#resources) (CPU, memory, disk).

```java
import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.Image;
import io.cogbox.sdk.model.CreateSandboxFromImageParams;
import io.cogbox.sdk.model.Resources;

try (Cogbox cogbox = new Cogbox()) {
    CreateSandboxFromImageParams params = new CreateSandboxFromImageParams();
    params.setImage(Image.debianSlim("3.12"));
    params.setResources(new Resources(2, null, 4, 8));
    Sandbox sandbox = cogbox.create(params);
}
```

### Create a sandbox from a snapshot

Create a sandbox from a [snapshot](https://cogbox.pazity.com/docs/en/snapshots/).

```java
import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.model.CreateSandboxFromSnapshotParams;

try (Cogbox cogbox = new Cogbox()) {
    CreateSandboxFromSnapshotParams params = new CreateSandboxFromSnapshotParams();
    params.setSnapshot("my-snapshot-name");
    params.setLanguage("python");
    Sandbox sandbox = cogbox.create(params);
}
```

### Execute commands

Execute commands in the sandbox.

```java
// Execute a shell command
ExecuteResponse response = sandbox.process.executeCommand("echo 'Hello, World!'");
System.out.println(response.getResult());

// Run Python code
ExecuteResponse code = sandbox.process.codeRun("print('Sum:', 10 + 20)");
System.out.println(code.getResult());
```

### File operations

Upload, download, and search files in the sandbox.

```java
// Upload a file
sandbox.fs.uploadFile("Hello, World!".getBytes(), "path/to/file.txt");

// Download a file
byte[] content = sandbox.fs.downloadFile("path/to/file.txt");

// Search for files
List<Match> matches = sandbox.fs.searchFiles(rootDir, "search_pattern");
```

### Git operations

Clone, list branches, and get status in the sandbox.

```java
// Clone a repository
sandbox.git.clone("https://github.com/example/repo", "path/to/clone");

// List branches
Map<String, Object> branches = sandbox.git.branches("path/to/repo");

// Get status
GitStatus status = sandbox.git.status("path/to/repo");
```

### Language server protocol

Create and start a language server to get code completions, document symbols, and more.

```java
// Create and start a language server
LspServer lsp = sandbox.createLspServer("typescript", "path/to/project");
lsp.start("typescript", "path/to/project");

// Notify the LSP for a file
lsp.didOpen("typescript", "path/to/project", "path/to/file.ts");

// Get document symbols
List<LspSymbol> symbols = lsp.documentSymbols("typescript", "path/to/project", "path/to/file.ts");

// Get completions
CompletionList completions = lsp.completions("typescript", "path/to/project", "path/to/file.ts", 10, 15);
```
