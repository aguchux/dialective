# Stream Subscription Plans

Three subscription tiers for programmatic access to Dialect Library's voice
data via the Voice Stream API (ISVP/ISVC). Each tier maps to a
`SubscriptionPlan` row (`services/api/prisma/schema.prisma`) and is enforced
by the existing guards already built for those fields: `QuotaGuard`
(`monthlyRequestQuota`/`monthlyByteQuota`), `ConcurrentStreamGuard`
(`maxConcurrentStreams`), `StreamKeyRateLimitGuard`
(`rateLimitPerMinute`), and `TierGateGuard` (`minIsvcConfidence`).
`maxStreamDecks`/`maxTeamMembers` are enforced at the dashboard/API level
where decks and memberships are created.

"Voice data accesses" below is proposed to map to the existing
`monthlyRequestQuota` field -- no schema change needed. There is currently no
dedicated counter for distinct catalogue items (recordings) accessed across
decks; if that distinction becomes important later, it would need a new
field (e.g. `maxCatalogueItems`) and its own guard.

## Stream Startup -- $0.00 / month

**For evaluating the dataset before committing.**

Explore Dialect Library's voice data with a generous free tier -- pull real
recordings, build a small proof of concept, and see the coverage for
yourself before you pay anything.

| Limit                       | Value                                                                |
| --------------------------- | -------------------------------------------------------------------- |
| Voice data accesses / month | 1,000                                                                |
| Stream Decks                | 5                                                                    |
| Team members                | 1                                                                    |
| Concurrent streams          | 1                                                                    |
| Rate limit                  | 60 requests/minute                                                   |
| Catalogue access            | Established dialects only (emerging/low-confidence entries excluded) |

## Stream Professional -- $249 / month

**For teams building production speech products.**

Full-catalogue access at a rate built for real integration work -- training
pipelines, ongoing QA, and a small team collaborating on the same decks.

| Limit                       | Value                              |
| --------------------------- | ---------------------------------- |
| Voice data accesses / month | 50,000                             |
| Stream Decks                | 50                                 |
| Team members                | 5                                  |
| Concurrent streams          | 10                                 |
| Rate limit                  | 300 requests/minute                |
| Catalogue access            | High-confidence dialects and above |

## Stream Premium -- $899 / month

**For organizations running voice data at scale.**

Unlimited decks and team seats, our highest concurrency and rate limits, and
access to the full catalogue including emerging dialects still building
consensus -- for teams whose product depends on breadth of coverage, not
just volume.

| Limit                       | Value                                       |
| --------------------------- | ------------------------------------------- |
| Voice data accesses / month | 500,000                                     |
| Stream Decks                | Unlimited                                   |
| Team members                | Unlimited                                   |
| Concurrent streams          | 50                                          |
| Rate limit                  | 1,000 requests/minute                       |
| Catalogue access            | Full catalogue, including emerging dialects |

## Open questions / follow-ups

- Confirm whether "voice data accesses" should map to `monthlyRequestQuota`
  (proposed above, ships with no schema change) or a new dedicated
  catalogue-item counter.
- Decide whether a fourth "Enterprise" tier (custom pricing, uncapped
  limits, SLA-based differentiation) is needed above Premium.
- These are proposed figures, not yet created as `SubscriptionPlan` rows --
  confirm before wiring into the admin subscription-plans UI.
