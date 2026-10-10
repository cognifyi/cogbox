&nbsp;

<div align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://github.com/cognifyi/cogbox/raw/main/assets/images/Cogbox-logotype-white.png">
    <source media="(prefers-color-scheme: light)" srcset="https://github.com/cognifyi/cogbox/raw/main/assets/images/Cogbox-logotype-black.png">
    <img alt="Cogbox logo" src="https://github.com/cognifyi/cogbox/raw/main/assets/images/Cogbox-logotype-black.png" width="50%">
  </picture>
</div>

<h3 align="center">
  Run AI Code.
  <br/>
  Secure and Elastic Infrastructure for
  Running Your AI-Generated Code.
</h3>

<p align="center">
    <a href="https://cogbox.pazity.com/docs"> Documentation </a>·
    <a href="https://github.com/cognifyi/cogbox/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=%F0%9F%90%9B+Bug+Report%3A+"> Report Bug </a>·
    <a href="https://github.com/cognifyi/cogbox/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=%F0%9F%9A%80+Feature%3A+"> Request Feature </a>·
    <a href="https://go.cogbox.pazity.com/slack"> Join our Slack </a>·
    <a href="https://x.com/daytonaio"> Connect on X </a>
</p>

&nbsp;

Cogbox is a secure and elastic infrastructure runtime for AI-generated code execution and agent workflows. Our open-source platform provides [sandboxes](https://cogbox.pazity.com/docs/sandboxes/), full composable computers with complete isolation, a dedicated kernel, filesystem, network stack, and allocated vCPU, RAM, and disk.

Sandboxes are the core component of the Cogbox platform, spinning up in under 90ms from code to execution and running any code in Python, TypeScript, and JavaScript. Built on OCI/Docker compatibility, massive parallelization, and unlimited persistence, sandboxes deliver consistent, predictable environments for agent workflows.

Agents and developers interact with sandboxes programmatically using the Cogbox [SDKs](https://cogbox.pazity.com/docs/#3-install-the-sdk), [API](https://cogbox.pazity.com/docs/tools/api/#cogbox/), and [CLI](https://cogbox.pazity.com/docs/tools/cli/). Operations span sandbox lifecycle management, filesystem operations, process and code execution, and runtime configuration through base images, packages, and tooling. Our stateful environment [snapshots](https://cogbox.pazity.com/docs/snapshots/) enable persistent agent operations across sessions, making Cogbox the ideal foundation for AI agent architectures.

## Features

Cogbox provides an extensive set of features and tools for interacting with sandboxes.

- **Platform**: governance and operational controls for organizations standardizing on Cogbox
- **Sandboxes**: isolated full composable computers that execute workloads and retain state
- **Agent tools**: programmatic capabilities for application code, agents, and integrations
- **Human tools**: interfaces and remote sessions for interacting with sandboxes
- **System tools**: platform-level hooks and controls for lifecycle events and network access

| Platform                                                                   | Sandboxes                                                               | Agent tools                                                                       | Human tools                                                               | System tools                                                  |
| :------------------------------------------------------------------------- | :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------- | :------------------------------------------------------------------------ | :------------------------------------------------------------ |
| [Organizations](https://cogbox.pazity.com/docs/organizations/)                | [Environment](https://cogbox.pazity.com/docs/configuration/)               | [Process & code execution](https://cogbox.pazity.com/docs/process-code-execution/)   | [Dashboard](https://cogbox.pazity.com/docs/getting-started#dashboard)        | [Webhooks](https://cogbox.pazity.com/docs/webhooks/)             |
| [API Keys](https://cogbox.pazity.com/docs/api-keys/)                          | [Snapshots](https://cogbox.pazity.com/docs/snapshots/)                     | [File system operations](https://cogbox.pazity.com/docs/file-system-operations/)     | [Web terminal](https://cogbox.pazity.com/docs/web-terminal/)                 | [Network limits](https://cogbox.pazity.com/docs/network-limits/) |
| [Limits](https://cogbox.pazity.com/docs/limits/)                              | [Declarative builder](https://cogbox.pazity.com/docs/declarative-builder/) | [Language server protocol](https://cogbox.pazity.com/docs/language-server-protocol/) | [SSH access](https://cogbox.pazity.com/docs/ssh-access/)                     |                                                               |
| [Billing](https://cogbox.pazity.com/docs/billing/)                            | [Volumes](https://cogbox.pazity.com/docs/volumes/)                         | [Computer use](https://cogbox.pazity.com/docs/computer-use/)                         | [VNC access](https://cogbox.pazity.com/docs/vnc-access/)                     |                                                               |
| [Audit logs](https://cogbox.pazity.com/docs/audit-logs/)                      | [Regions](https://cogbox.pazity.com/docs/regions/)                         | [MCP server](https://cogbox.pazity.com/docs/mcp/)                                    | [VPN connection](https://cogbox.pazity.com/docs/vpn-connections/)            |                                                               |
| [OpenTelemetry](https://cogbox.pazity.com/docs/experimental/otel-collection/) |                                                                         | [Git operations](https://cogbox.pazity.com/docs/git-operations/)                     | [Preview](https://cogbox.pazity.com/docs/preview/)                           |                                                               |
| [Integrations](https://cogbox.pazity.com/docs/guides/)                        |                                                                         | [Pseudo terminal (PTY)](https://cogbox.pazity.com/docs/pty/)                         | [Custom preview proxy](https://cogbox.pazity.com/docs/custom-preview-proxy/) |                                                               |
| [Security exhibit](https://cogbox.pazity.com/docs/security-exhibit/)          |                                                                         | [Log streaming](https://cogbox.pazity.com/docs/log-streaming/)                       | [Playground](https://cogbox.pazity.com/docs/playground/)                     |                                                               |

## Architecture

Cogbox platform is organized into multiple plane components, each serving a specific purpose. A detailed overview of each component is available in the [architecture documentation](https://cogbox.pazity.com/docs/architecture/).

- **Interface plane**: provides client interfaces for interacting with Cogbox
- **Control plane**: orchestrates all sandbox operations
- **Compute plane**: runs and manages sandbox instances

### Applications

Runnable applications and services for the Cogbox platform. Each directory is a deployable or buildable component, available in the [apps](apps) directory.

- [`api`](apps/api): NestJS-based RESTful service; primary entry point for all platform operations
- [`cli`](apps/cli): Go command-line interface access to core features for interacting with sandboxes
- [`daemon`](apps/daemon): code execution agent that runs inside each sandbox
- [`dashboard`](apps/dashboard): web user interface for visual sandbox management
- [`docs`](apps/docs): documentation content; website published to [cogbox.pazity.com/docs](https://cogbox.pazity.com/docs/)
- [`otel-collector`](apps/otel-collector): trace and metric collection for Cogbox SDK operations
- [`proxy`](apps/proxy): reverse proxy for custom routing and preview URLs
- [`runner`](apps/runner): compute nodes that power Cogbox's compute plane and run sandboxes
- [`snapshot-manager`](apps/snapshot-manager): orchestrates the creation of sandbox snapshots
- [`ssh-gateway`](apps/ssh-gateway): standalone SSH gateway that accepts authenticated `ssh` connections

### Client libraries

Client libraries integrate the Cogbox platform from application code through developer-facing SDKs backed by OpenAPI-generated REST clients and toolbox API clients. Each directory is a publishable package for a specific language or runtime, available in the [libs](libs) directory.

#### Python

```bash
pip install cogbox
```

Standalone packages and libraries for interacting with Cogbox using Python:

> [`sdk-python`](libs/sdk-python) • [`api-client-python`](libs/api-client-python) • [`api-client-python-async`](libs/api-client-python-async) • [`toolbox-api-client-python`](libs/toolbox-api-client-python) • [`toolbox-api-client-python-async`](libs/toolbox-api-client-python-async)

#### TypeScript

```bash
npm install @cogbox/sdk
```

Standalone packages and libraries for interacting with Cogbox using TypeScript:

> [`sdk-typescript`](libs/sdk-typescript) • [`api-client`](libs/api-client) • [`toolbox-api-client`](libs/toolbox-api-client)

#### Ruby

```bash
gem install cogbox
```

Standalone packages and libraries for interacting with Cogbox using Ruby:

> [`sdk-ruby`](libs/sdk-ruby) • [`api-client-ruby`](libs/api-client-ruby) • [`toolbox-api-client-ruby`](libs/toolbox-api-client-ruby)

#### Go

```bash
go get github.com/cognifyi/cogbox/libs/sdk-go
```

Standalone packages and libraries for interacting with Cogbox using Go:

> [`sdk-go`](libs/sdk-go) • [`api-client-go`](libs/api-client-go) • [`toolbox-api-client-go`](libs/toolbox-api-client-go)

#### Java

Gradle (`build.gradle.kts`):

```kotlin
dependencies {
    implementation("io.cogbox:sdk:x.y.z")
}
```

Maven (`pom.xml`):

```xml
<dependency>
  <groupId>io.cogbox</groupId>
  <artifactId>sdk</artifactId>
  <version>x.y.z</version>
</dependency>
```

Standalone packages and libraries for interacting with Cogbox using Java:

> [`sdk-java`](libs/sdk-java) • [`api-client-java`](libs/api-client-java) • [`toolbox-api-client-java`](libs/toolbox-api-client-java)

## Deployments

Cogbox is available as a managed service on [cogbox.pazity.com](https://cogbox.pazity.com). Cogbox can run as a fully hosted service, as an open-source stack you operate, or in a hybrid setup where Cogbox orchestrates sandboxes while execution happens on machines you manage.

- [Open source deployment](https://cogbox.pazity.com/docs/oss-deployment/): full local stack from the [`docker`](docker) directory using Docker Compose
- [Customer managed compute](https://cogbox.pazity.com/docs/runners/): custom regions and runner machines that operate Cogbox sandboxes on your own compute infrastructure

## Quick Start

1. Create an account at [cogbox.pazity.com](https://cogbox.pazity.com)
2. Generate an [API key](https://cogbox.pazity.com/dashboard/keys)
3. Create a sandbox

### Python SDK

```py
from cogbox import Cogbox, CogboxConfig

config = CogboxConfig(api_key="YOUR_API_KEY")
cogbox = Cogbox(config)
sandbox = cogbox.create()
response = sandbox.process.code_run('print("Hello World!")')
print(response.result)
```

### Typescript SDK

```jsx
import { Cogbox } from "@cogbox/sdk";

const cogbox = new Cogbox({ apiKey: "YOUR_API_KEY" });
const sandbox = await cogbox.create();
const response = await sandbox.process.codeRun('print("Hello World!")');
console.log(response.result);
```

### Ruby SDK

```ruby
require 'cogbox'

config = Cogbox::Config.new(api_key: 'YOUR_API_KEY')
cogbox = Cogbox::Cogbox.new(config)
sandbox = cogbox.create
response = sandbox.process.code_run(code: 'print("Hello World!")')
puts response.result
```

### Go SDK

```go
package main

import (
  "context"
  "fmt"
  "github.com/cognifyi/cogbox/libs/sdk-go/pkg/cogbox"
  "github.com/cognifyi/cogbox/libs/sdk-go/pkg/types"
)

func main() {
  config := &types.CogboxConfig{APIKey: "YOUR_API_KEY"}
  client, _ := cogbox.NewClientWithConfig(config)
  ctx := context.Background()
  sandbox, _ := client.Create(ctx, nil)
  response, _ := sandbox.Process.ExecuteCommand(ctx, "echo 'Hello World!'")
  fmt.Println(response.Result)
}
```

### Java SDK

```java
import io.cogbox.sdk.Cogbox;
import io.cogbox.sdk.CogboxConfig;
import io.cogbox.sdk.Sandbox;
import io.cogbox.sdk.model.ExecuteResponse;

public class Main {
  public static void main(String[] args) {
    CogboxConfig config = new CogboxConfig.Builder()
        .apiKey("YOUR_API_KEY")
        .build();
    try (Cogbox cogbox = new Cogbox(config)) {
      Sandbox sandbox = cogbox.create();
      ExecuteResponse response = sandbox.getProcess().executeCommand("echo 'Hello World!'");
      System.out.println(response.getResult());
    }
  }
}
```

### API

```bash
curl 'https://cogbox.pazity.com/api/sandbox' \
  --request POST \
  --header 'Authorization: Bearer <YOUR_API_KEY>' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

### CLI

```bash
cogbox create
```

## Development

### Devcontainer (full environment)

Open this repository in a [devcontainer](https://containers.dev/)-compatible editor (VS Code, GitHub Codespaces) for a batteries-included setup with all languages, tools, and supporting services.

### Nix (lightweight, agent-friendly)

If you prefer working outside the devcontainer — or are an AI agent executing build commands — use the Nix dev shells:

```bash
# Enter the full dev shell (Go + Node + Python + Ruby + JDK)
nix develop

# Or pick a language-specific shell
nix develop .#go       # Go services & libs
nix develop .#node     # TypeScript / Node.js apps & libs
nix develop .#python   # Python SDKs & libs
nix develop .#ruby     # Ruby SDKs & libs
nix develop .#java     # Java SDKs & libs
```

**Prerequisites:** [Nix](https://nixos.org/download/) with flakes enabled (`experimental-features = nix-command flakes` in `~/.config/nix/nix.conf`).

For non-interactive / CI usage:

```bash
nix develop .#go --command bash -c "go build ./..."
```

Optional: Install [direnv](https://direnv.net/) + [nix-direnv](https://github.com/nix-community/nix-direnv) for automatic shell activation when you `cd` into the project.

See [`AGENTS.md`](AGENTS.md) for the full shell reference, project-to-shell mapping, and common commands.

> **Note:** Supporting services (PostgreSQL, Redis, etc.) are still managed via `docker compose -f .devcontainer/docker-compose.yaml up`.

---

## Contributing

> [!NOTE]
> Cogbox is Open Source under the [GNU AFFERO GENERAL PUBLIC LICENSE](LICENSE), and is the [copyright of its contributors](NOTICE). If you would like to contribute to the software, read the [Developer Certificate of Origin Version 1.1](https://developercertificate.org/) and the [contributing guide](CONTRIBUTING.md) to get started.
