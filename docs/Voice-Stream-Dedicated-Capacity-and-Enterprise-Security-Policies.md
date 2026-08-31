# Dedicated Capacity & Enterprise Security Policies

## Purpose

These are the final two Phase 4 ("Versioning and Enterprise Controls") items
from the [Voice Stream / ISVP / ISVC plan](Dialect_Library_Voice_Stream_ISVP_ISVC_Plan.md).
Both are Enterprise-tier subscriber capabilities on the Voice Stream API
(`services/api/src/voice-stream/`) — the programmatic platform AI companies
use to stream licensed voice data, not the trainer-facing dashboard.

**Dedicated Capacity** guarantees an Enterprise organization's streaming
throughput is never starved by other subscribers' traffic on the shared API
fleet. **Enterprise Security Policies** let an Enterprise organization's
OWNER/ADMIN enforce its own login and API-key rules on its members.

Neither feature requires new infrastructure. Both are entitlement-gated
behind a boolean flag on `SubscriptionPlan` and are inert until an admin
turns them on for a plan.

---

## Dedicated Capacity

### What it does

Every subscriber organization already has per-org ceilings — concurrent
stream limit, requests-per-minute, monthly quota (`SubscriptionPlan.
maxConcurrentStreams`, `rateLimitPerMinute`, `monthlyByteQuota`/
`monthlyRequestQuota`). Those ceilings only ever check "is *this* org over
*its own* limit" — there was never a mechanism protecting one org's traffic
from being crowded out by everyone else's traffic on the same pod fleet.

