# H04d worker scheduler and FinOps decision

Assessment date: 2026-09-26; revised 2026-09-29. Scope: beta outbox worker and a read-only check of
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

1. **Keep the worker disabled until retry recovery is rehearsed.** This has
   zero poll traffic and no added provider. The beta outbox is on and normal
   replies, including the 29/09 live two-member reimbursement/payment canary,
   were delivered inline; only unattended retry recovery is missing.
   Use a controlled authenticated worker invocation to test a due retry, then
   leave the worker off until the scheduler gate is ready.
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
3. **Upstash QStash schedule every five minutes.** Its current Free tier allows
   1,000 messages/day and 10 active schedules; 288 polls/day fit if usage on
   that account remains below the cap. It can call the existing endpoint
   without deploying scheduler code, but it introduces another custodian for
   the beta authorization header and its delivery/logging policy must be
   reviewed before storing that secret. Use only a beta-only credential and
   disable response-body logging where supported. This is the lowest-code
   alternative if a Cloudflare account is not available.
4. **Vercel Pro with five-minute polling.** This is the simplest single-vendor
   control plane and supports the schedule, but costs a $20/month platform fee
   (with $20 included usage credit) before any additional seat or excess usage.
   Consider it when the app itself needs other Pro capabilities or measured
   latency demands a tighter bound.
5. **Vercel Pro with one-minute polling.** Reserve for a demonstrated sub-five-
   minute retry SLA or high enough queue volume that a five-minute interval is
   insufficient. At the current five-claim cap that is 300 claims/hour versus
   60 claims/hour at five-minute polling. Measure backlog, age of oldest due
   row, and actual function usage before choosing this.
6. **GitHub Actions schedule.** Not recommended for a runtime queue: GitHub
   documents a five-minute minimum and warns scheduled runs may be delayed or
   dropped during high load. Every-five-minute polling would also start 8,640
   workflow jobs/month, adding runner churn and potentially billable minutes.
7. **Event-driven delayed wakeups (future optimization).** Schedule a wake-up
   for each row's `next_attempt_at`, retain a 15-minute safety sweep for
   missed wakeups, and keep leases/idempotency as the concurrency fence. This
   best matches retry timing and avoids empty polls, but adds queue-provider
   coupling and a second delivery path. Adopt only after beta metrics show
   polling is wasteful or retry latency matters.

## Recommendation and sequence

Do not unblock H04d by buying Vercel Pro and do not deploy a daily worker merely
to make the cron gate appear green. Beta account/link, individual financial
E2E and required live group fanout passed on 29/09. Next stage a controlled
retry using the authenticated worker manually and
capture row transitions and latency before activating a recurring scheduler.

If the measured product requirement is recovery within five minutes, implement
an isolated Cloudflare Worker with `*/5 * * * *`, beta-only URL/secret, timeout,
bounded response handling, and alertable status reporting. Validate the free
CPU limit, duplicate invocations, secret rotation, HTTP 401/5xx handling, and
that the endpoint never exposes response bodies containing private data. If
the requirement is below five minutes or Cloudflare Free's CPU limit is
insufficient, compare actual measured Vercel function usage against the $20
Pro credit before upgrading. Keep the one-minute cron as a config-only option;
do not enable it by default.

### Local scheduler implementation and operator steps

The isolated scheduler source and focused tests are in
`workers/beta-outbox-scheduler/`. It pins the only permitted target in code to
`https://hermes-finantial-tracker-z2.vercel.app/api/cron/telegram-outbox` and
also requires the configured URL to match exactly. Its checked-in Wrangler
config schedules every five minutes and has no secret value. The handler
makes no public HTTP handler available (`workers_dev=false`); it runs only on
the Cron Trigger. It
makes one GET with a dedicated beta-only `TELEGRAM_OUTBOX_SCHEDULER_SECRET`,
aborts after 15 seconds, and logs only a fixed event name, HTTP status, an
allowlisted execution state, and elapsed time. It never reads response bodies
or logs URLs, raw headers, exception text, or secret values. The Vercel outbox
route accepts the dedicated secret without sharing the existing `CRON_SECRET`
used by other beta cron jobs. The unsupported one-minute Vercel outbox cron was
removed from the branch's canonical `vercel.json`; the other three remain.

The following operator sequence was completed for beta on 29/09/2026. Repeat
it only for an approved rotation, recovery, or separate environment. From
`workers/beta-outbox-scheduler/`:

