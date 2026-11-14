/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * K2-0 frozen contract parsing of the Keycloak `organization` claim set plus
 * the legacy `org_id` attribute. Mirrors billing's org-claims.ts and the
 * frozen fixture expectations in
 * plan/4.功能设计/miles/2026-11-kc-org-unification/02-claim-contract.md.
 *
 * Values returned here are raw claim values — the caller canonicalizes them
 * (KC org id / alias / cogbox UUID → cogbox organization id).
 */

export class OrgClaimError extends Error {}
export class OrgConflictError extends Error {}
export class OrgRequiredError extends Error {}
export class OrgUnknownError extends Error {}

export interface OrgEntry {
  /** The raw claim value used for canonicalization (dict id or name/alias). */
  canonical: string
  /** Explicit KC org id when the claim carried dict form `{alias: {id}}`. */
  kcOrgId?: string
  /** Dict-form alias key. */
  alias?: string
}

export interface OrgContext {
  entries: Map<string, OrgEntry>
  attrOrg?: string
  conflict: boolean
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Parse the `organization` claim + `org_id` attribute. Malformed shapes throw
 * OrgClaimError (→ 401 auth.invalid).
 */
export function parseOrgContext(claims: Record<string, unknown>): OrgContext {
  const ctx: OrgContext = { entries: new Map(), conflict: false }

  const org = claims['organization']
  if (org !== undefined && org !== null) {
    const put = (rawId: unknown, alias?: string, body?: Record<string, unknown>) => {
      const id = firstString(rawId)
      if (!id) {
        throw new OrgClaimError('organization entry id must be a non-empty string')
      }
      ctx.entries.set(id, {
        canonical: id,
        kcOrgId: body && typeof body.id === 'string' ? body.id.trim() : undefined,
        alias,
      })
    }
    if (typeof org === 'string') {
      if (org.trim()) put(org.trim())
    } else if (Array.isArray(org)) {
      for (const item of org) {
        if (typeof item !== 'string') {
          throw new OrgClaimError('organization list contains non-string entries')
        }
        if (item.trim()) put(item.trim())
      }
    } else if (typeof org === 'object') {
      for (const [alias, body] of Object.entries(org as Record<string, unknown>)) {
        if (!body || typeof body !== 'object' || typeof (body as Record<string, unknown>).id !== 'string') {
          throw new OrgClaimError('organization entry missing a string id')
        }
        put((body as Record<string, unknown>).id, alias, body as Record<string, unknown>)
      }
    } else {
      throw new OrgClaimError('organization claim has unsupported type')
    }
  }

  ctx.attrOrg = firstString(claims['org_id'])
  return ctx
}
