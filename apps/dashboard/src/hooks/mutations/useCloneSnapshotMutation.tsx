/*
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { CloneSnapshot, SnapshotDto } from '@cogbox/api-client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../queries/queryKeys'
import { useApi } from '../useApi'

export interface CloneSnapshotMutationVariables {
  snapshotId: string
  clone: CloneSnapshot
  organizationId?: string
}

interface UseCloneSnapshotMutationOptions {
  invalidateOnSuccess?: boolean
}

export const useCloneSnapshotMutation = ({ invalidateOnSuccess = true }: UseCloneSnapshotMutationOptions = {}) => {
  const { snapshotApi } = useApi()
  const queryClient = useQueryClient()

  return useMutation<SnapshotDto, unknown, CloneSnapshotMutationVariables>({
    mutationFn: async ({ snapshotId, clone, organizationId }) => {
      if (!organizationId) {
        throw new Error('No organization selected')
      }
      const response = await snapshotApi.cloneSnapshot(snapshotId, clone, organizationId)
      return response.data
    },
    onSuccess: async (_data, { organizationId }) => {
      if (invalidateOnSuccess && organizationId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.snapshots.list(organizationId),
        })
      }
    },
  })
}