Dedicated Capacity adds that protection for Enterprise orgs. It is a
**guaranteed throughput floor**, not physical isolation — Enterprise traffic
still runs on the same `api` pods as everyone else. What changes is:
when the whole fleet is saturated *and* an Enterprise org is actively using
its reserved share of that capacity, a new request from a non-Enterprise org
gets turned away (so the Enterprise org's in-flight traffic keeps flowing)
instead of everyone degrading together.

### How it works

A new guard, `DedicatedCapacityGuard`
(`services/api/src/voice-stream/stream-api/dedicated-capacity.guard.ts`),
runs first in the audio-streaming guard chain — before the existing
`QuotaGuard`, `ConcurrentStreamGuard`, and `StreamKeyRateLimitGuard`. It
tracks two fleet-wide numbers in Redis (shared across every `api` pod, so the
guarantee holds cluster-wide, not per-pod):

- **Concurrent streams** — incremented when a stream starts, decremented
  when it ends.
- **Requests per minute** — incremented per request, in 60-second buckets.

Each counter is tracked twice: once for the whole fleet, and once for just
the Enterprise slice. A non-Enterprise request is only rejected when **both**
are true for the resource it's competing for:

1. The fleet-wide count is at or above the configured ceiling, **and**
2. An Enterprise org is actually using its reserved share right now.

If no Enterprise org is live, condition 2 never fires, and the guard is a
complete no-op end-to-end — exactly today's behavior. Enterprise orgs
themselves never hit this guard's block path; it only decides whether to let
*other* orgs' traffic through when Enterprise headroom is at risk.

A rejected request gets `503 Service Unavailable` (not `429`) with the
message *"Platform is at capacity; dedicated-capacity subscribers are being
prioritized. Please retry shortly."* — a capacity/priority signal, distinct
from a subscriber hitting their own quota.

**Redis unavailable → fails open.** If Redis can't be reached, the guard
logs the error and lets the request through. It can never itself become an
outage cause for the whole platform.

### Turning it on

Two environment variables on the `api` deployment define the fleet-wide
ceilings this feature reasons about:

| Variable | Meaning |
| --- | --- |
| `FLEET_MAX_CONCURRENT_STREAMS` | Total concurrent audio streams the fleet can serve before Enterprise protection engages. |
| `FLEET_MAX_REQUESTS_PER_MINUTE` | Total requests/minute across the fleet before Enterprise protection engages. |

Both default to `0` (unset), which disables the feature entirely — the
guard's very first check is `if both are 0, return true immediately`, so it
never touches Redis or Prisma. **These are unset today**, so Dedicated
Capacity is fully dark in production until someone sets real numbers based
on actual fleet capacity planning.

Per-plan, set `SubscriptionPlan.reservedCapacityPercent` (an integer 1–100)
on the Enterprise plan row. Any plan with this field `null` (the default) is
treated as non-Enterprise for this feature — its traffic is what gets turned
away when the floor is at risk. This field isn't currently exposed in an
admin UI; set it directly via the `SubscriptionPlan` table (same as any
other plan-limit field today).

### Operational notes

- **No customer-visible config.** Subscribers don't see or configure
  anything for this feature — it's entirely a platform-side protection.
- **Nothing to monitor day-to-day while unconfigured.** With the env vars
  unset, there's no Redis key activity from this guard at all.
- **Once configured**, the Redis keys to watch are prefixed
  `dedicated-capacity:` — `dedicated-capacity:concurrent:total`,
  `dedicated-capacity:concurrent:enterprise`, and per-minute-bucketed
  `dedicated-capacity:reqrate:*` / `dedicated-capacity:reqrate:enterprise:*`
  keys (the latter auto-expire after 90 seconds).
- **Picking real ceiling numbers** requires actual fleet load-testing —
  these aren't values that can be reasoned out from first principles, and
  setting them too low would start rejecting legitimate non-Enterprise
  traffic even with plenty of real headroom.

---

## Enterprise Security Policies

### What it does

Lets an Enterprise organization's OWNER or ADMIN configure four
organization-wide rules that apply to every member, without needing a code
change or platform-side intervention:

| Policy | Effect |
| --- | --- |
| **Mandatory SSO** | Password login is disabled for everyone in the org **except the OWNER role**. |
| **Refresh token TTL override** | Overrides the platform-wide 30-day refresh-token lifetime with a shorter (or longer) org-specific value. |
| **Minimum role for API key creation** | Restricts which roles may create/rotate Stream Keys, narrower than the platform default. |
| **Mandatory IP allowlist** | Every new or rotated Stream Key must have a non-empty IP allowlist — an empty allowlist is rejected. |

### Why the OWNER always keeps password access

Mandatory SSO is deliberately **not** an absolute lockout. If it blocked
every role including OWNER, a broken or misconfigured identity provider
would strand the entire organization with no way back in short of direct
platform-side database intervention. The OWNER role always retains password
login as a break-glass path, so there's always one human who can fix a
broken SSO integration on their own.

An unauthenticated login attempt against an SSO-required org gets the exact
same generic *"Invalid email or password"* response as a wrong password or a
nonexistent account — the platform never reveals that an org requires SSO to
an unauthenticated caller.

### How it's enforced

A new 1:1 table, `SubscriberOrgSecurityPolicy`, holds one optional row per
organization. Absence of a row (the default for every org today) means
"platform defaults apply" for all four rules — this feature is purely
additive and changes nothing for an org that never configures it.

Enforcement happens at the exact point each rule matters:

- **Mandatory SSO** — checked in `SubscriberAuthService.login()`, right
  after the account is found and before the password is even compared.
- **Refresh TTL** — checked wherever a refresh token is issued or rotated
  (`SubscriberAuthService.refresh()` and `.issueAuthResult()`), replacing
  the hardcoded 30-day constant with the org's override when one exists.
- **Minimum role for key creation** — a new guard,
  `ApiKeyRolePolicyGuard`, runs on the Stream Key create/rotate endpoints
  alongside the existing role checks. It only ever *narrows* who can act,
  never widens beyond the platform's own role floor.
- **Mandatory IP allowlist** — checked in `StreamKeysService` on both
  `create()` and `rotate()`. Rotating an old key that predates the policy
  and has an empty allowlist would otherwise get stuck with no way to fix
  it, so `rotate()` accepts an optional `allowedIps` override — supplying
  IPs at rotation time satisfies the policy in the same call.

### Turning it on

Like Dedicated Capacity, this is gated behind a `SubscriptionPlan` boolean
(`enterpriseSecurityPoliciesEnabled`, default `false`), enforced by
`SecurityPolicyEntitlementGuard`. Set it to `true` on the Enterprise plan row
to unlock the feature for orgs on that plan.

Once entitled, an org's OWNER or ADMIN manages the policy via:

| Endpoint | Effect |
| --- | --- |
| `GET /voice-stream/security-policy` | Read the org's current policy (or nothing, if unconfigured). |
| `POST /voice-stream/security-policy` | Create or update the policy (upsert — send the full desired state). |
| `DELETE /voice-stream/security-policy` | Remove the policy entirely, reverting to platform defaults. |

Every change is recorded on the organization's activity timeline
(`SECURITY_POLICY_UPDATED` / `SECURITY_POLICY_REMOVED` events), visible
alongside every other auditable org action (key rotation, SSO changes,
membership changes).

There is no dashboard UI for this yet — Voice Stream has no subscriber-facing
dashboard at all today (see the [SAML SSO section](#relationship-to-sso) below).
In practice, an Enterprise customer's policy is configured via a direct API
call, typically by support/solutions engineering on the customer's behalf
during onboarding.

### Operational notes

- **`refreshTokenTtlMinutes` has a floor of 5 minutes** — a policy can't
  accidentally (or maliciously) set a TTL so short it effectively logs
  everyone out immediately.
- **`minRoleForApiKeyCreation` is an explicit role list, not a hierarchy.**
  `SubscriberOrgRole` (OWNER, ADMIN, DATASET_MANAGER, VALIDATOR,
  API_DEVELOPER, BILLING_MANAGER, AUDITOR) has no inherent ordering in this
  codebase, so the policy stores the exact set of roles allowed to create
  keys rather than a "minimum" in a ranked sense.
- **Access-token TTL is not overridable** — only the refresh-token TTL is.
  Access tokens are short-lived (15 minutes by default) and signed by a
  pure function with no database access; a per-org override there would add
  real plumbing for a much smaller security benefit than the refresh-token
  override already provides.
- **Removing the policy is instant** — the very next login/refresh/key
  action for that org reads "no policy row" and reverts to platform
  defaults, with no propagation delay.

### Relationship to SSO

Enterprise Security Policies' mandatory-SSO toggle assumes the org already
has a working SAML identity provider configured — see the separate SAML SSO
module (`services/api/src/voice-stream/sso/`) for how that's set up. Turning
on `requireSso` without a working `SsoIdpConfig` for the org would lock out
every non-OWNER member with no way to actually sign in via SSO, so SSO
should be configured and verified working *before* mandatory SSO is turned
on.

---

## Files

| Area | Path |
| --- | --- |
| Dedicated Capacity guard | `services/api/src/voice-stream/stream-api/dedicated-capacity.guard.ts` |
| Security policy module | `services/api/src/voice-stream/security-policy/` |
| Schema | `services/api/prisma/schema.prisma` — `SubscriptionPlan.reservedCapacityPercent`/`enterpriseSecurityPoliciesEnabled`, `SubscriberOrgSecurityPolicy` |
| Migration | `services/api/prisma/migrations/20260901000000_add_voice_stream_phase4_dedicated_capacity_and_security_policies/` |
