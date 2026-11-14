/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { DataSource } from 'typeorm'
import { OrgClaimResolver } from './org-claim-resolver'
import { OrgClaimError, OrgConflictError, OrgRequiredError, OrgUnknownError } from './utils/org-claims.util'

const ORG_A = '316db64d-45ca-4438-880b-b264e6da1ae2'
const ORG_B = '3869c44c-0000-4000-8000-000000000002'
const KC_A = '30f6952c-0000-4000-8000-00000000000a'

function makeResolver() {
  // orgs: A known by id + keycloakOrgId + name; B known by id only.
  const orgs = [
    { id: ORG_A, keycloakOrgId: KC_A, name: 'cogbox' },
    { id: ORG_B, keycloakOrgId: null, name: 'beta-org' },
  ]
  const repo = {
    findOne: jest.fn(
      async ({ where }: { where: Array<Record<string, string>> }) =>
        orgs.find((o) =>
          where.some((w) => w.id === o.id || w.keycloakOrgId === o.keycloakOrgId || w.name === o.name),
        ) ?? null,
    ),
  }
  const ds = { getRepository: () => repo } as unknown as DataSource
  return { resolver: new OrgClaimResolver(ds), repo }
}

describe('OrgClaimResolver', () => {
  it('adopts the sole claimed org without a header', async () => {
    const { resolver } = makeResolver()
    const orgId = await resolver.resolveOrganizationId({ organization: { cogbox: { id: KC_A } } }, undefined)
    expect(orgId).toBe(ORG_A)
  })

  it('resolves a KC-org-id header to canonical and accepts when in set', async () => {
    const { resolver } = makeResolver()
    const orgId = await resolver.resolveOrganizationId({ organization: { cogbox: { id: KC_A } } }, KC_A)
    expect(orgId).toBe(ORG_A)
  })

  it('multi-org with a valid selector resolves', async () => {
    const { resolver } = makeResolver()
    const orgId = await resolver.resolveOrganizationId({ organization: { a: { id: KC_A }, b: { id: ORG_B } } }, ORG_B)
    expect(orgId).toBe(ORG_B)
  })

  it('multi-org without a selector → OrgRequiredError (never first-pick)', async () => {
    const { resolver } = makeResolver()
    await expect(
      resolver.resolveOrganizationId({ organization: { a: { id: KC_A }, b: { id: ORG_B } } }, undefined),
    ).rejects.toBeInstanceOf(OrgRequiredError)
  })

  it('selector outside the claim set → OrgUnknownError', async () => {
    const { resolver } = makeResolver()
    await expect(
      resolver.resolveOrganizationId({ organization: { cogbox: { id: KC_A } } }, ORG_B),
    ).rejects.toBeInstanceOf(OrgUnknownError)
  })

  it('attribute resolving outside the set → OrgConflictError', async () => {
    const { resolver } = makeResolver()
    await expect(
      resolver.resolveOrganizationId({ organization: { cogbox: { id: KC_A } }, org_id: 'beta-org' }, undefined),
    ).rejects.toBeInstanceOf(OrgConflictError)
  })

  it('consistent dual-track attribute does not conflict', async () => {
    const { resolver } = makeResolver()
    const orgId = await resolver.resolveOrganizationId(
      { organization: { cogbox: { id: KC_A } }, org_id: 'cogbox' },
      undefined,
    )
    expect(orgId).toBe(ORG_A)
  })

  it('attribute-only tokens keep the legacy header passthrough', async () => {
    const { resolver } = makeResolver()
    await expect(resolver.resolveOrganizationId({ org_id: 'cogbox' }, 'whatever')).resolves.toBe('whatever')
    await expect(resolver.resolveOrganizationId({ org_id: 'cogbox' }, undefined)).resolves.toBeUndefined()
  })

  it('claim-free tokens keep the legacy header passthrough', async () => {
    const { resolver } = makeResolver()
    await expect(resolver.resolveOrganizationId({}, ORG_A)).resolves.toBe(ORG_A)
  })

  it('array-form claims resolve by name', async () => {
    const { resolver } = makeResolver()
    const orgId = await resolver.resolveOrganizationId({ organization: ['cogbox'] }, undefined)
    expect(orgId).toBe(ORG_A)
  })

  it('malformed organization claims throw OrgClaimError', async () => {
    const { resolver } = makeResolver()
    await expect(resolver.resolveOrganizationId({ organization: [42] as never }, undefined)).rejects.toBeInstanceOf(
      OrgClaimError,
    )
    await expect(
      resolver.resolveOrganizationId({ organization: { a: {} } as never }, undefined),
    ).rejects.toBeInstanceOf(OrgClaimError)
  })

  it('claims resolving to no known org → OrgUnknownError (fail closed)', async () => {
    const { resolver } = makeResolver()
    await expect(resolver.resolveOrganizationId({ organization: ['nonexistent'] }, undefined)).rejects.toBeInstanceOf(
      OrgUnknownError,
    )
  })
})
