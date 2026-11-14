/*
 * Copyright 2025 Daytona Platforms Inc.
 * Copyright Cognifyi
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { ForbiddenException, UnauthorizedException } from '@nestjs/common'
import { DataSource, Repository } from 'typeorm'
import { Organization } from '../organization/entities/organization.entity'
import {
  OrgClaimError,
  OrgConflictError,
  OrgRequiredError,
  OrgUnknownError,
  parseOrgContext,
} from './utils/org-claims.util'

const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * K7: validates the JWT's `organization` claim set against the
 * `X-Cogbox-Organization-ID` selector and resolves the request's canonical
 * organization id (the cogbox `organization.id` UUID — KC org ids and org
 * names/aliases are claim inputs only, never exposed outward).
 *
 * Rules (frozen K2-0 contract):
 * - header is the explicit selector and wins, but only after normalization —
 *   a selector outside the claim set → 403 org.unknown;
 * - multi-organization tokens without a selector → 403 org.required (never
 *   first-pick, never default fallback);
 * - single-org tokens without a header adopt the claimed org;
 * - `org_id` attribute resolving outside the claim set → 403
 *   org.claim_conflict; attribute-only tokens keep legacy behavior (header
 *   passthrough, attribute does not select);
 * - tokens with no organization claims are untouched (legacy path).
 */
@Injectable()
export class OrgClaimResolver {
  private readonly repo: Repository<Organization>

  constructor(dataSource: DataSource) {
    this.repo = dataSource.getRepository(Organization)
  }

  /**
   * Resolve the canonical organization id for the request, or `undefined`
   * when the request is not org-scoped.
   */
  async resolveOrganizationId(payload: Record<string, unknown>, header: string | undefined) {
    const ctx = parseOrgContext(payload)
    const headerValue = header?.trim() || undefined

    if (ctx.entries.size === 0) {
      // Attribute-only / no-claim tokens: attribute is a compat hint, never a
      // claim-set selector — keep the legacy header passthrough unchanged.
      return headerValue
    }

    const claimed = new Set<string>()
    for (const entry of ctx.entries.values()) {
      const canonical = await this.canonicalize([entry.kcOrgId, entry.alias, entry.canonical])
      if (canonical) {
        claimed.add(canonical)
      }
    }

    if (ctx.attrOrg) {
      const attrCanonical = await this.canonicalize([ctx.attrOrg])
      if (attrCanonical && !claimed.has(attrCanonical)) {
        throw new OrgConflictError(`org_id attribute resolves outside the token's organization set`)
      }
    }

    if (headerValue) {
      const selected = await this.canonicalize([headerValue])
      if (!selected || !claimed.has(selected)) {
        throw new OrgUnknownError(`X-Cogbox-Organization-ID resolves outside the claim set`)
      }
      return selected
    }

    if (claimed.size === 1) {
      return claimed.values().next().value
    }
    if (claimed.size === 0) {
      // Claim set present but nothing maps to a known cogbox org — the sync
      // has not landed; treat like an unknown selector (fail closed).
      throw new OrgUnknownError('organization claims resolve to no known organization')
    }
    throw new OrgRequiredError('token carries multiple organizations; select one explicitly')
  }

  /** Raw claim/header value → canonical cogbox organization id. */
  private async canonicalize(values: Array<string | undefined>): Promise<string | undefined> {
    for (const raw of values) {
      const value = raw?.trim()
      if (!value) continue
      const where = UUID_RE.test(value)
        ? [{ id: value }, { keycloakOrgId: value }, { name: value }]
        : [{ keycloakOrgId: value }, { name: value }]
      const org = await this.repo.findOne({ where, select: ['id'] })
      if (org) {
        return org.id
      }
    }
    return undefined
  }
}

/** Map resolver errors onto coded HTTP responses (K2-0 error matrix). */
export function toOrgClaimHttpError(error: unknown): Error {
  if (error instanceof OrgConflictError) {
    return new ForbiddenException({ code: 'org.claim_conflict' })
  }
  if (error instanceof OrgRequiredError) {
    return new ForbiddenException({ code: 'org.required' })
  }
  if (error instanceof OrgUnknownError) {
    return new ForbiddenException({ code: 'org.unknown' })
  }
  if (error instanceof OrgClaimError) {
    return new UnauthorizedException({ code: 'auth.invalid' })
  }
  return error instanceof Error ? error : new Error(String(error))
}
