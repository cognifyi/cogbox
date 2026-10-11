// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: Apache-2.0

package cogbox

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestVersionIsTrimmedAndPresent(t *testing.T) {
	assert.NotEmpty(t, Version)
	assert.Equal(t, strings.TrimSpace(Version), Version)
}
