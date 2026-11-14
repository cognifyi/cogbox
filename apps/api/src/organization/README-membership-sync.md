/*

* Copyright 2025 Daytona Platforms Inc.
* Copyright Cognifyi
* SPDX-License-Identifier: AGPL-3.0
 */

# Organization membership sync

Billing reads membership through
`OrganizationMembershipIntrospectionCacheService` (60s TTL). This note records
the propagation bound and the fail-closed rule so future edits keep both.

## Propagation: immediate, at worst 60s

1. Every membership mutation writes its row and an outbox row in one database
   transaction (`OrganizationUserService` + `OrganizationMembershipOutboxService`).
2. `OrganizationMembershipOutboxRelayService` (every 30s, leader-locked) publishes
   each due row on `OrganizationEvents.MEMBERSHIP_CHANGED` with its idempotency
   key (`eventId`).
3. `OrganizationMembershipCacheInvalidationService` invalidates the cached entry,
   so the next read reloads from the database immediately.
4. If the event is missed (crash, restart, relay backlog), the entry expires after
   `ORGANIZATION_MEMBERSHIP_INTROSPECTION_CACHE_TTL_MS` (60s) and reloads.

Bound: member changes are visible immediately via the event path and at worst
within 60s via TTL expiry. Proven by
`services/organization-membership-latency-fault.spec.ts` ("60s propagation").

## Fail-closed on dependency failure

`OrganizationMembershipFailClosedGuard` denies access whenever membership cannot
be verified:

* The database lookup throws: record a failure on
  `OrganizationMembershipAvailabilityService` and throw
  `InvalidAuthenticationContextException` (deny). Never grant on an error.
* The availability service reports degraded (3 consecutive failures, 30s
  cooldown by default): deny without trusting the cache.
* The membership row is missing: deny.

A success resets the failure count; after the cooldown one probe lookup is
allowed and a success restores `available`. Proven by the same spec
("fail-closed", "fault-injection").

## Operate

* Drift between the database and the cache is reported by
  `OrganizationMembershipDriftService` (`missing` / `stale` / `extra`).
* Outbox backlog is visible via `OrganizationMembershipOutboxService.backlogCounts()`;
  `dead` rows need operator attention.
* Do not raise the introspection TTL without updating the bound above and the
  latency spec.

## Keycloak organization sync (K4 dual-track)

`OrganizationKeycloakOrgSyncService` mirrors business membership into the
`cogbox` realm's KC Organizations — one-way, cogbox -> KC only:

* `membership.changed` added/role_changed -> ensure the KC user exists (a
  missing account gets a KC org invitation by email, the only registration
  path under invite-only) and add it to the mapped KC org. KC membership has
  no role; roles stay in cogbox/cogos.
* `membership.changed` removed -> remove the KC org member.
* `invitation.created` -> KC org invitation email only when the invitee has
  no KC account; existing accounts join via the membership path on accept.

KC orgs are matched by the `cogbox_org_id` attribute (cog-deploy script 21,
K3). Enable with `KC_ORG_SYNC_ENABLED=true` plus `KEYCLOAK_BASE_URL`,
`KEYCLOAK_REALM` (default `cogbox`), `KEYCLOAK_ADMIN_CLIENT_ID` /
`KEYCLOAK_ADMIN_CLIENT_SECRET` (a service-account client with realm org
management). Default off — flip for grey rollout. Failures classify like the
cogos fan-out: 4xx dead-letters, 5xx/network retries; an unmapped org throws
retryable so pending K3 imports are not dead-lettered.

Drift between `organization_user` and KC members is inspected with
`cog-deploy/services/cogos/scripts/22-kc-org-drift-check.sh`.
