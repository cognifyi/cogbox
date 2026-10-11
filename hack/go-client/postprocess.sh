#!/usr/bin/env bash
set -euo pipefail

# Adds dynamic version (go:embed) and custom UserAgent to generated Go API clients.
# Usage: postprocess.sh <project-root> <package-name> <client-name>

if [ $# -lt 3 ]; then
  echo "Usage: $0 <project-root> <package-name> <client-name>" >&2
  exit 1
fi

PROJECT_ROOT="$1"
PACKAGE_NAME="$2"
CLIENT_NAME="$3"

cat > "$PROJECT_ROOT/version.go" << EOF
package ${PACKAGE_NAME}

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var _clientVersion string

var ClientVersion = strings.TrimSpace(_clientVersion)
EOF

grep -q 'UserAgent:.*"[^"]*"' "$PROJECT_ROOT/configuration.go" || { echo "ERROR: UserAgent string not found in configuration.go" >&2; exit 1; }
sed -i "s|UserAgent: *\"[^\"]*\"|UserAgent:        \"${CLIENT_NAME}/\" + ClientVersion|" "$PROJECT_ROOT/configuration.go"

# Align the generated module's go directive with the workspace toolchain floor
# (the stock OpenAPI generator emits an old go version; without this the
# committed go.mod drifts on every regeneration).
GO_VERSION="$(awk '/^go /{print $2; exit}' go.work)"
sed -i -E "s/^go 1\.[0-9]+(\.[0-9]+)?/go ${GO_VERSION}/" "$PROJECT_ROOT/go.mod"

echo "Postprocessed Go client at $PROJECT_ROOT"