1. Run `npx wrangler deploy` **from `workers/beta-outbox-scheduler/`** with
   `SCHEDULER_ENABLED=false`. The Cron Trigger will exist but safely skip
   requests. Running this command from the repository root is not equivalent:
   Wrangler may try to migrate the Next.js application.
2. Add the dedicated beta-only secret to the beta Vercel project and use
   `npx wrangler secret put TELEGRAM_OUTBOX_SCHEDULER_SECRET` for the same value.
   Do not put it in source, shell history, or `vars`.
3. Change `SCHEDULER_ENABLED` to `true` in `wrangler.jsonc`, deploy again, and
   confirm the scheduler reports only completion/status metadata. A 401 means
   the beta secret binding is mismatched; 5xx means inspect the beta Vercel
   function without exposing its response body. A 200 with an allowlisted
   `skipped_*` execution state does not certify retry recovery.
4. Verify the target hostname is the beta project and measure oldest due row,
   cron completion/HTTP status, timeout count, and Cloudflare free CPU usage.
   Keep this as a best-effort ~5-minute sweep, with a conservative operational
   recovery target of under 10 minutes; Cloudflare does not provide that as an
   application SLA.

Rollback: set `SCHEDULER_ENABLED` to `false` and deploy to stop requests
immediately. Then set `triggers.crons` to an empty array and deploy to remove
the schedule. Delete the Cloudflare `TELEGRAM_OUTBOX_SCHEDULER_SECRET` binding only if the scheduler
will not be reused. This does not change the Vercel deployment, its flags, or
the outbox rows. Do not point the Worker at the legacy/Production hostname.

Focused local tests (no provider credentials or network calls):
`node --test workers/beta-outbox-scheduler/test/worker.test.mjs`.

### Beta recovery evidence — 29/09/2026

- The Cloudflare account's current plan was verified as Workers Free; the
  dashboard showed five available Cron Triggers/account and a 100,000/day
  request limit. The scheduler uses one trigger, every five minutes.
- A synthetic `telegram_operations` row and one `telegram_delivery_outbox`
  row were inserted **only into `beta-hermes`**, targeting the linked beta QA
  chat with a message explicitly labelled as a technical test. No transaction
  or reimbursement row was inserted. The delivery started in a simulated
  `retryable` state at attempt 1 with a stable provider-unavailable code.
- The first authenticated Cloudflare tick returned HTTP 200 but skipped work
  because `NOTIFICATIONS_ENABLED=false`. This exposed an incorrect coupling:
  that setting is the proactive-notification kill switch, while outbox retry
  recovery concerns replies already initiated by users. The outbox route now
  uses its independent `TELEGRAM_OUTBOX_WORKER_ENABLED` gate; proactive alerts
  remain disabled. Only an allowlisted execution state is logged, never a
  response body or raw header.
- At 18:40:25 UTC the tick logged `processed`, HTTP 200, 2360 ms elapsed. By
  18:40:27 UTC the canary row was `sent`, attempt 2, with a provider message ID;
  its lease and error fields were clear. Read-only counts remained 14
  transactions, four reimbursement requests and exactly one canary delivery.
  Local temp-libSQL integration also verified 503→retryable→sent and one
  winner under overlapping worker invocations without financial writes.
- Cloudflare Metrics showed seven invocations, zero errors and 0.79 ms median
  CPU for the active version, below the Free 10 ms/invocation limit. These are
  pilot measurements, not an uptime or tail-latency guarantee. No Pages
  project, paid upgrade, legacy endpoint, production DB or production bot was
  involved.

No scheduler is to target legacy Production until a separate release approval.
Beta and Production must use distinct target URLs and scheduler secret values.

## Evidence and primary references

- Read-only `vercel cron list` for `eindi-acme/hermes-finantial-tracker` on
  2026-09-26 returned the three schedules in the table above.
- Legacy `vercel.json` has those same three jobs. The H04d branch originally
  had a fourth one-minute outbox entry, which Vercel Hobby rejected; it was
  removed after the isolated Cloudflare schedule was selected for beta.
- H04d worker implementation: `app/api/cron/telegram-outbox/route.ts`,
  `lib/telegram/outbox-worker.ts`, and `lib/telegram/outbox-dispatcher.ts`.
- [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing)
- [Vercel cron management and timing](https://vercel.com/docs/cron-jobs/manage-cron-jobs)
- [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Upstash QStash Free limits and pricing](https://upstash.com/pricing/qstash)
- [GitHub Actions schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- [Telegram Bot API webhook delivery](https://core.telegram.org/bots/api#webhookinfo)
