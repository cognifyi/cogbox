# Agent Development Guide

This project uses **Nix flakes** to provide reproducible development environments outside of the devcontainer. When working on this codebase, use the appropriate Nix dev shell to ensure all build tools, language runtimes, and dependencies are available.

## Prerequisites

- **Nix** with flakes enabled — [install guide](https://nixos.org/download/)
- Enable flakes: add `experimental-features = nix-command flakes` to `~/.config/nix/nix.conf`

## Available Dev Shells

| Shell | Command | Languages / Tools |
|---|---|---|
| `default` | `nix develop` | Go + Node.js + Python + Ruby + JDK (everything) |
| `go` | `nix develop .#go` | Go, golangci-lint, protobuf, buf |
| `node` | `nix develop .#node` | Node.js 22, Yarn 4 (via corepack) |
| `python` | `nix develop .#python` | Python 3.12, Poetry |
| `ruby` | `nix develop .#ruby` | Ruby 3.4, Bundler |
| `java` | `nix develop .#java` | JDK 17, Gradle |

## Running Commands in Nix Shells

### Interactive (human use)

```bash
nix develop .#go    # drops you into a shell with Go tools
```

### Non-interactive (agent / CI use)

Use `--command` to run a single command inside the shell and exit:

```bash
nix develop .#go     --command bash -c "go build ./apps/cli/..."
nix develop .#node   --command bash -c "yarn install && yarn build"
nix develop .#python --command bash -c "poetry install && poetry run pytest"
nix develop .#ruby   --command bash -c "bundle install && bundle exec rspec"
```

For short commands you can also use:

```bash
nix develop .#go --command go test ./libs/sdk-go/...
nix develop .#go --command golangci-lint run ./apps/runner/...
```

## Project → Shell Mapping

Use this table to determine which shell to enter for a given directory.

### Go projects → `nix develop .#go`

| Directory | Description |
|---|---|
| `apps/cli` | CLI application |
| `apps/daemon` | Background daemon service |
| `apps/proxy` | Network proxy |
| `apps/runner` | Code execution service |
| `apps/snapshot-manager` | Snapshot management |
| `apps/ssh-gateway` | SSH gateway |
| `apps/otel-collector/exporter` | OpenTelemetry exporter |
| `libs/sdk-go` | Go SDK |
| `libs/api-client-go` | Go API client |
| `libs/common-go` | Shared Go utilities |
| `libs/computer-use` | Computer use library |
| `libs/toolbox-api-client-go` | Go toolbox API client |

All Go modules are coordinated via `go.work` at the repo root.

### Node.js / TypeScript projects → `nix develop .#node`

| Directory | Description | Build |
|---|---|---|
| `apps/api` | NestJS backend API | `npx nx build api` (Webpack) |
| `apps/dashboard` | React SPA dashboard | `npx nx build dashboard` (Vite) |
| `apps/docs` | Astro documentation site | `npx nx build docs` |
| `libs/sdk-typescript` | TypeScript SDK | `npx nx build sdk-typescript` |
| `libs/api-client` | TypeScript API client | `npx nx build api-client` |
| `libs/toolbox-api-client` | TypeScript toolbox API client | `npx nx build toolbox-api-client` |
| `libs/analytics-api-client` | Analytics API client | `npx nx build analytics-api-client` |
| `libs/runner-api-client` | Runner API client | `npx nx build runner-api-client` |
| `libs/opencode-plugin` | OpenCode plugin | `npx nx build opencode-plugin` |

All TS/Node projects are managed via **Nx** with **Yarn 4** workspaces.

### Python projects → `nix develop .#python`

| Directory | Description |
|---|---|
| `libs/sdk-python` | Python SDK |
| `libs/api-client-python` | Python API client |
| `libs/api-client-python-async` | Python async API client |
| `libs/toolbox-api-client-python` | Python toolbox API client |
| `libs/toolbox-api-client-python-async` | Python async toolbox API client |
| `examples/python` | Python SDK examples |
| `guides/python` | Python guides |

All Python packages are managed via **Poetry** from the root `pyproject.toml`.

### Ruby projects → `nix develop .#ruby`

| Directory | Description |
|---|---|
| `libs/sdk-ruby` | Ruby SDK |
| `libs/api-client-ruby` | Ruby API client |
| `libs/toolbox-api-client-ruby` | Ruby toolbox API client |
| `examples/ruby` | Ruby SDK examples |

Ruby gems are managed via **Bundler** using the root `Gemfile`.

### Java projects → `nix develop .#java`

| Directory | Description |
|---|---|
| `libs/sdk-java` | Java SDK |
| `libs/api-client-java` | Java API client (auto-generated) |
| `libs/toolbox-api-client-java` | Java toolbox API client (auto-generated) |
| `examples/java` | Java SDK examples |

All Java projects use **Gradle** (Kotlin DSL) with the Gradle wrapper.

## Common Build & Test Commands

### Go

```bash
# Build all Go modules
nix develop .#go --command bash -c "go build ./..."

# Build a specific app
nix develop .#go --command bash -c "go build ./apps/runner/..."

# Run tests for a specific module
nix develop .#go --command bash -c "go test ./libs/sdk-go/..."

# Run tests for all Go modules
nix develop .#go --command bash -c "go test ./..."

# Lint
nix develop .#go --command bash -c "golangci-lint run ./apps/runner/..."

# Generate swagger docs
nix develop .#go --command bash -c "swag init -g apps/daemon/cmd/main.go"

# Generate netleash eBPF bindings (clang + libbpf + kernel headers are in the go shell)
nix develop .#go --command bash -c "cd libs/netleash && make generate"

# Tidy all modules
nix develop .#go --command bash -c 'for d in apps/*/go.mod libs/*/go.mod; do (cd "$(dirname "$d")" && go mod tidy); done'
```

### Node.js / TypeScript

```bash
# Install dependencies (required first)
nix develop .#node --command bash -c "yarn install"

# Build everything
nix develop .#node --command bash -c "yarn build"

# Build a specific project
nix develop .#node --command bash -c "npx nx build api"
nix develop .#node --command bash -c "npx nx build dashboard"

# Run tests
nix develop .#node --command bash -c "npx nx test api"
nix develop .#node --command bash -c "npx nx test dashboard"

# Lint
nix develop .#node --command bash -c "yarn lint:ts"

# Format
nix develop .#node --command bash -c "npx nx format:write"

# Serve (development)
nix develop .#node --command bash -c "npx nx serve api"
nix develop .#node --command bash -c "npx nx serve dashboard"

# Generate API clients
nix develop .#node --command bash -c "yarn generate:api-client"

# Database migrations
nix develop .#node --command bash -c "yarn migration:run:pre-deploy"
```

### Python

```bash
# Install dependencies
nix develop .#python --command bash -c "poetry install"

# Run tests (specific lib)
nix develop .#python --command bash -c "cd libs/sdk-python && poetry run pytest"

# Lint
nix develop --command bash -c "yarn lint:py"

# Format
nix develop --command bash -c "yarn format:py"

# Type check
nix develop .#python --command bash -c "poetry run basedpyright"

# Build a Python library
nix develop .#python --command bash -c "cd libs/sdk-python && poetry build"
```

### Ruby

```bash
# Install dependencies
nix develop .#ruby --command bash -c "bundle install"

# Run tests
nix develop .#ruby --command bash -c "bundle exec rspec"

# Lint
nix develop .#ruby --command bash -c "bundle exec rubocop"

# Format
nix develop .#ruby --command bash -c "bundle exec rubocop -A"
```

### Java

```bash
# Build the SDK
nix develop .#java --command bash -c "cd libs/sdk-java && ./gradlew build"

# Run tests
nix develop .#java --command bash -c "cd libs/sdk-java && ./gradlew test"

# Build API clients
nix develop .#java --command bash -c "cd libs/api-client-java && ./gradlew build"
nix develop .#java --command bash -c "cd libs/toolbox-api-client-java && ./gradlew build"

# Build an example
nix develop .#java --command bash -c "cd examples/java && ./gradlew :exec-command:build"

# Generate docs
nix develop .#java --command bash -c "cd libs/sdk-java && ./gradlew javadoc"

# Clean
nix develop .#java --command bash -c "cd libs/sdk-java && ./gradlew clean"
```

### Cross-language (use default shell)

```bash
# Full monorepo build
nix develop --command bash -c "yarn install && yarn build"

# Full lint (all languages)
nix develop --command bash -c "yarn lint"

# Full format (all languages)
nix develop --command bash -c "yarn format"

# Generate all API clients (requires JDK — only in default shell)
nix develop --command bash -c "yarn generate:api-client"
```

## Monorepo Orchestration

This project uses **Nx** as its monorepo orchestrator. Key commands:

```bash
# See the project dependency graph
npx nx graph

# Run a target for a specific project
npx nx <target> <project>

# Run a target for all projects
npx nx run-many --target=<target> --all

# Run only affected projects (based on git changes)
npx nx affected --target=<target>
```

Available Nx targets: `build`, `test`, `lint`, `serve`, `format`, `docker`, `docs`, `tidy`, `generate:api-client`

## Environment Variables

These are set automatically by the Nix shell hooks:

| Variable | Value | Shell(s) |
|---|---|---|
| `GOPATH` | `$HOME/go` | go, default |
| `GOBIN` | `$GOPATH/bin` | go, default |
| `NX_DAEMON` | `true` | node, default |
| `NODE_ENV` | `development` | node, default |
| `COREPACK_ENABLE_DOWNLOAD_PROMPT` | `0` | node, default |
| `POETRY_VIRTUALENVS_IN_PROJECT` | `true` | python, default |
| `RUBYLIB` | `libs/{sdk,api-client,toolbox-api-client}-ruby/lib` | ruby, default |
| `BUNDLE_GEMFILE` | `$PWD/Gemfile` | ruby, default |
| `BUNDLE_PATH` | `$PWD/.bundle` | ruby, default |
| `JAVA_HOME` | Nix JDK 17 path | java, default |

## Supporting Services

The Nix shells provide **build tools only**. Runtime services (PostgreSQL, Redis, Dex, MinIO, Jaeger, etc.) are still managed via Docker Compose:

```bash
docker compose -f .devcontainer/docker-compose.yaml up -d postgres redis dex
```

See `.devcontainer/docker-compose.yaml` for the full list of available services.

## Troubleshooting

### `yarn: command not found`

Yarn 4.x is provided via a corepack wrapper in the Nix shell. Make sure you entered the `node` or `default` shell. If the issue persists:

```bash
corepack enable --install-directory ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"
```

### Go tools (swag, gow, gomarkdoc) not found

These are installed on first shell entry via `go install`. If they fail, install manually:

```bash
go install github.com/swaggo/swag/cmd/swag@v1.16.4
go install github.com/mitranim/gow@latest
go install github.com/princjef/gomarkdoc/cmd/gomarkdoc@v1.1.0
```

### Nix flake not evaluating

```bash
# Check flake syntax
nix flake check

# Update inputs (if packages are missing)
nix flake update
```

### direnv not activating

```bash
# Allow the .envrc
direnv allow

# Verify nix-direnv is installed
nix-env -q nix-direnv
```

<!-- BEGIN: AUTO-GENERATED NEGATIVE CONSTRAINTS -->
> 自动生成，请勿手改。完整账本：`omni nc list`。
- NC-397: Ship blocked high-risk: semantic reward_hacking=[superficial_compliance] ADI=0.0, ship_results risk_level=high (reward_hacking, step_failure, deploy_test_failed, execution_failed), deploy_test_passed=false source=cogos_unavailable,…
- NC-396: Security claims unproven: Keycloak JWT org_id + aud=cogbox plumbing, 401/403/503 mapping, no-secrets, BILLING_UI_V2 gate have no command/test/file_exists assertion — failure invisible to operator; skill_review marks Spec UNVERIFIABLE,…
- NC-395: Environment preflight miss: step-01 failed at current_step_index 1 on l0:repo_tests `npx nx run dashboard:build` with `Could not find Nx modules, Have you run npm/yarn install?` — 5/6 steps never attempted (pending), session failed=true
- NC-394: Untraceable spec: issue body empty, dag_id empty, all spec_anchors:[] — BL-03 wallet and BL-04 invoices untraceable, minimum-change unverifiable
- NC-393: forbidden_paths=[tests/] on steps 01-04 blocked BL-03/BL-04 contract and error-mapping tests while delivering 15 source files — REGRESSION RULE violated, testing deferred to step-05 reconcile.test.ts + billing.spec.ts
- NC-392: Zero executable assertions: all 6 steps assertions:[] — 19/19 expected_artifacts uncovered per plan_review, unexecutable acceptance batch; step-01 l0:artifacts passed but no verifies for 401/403/502-504/flag_disabled
- NC-391: NC-385: micro-steps with empty assertions and flat compile_mode with no verifies for 401 unauthenticated, 403 org_claim_required, 502/503/504 fail-closed
- NC-390: NC-384: forbidden_paths=[tests/] blocking BL-03/BL-04 contract and error-mapping tests
- NC-389: NC-383: import.meta.env plumbing in Jest/nx-covered dashboard lib code without vite-jest interop
- NC-388: NC-382: custom BILLING_UI_V2/VITE_BILLING_UI_V2 flag gate defaulting to flag_disabled that disables existing billing paths in repo tests
- NC-384: do not set forbidden_paths=[tests/] to block BL-03/BL-04 contract and error-mapping tests
<!-- END: AUTO-GENERATED NEGATIVE CONSTRAINTS -->
