# H04d worker scheduler and FinOps decision

Assessment date: 2026-09-26. Scope: beta outbox worker and a read-only check of
the legacy Production project's cron definitions. No Production configuration,
database, secret, webhook, or traffic was changed.

## Findings

The legacy Vercel project currently has three deployed schedules:

| Route | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/update-exchange-rate` | `0 3 1 * *` | Monthly exchange-rate refresh |
| `/api/cron/daily-alerts` | `0 0 * * *` | Daily alerts |
| `/api/cron/recurring-reminders` | `0 11 * * *` | Daily recurring-payment reminders |

There is no legacy `/api/cron/telegram-outbox` schedule. The deployed legacy
application does not contain the H04d outbox worker. The new worker route exists
only on the isolated beta worktree/deployment and its deployment has no cron
schedule because Vercel Hobby rejected the one-minute expression.

The worker is a recovery/sweeper process, not the normal Telegram request path.
When the outbox flag is on, the webhook attempts due replies inline after it
stages them durably. The worker later claims due outbound deliveries and
retries network failures, Telegram 429s, and provider 5xx responses. It does
not process inbox updates or write financial transactions. Its defaults are
five claims per invocation, a 45-second budget, 60-second leases, and a purge
of at most 100 terminal rows whose retention expired. Retry delays start at
1, 2, 4, 8 minutes and cap at 15 minutes; Telegram's `retry_after` is honored
when supplied. A worker poll therefore bounds recovery latency after a row's
`next_attempt_at`; it is not needed to make the first reply attempt.

Vercel Hobby permits at most one cron execution per day and may schedule it at
any time in the configured hour. Pro supports once-per-minute with per-minute
precision. Cron invokes a Vercel Function, so its function usage is still
subject to the plan's usage limits. As of this assessment, the Pro platform fee
is $20/month and includes $20 of usage credit; do not upgrade solely to achieve
one-minute polling without an actual latency requirement.

## Invocation and polling tradeoff

Counts assume a 30-day month and one scheduler trigger per poll. They are not a
Vercel bill estimate; function duration, memory, runtime pricing, included
credit, and other project usage must be measured in Vercel's usage dashboard.

| Poll interval | Invocations/day | Invocations/30 days | Approx. extra wait after a retry becomes due |
| --- | ---: | ---: | ---: |
| 1 minute | 1,440 | 43,200 | up to about 1 minute |
| 5 minutes | 288 | 8,640 | up to about 5 minutes |
| 15 minutes | 96 | 2,880 | up to about 15 minutes |
| 1 day | 1 | 30 | up to about 24 hours; only five claims/day at default batch size |

The once-daily Hobby fallback is materially different from a five-minute
sweep: it can leave user-visible Telegram replies pending for nearly a day and
at most drain five due deliveries per daily invocation. It should not be
described as retry recovery suitable for a connected beta pilot.

## Options

1. **Keep the worker disabled while completing account/link and financial QA.**
   This has zero poll traffic and no added provider. The outbox can remain off
   until its own verification gate; direct legacy-style sends continue on the
   webhook path. Use a single authenticated worker invocation in controlled QA
   to test the route, then keep it off again.
2. **External Cloudflare Cron Trigger every five minutes (recommended for a
   low-cost beta safety sweep, subject to implementation and validation).**
   A minimal Worker can call only the beta worker URL with a beta-only
   `CRON_SECRET`; it needs no Turso credentials. Five-minute polling is 8,640
   requests/month and 288/day, below Cloudflare Workers Free's documented
   100,000 requests/day and five Cron Trigger/account limits. The Free Cron
   CPU ceiling is 10 ms per trigger, so validate the one-fetch handler stays
   inside it; otherwise use the paid Workers plan or choose another scheduler.
   This adds an operational provider and a secret binding, so do not create it
   without an explicit provider/account decision.
3. **Vercel Pro with five-minute polling.** This is the simplest single-vendor
   control plane and supports the schedule, but costs a $20/month platform fee
   (with $20 included usage credit) before any additional seat or excess usage.
   Consider it when the app itself needs other Pro capabilities or measured
   latency demands a tighter bound.
4. **Vercel Pro with one-minute polling.** Reserve for a demonstrated sub-five-
   minute retry SLA or high enough queue volume that a five-minute interval is
   insufficient. At the current five-claim cap that is 300 claims/hour versus
   60 claims/hour at five-minute polling. Measure backlog, age of oldest due
   row, and actual function usage before choosing this.
5. **GitHub Actions schedule.** Not recommended for a runtime queue: GitHub
   documents a five-minute minimum and warns scheduled runs may be delayed or
   dropped during high load. Every-five-minute polling would also start 8,640
   workflow jobs/month, adding runner churn and potentially billable minutes.
6. **Event-driven delayed wakeups (future optimization).** Schedule a wake-up
   for each row's `next_attempt_at`, retain a 15-minute safety sweep for
   missed wakeups, and keep leases/idempotency as the concurrency fence. This
   best matches retry timing and avoids empty polls, but adds queue-provider
   coupling and a second delivery path. Adopt only after beta metrics show
   polling is wasteful or retry latency matters.

## Recommendation and sequence

Do not unblock H04d by buying Vercel Pro and do not deploy a daily worker merely
to make the cron gate appear green. First finish beta account login, Telegram
linking, and a synthetic financial E2E with the existing flags. Then enable
outbox separately and verify one immediate delivery plus one forced retry using
the authenticated worker manually. Capture the row transitions and latency.

If the measured product requirement is recovery within five minutes, implement
an isolated Cloudflare Worker with `*/5 * * * *`, beta-only URL/secret, timeout,
bounded response handling, and alertable status reporting. Validate the free
CPU limit, duplicate invocations, secret rotation, HTTP 401/5xx handling, and
that the endpoint never exposes response bodies containing private data. If
the requirement is below five minutes or Cloudflare Free's CPU limit is
insufficient, compare actual measured Vercel function usage against the $20
Pro credit before upgrading. Keep the one-minute cron as a config-only option;
do not enable it by default.

No scheduler is to target legacy Production until a separate release approval.
Beta and Production must use distinct target URLs and `CRON_SECRET` values.

## Evidence and primary references

- Read-only `vercel cron list` for `eindi-acme/hermes-finantial-tracker` on
  2026-09-26 returned the three schedules in the table above.
- Legacy `vercel.json` has those same three jobs; the H04d branch's local
  `vercel.json` has a fourth one-minute `/api/cron/telegram-outbox` entry.
- H04d worker implementation: `app/api/cron/telegram-outbox/route.ts`,
  `lib/telegram/outbox-worker.ts`, and `lib/telegram/outbox-dispatcher.ts`.
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel cron management and timing](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [GitHub Actions schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Telegram Bot API webhook delivery](https://core.telegram.org/bots/api#webhookinfo)
