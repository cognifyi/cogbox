// Copyright Daytona Platforms Inc.
// Copyright Cognifyi
// SPDX-License-Identifier: AGPL-3.0

package recording

import (
	"github.com/cognifyi/cogbox/daemon/pkg/recording"
)

type RecordingController struct {
	recordingService *recording.RecordingService
}

func NewRecordingController(recordingService *recording.RecordingService) *RecordingController {
	return &RecordingController{
		recordingService: recordingService,
	}
}
