<div align="center">

[![Documentation](https://img.shields.io/github/v/release/daytonaio/docs?label=Docs&color=23cc71)](https://cogbox.pazity.com/docs)
![License](https://img.shields.io/badge/License-AGPL--3-blue)
[![Go Report Card](https://goreportcard.com/badge/github.com/cognifyi/cogbox)](https://goreportcard.com/report/github.com/cognifyi/cogbox)
[![Issues - cogbox](https://img.shields.io/github/issues/cognifyi/cogbox)](https://github.com/cognifyi/cogbox/issues)
![GitHub Release](https://img.shields.io/github/v/release/cognifyi/cogbox)

</div>

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

<p align="center">
    <a href="https://www.producthunt.com/posts/cogbox-2?embed=true&utm_source=badge-top-post-badge&utm_medium=badge&utm_souce=badge-cogbox&#0045;2" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/top-post-badge.svg?post_id=957617&theme=neutral&period=daily&t=1746176740150" alt="Cogbox&#0032; - Secure&#0032;and&#0032;elastic&#0032;infra&#0032;for&#0032;running&#0032;your&#0032;AI&#0045;generated&#0032;code&#0046; | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
    <a href="https://www.producthunt.com/posts/cogbox-2?embed=true&utm_source=badge-top-post-topic-badge&utm_medium=badge&utm_souce=badge-cogbox&#0045;2" target="_blank"><img src="https://api.producthunt.com/widgets/embed-image/v1/top-post-topic-badge.svg?post_id=957617&theme=neutral&period=monthly&topic_id=237&t=1746176740150" alt="Cogbox&#0032; - Secure&#0032;and&#0032;elastic&#0032;infra&#0032;for&#0032;running&#0032;your&#0032;AI&#0045;generated&#0032;code&#0046; | Product Hunt" style="width: 250px; height: 54px;" width="250" height="54" /></a>
</p>

---

## Installation

### Python SDK

```bash
pip install cogbox
```

### TypeScript SDK

```bash
npm install @cogbox/sdk
```

---

## Features

- **Lightning-Fast Infrastructure**: Sub-90ms Sandbox creation from code to execution.
- **Separated & Isolated Runtime**: Execute AI-generated code with zero risk to your infrastructure.
- **Massive Parallelization for Concurrent AI Workflows**: Fork Sandbox filesystem and memory state (Coming soon!)
- **Programmatic Control**: File, Git, LSP, and Execute API
- **Unlimited Persistence**: Your Sandboxes can live forever
- **OCI/Docker Compatibility**: Use any OCI/Docker image to create a Sandbox

---

## Quick Start

1. Create an account at https://cogbox.pazity.com
1. Generate a [new API key](https://cogbox.pazity.com/dashboard/keys)
1. Follow the [Getting Started docs](https://cogbox.pazity.com/docs/getting-started/) to start using the Cogbox SDK

## Creating your first Sandbox

### Python SDK

```py
from cogbox import Cogbox, CogboxConfig, CreateSandboxBaseParams

# Initialize the Cogbox client
cogbox = Cogbox(CogboxConfig(api_key="YOUR_API_KEY"))

# Create the Sandbox instance
sandbox = cogbox.create(CreateSandboxBaseParams(language="python"))

# Run code securely inside the Sandbox
response = sandbox.process.code_run('print("Sum of 3 and 4 is " + str(3 + 4))')
if response.exit_code != 0:
    print(f"Error running code: {response.exit_code} {response.result}")
else:
    print(response.result)

# Clean up the Sandbox
cogbox.delete(sandbox)
```

### Typescript SDK

```jsx
import { Cogbox } from '@cogbox/sdk'

async function main() {
  // Initialize the Cogbox client
  const cogbox = new Cogbox({
    apiKey: 'YOUR_API_KEY',
  })

  let sandbox
  try {
    // Create the Sandbox instance
    sandbox = await cogbox.create({
      language: 'typescript',
    })
    // Run code securely inside the Sandbox
    const response = await sandbox.process.codeRun('console.log("Sum of 3 and 4 is " + (3 + 4))')
    if (response.exitCode !== 0) {
      console.error('Error running code:', response.exitCode, response.result)
    } else {
      console.log(response.result)
    }
  } catch (error) {
    console.error('Sandbox flow error:', error)
  } finally {
    if (sandbox) await cogbox.delete(sandbox)
  }
}

main().catch(console.error)
```
