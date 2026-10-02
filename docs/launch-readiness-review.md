# Launch readiness review

Reviewed October 2, 2026. Scope: the current working tree, migration chain, automated
checks, and the public deployment at https://meeting-place.gkovsharov05.workers.dev/.

## Recommendation

Hold broad public promotion until the shared-card write vulnerability, paid-AI abuse
controls, and five-minute recording failure are fixed. Then start with a small,
supervised beta involving pairs of users. The architecture is a reasonable MVP
foundation; these findings do not require rebuilding the application.

## Findings to address before public promotion

### 1. High: authenticated players can poison the shared card pool

`supabase/migrations/202609120004_add_word_game_card_pool.sql:159` exposes
`cache_word_game_cards` to the `authenticated` role at line 356. It checks that the
caller owns the current turn, but accepts caller-supplied cards and a caller-supplied
source model and inserts them into the globally shared pool. The Worker uses the
same user identity, so the database cannot distinguish its AI results from a direct
client RPC request.

A disposable embedded-PostgreSQL probe executed all migrations, created an active
partnership and game, switched to the ordinary authenticated role, and successfully
inserted a fabricated card with source model `attacker-controlled`. Other games
select from this same pool. An attacker could insert offensive or misleading cards,
claim answer aliases, and grow shared storage.

Move shared-pool writes behind a narrowly scoped, server-authenticated operation.
Preserve participant authorization and keep privileged credentials out of browsers.
Add a regression test proving that direct authenticated RPCs cannot insert shared
cards. Implement the change in a new migration.

### 2. High: paid AI operations have no usage quota or exclusive processing claim

`src/server/routes/word-game.ts:203` generates words before creating the final round.
Lines 298 and 309 transcribe and coach before committing the transcript. These
operations have no per-account AI budget or atomic processing reservation.

A targeted API test with mocked providers confirmed that three concurrent eligible
transcription submissions trigger six provider calls: three transcriptions and
three coaching requests. Later database state checks do not undo those calls.
The round endpoint also accepts arbitrary topic strings, so the UI's fixed topic
buttons are not a security boundary. Invitation rate limits do not limit AI usage.

Reserve work atomically before calling providers, make retries idempotent, enforce
per-user usage limits, and set a provider spending cap. Add explicit provider
timeouts and output budgets. Cloudflare/account-level controls were not inspected,
so any protection configured outside this repository remains unverified.

### 3. Medium: the advertised five-minute recording cannot be uploaded

The UI offers a 300-second explanation preset. The WAV encoder in
`src/client/features/games/explain-word/lib/audio-recording.ts:16` produces 16 kHz,
mono, 16-bit PCM. A full recording is therefore 9,600,044 bytes. Both
`src/server/routes/word-game.ts:25` and the Storage bucket configured in
`supabase/migrations/202609110005_add_word_game_lobby_and_audio.sql:405` allow only
8,388,608 bytes. Recordings longer than approximately 4 minutes 22 seconds fail.
The returned error also incorrectly says to record less than one minute.

Align the supported duration, encoder, API limit, and bucket limit. Test a full
five-minute recording at the API boundary and in the actual storage service. Add
an early request-body limit: the current file-size check runs after multipart
parsing, so it does not bound the entire incoming body before allocation.

### 4. Medium: recording privacy and deletion are not explained to users

The application stores audio and transcripts and sends audio to OpenRouter for
transcription. This is explained in the developer README, but there is no public
privacy page, visible recording-processing disclosure, account-deletion flow, or
support/contact path in the inspected application routes and UI. No recording
retention or cleanup job was found in the repository.

Explain what is collected, which services process it, who can access it, how long
it is retained, and how users can request deletion. Add a contact route and an
implemented deletion/retention process. This is a product trust and data-lifecycle
finding, not a determination of legal compliance.

## Other improvements

- **First-user onboarding:** the login page says “No setup” without explaining that
  a user must bring a partner, exchange exact usernames, and accept an invitation.
  Live call mode also requires an external call. Make these prerequisites visible
  before sign-in; otherwise visitors arriving alone cannot reach the core benefit.
- **Polling cost:** `CommunityProvider.tsx:24` fetches every partnership page,
  sessions, and the complete game history; line 81 repeats this every three seconds
  while visible. The history SQL returns all finished games and their rounds. Load
  history on demand, paginate it on the server, and avoid refetching it on every
  notification poll. No capacity/load test was performed.
- **Dependency maintenance:** `npm audit --json` reports five vulnerable development
  dependency entries: two high and three moderate. `npm audit --omit=dev --json`
  reports zero production dependency advisories. Update the affected development
  dependency tree and rerun checks; these findings alone do not demonstrate a
  remotely exploitable production vulnerability.
- **Social previews:** `index.html` contains a description and favicon but no
  Open Graph or Twitter card metadata/image. Add a clear share preview before
  promotion.

## Positive evidence

- API authentication verifies the token with Supabase and forwards the user's JWT.
- Database constraints encode two-person partnerships; mutations check membership.
- RLS and function permissions restrict private profiles, games, and recordings.
- Invitation attempts have database-enforced quotas and cooldowns.
- Runtime secret files are ignored and not tracked. A targeted scan of tracked
  files found no matching OpenRouter secret, Supabase secret-key, or private-key
  patterns. This was not a comprehensive Git-history secret audit.
- The public site rendered its login page. HTTP checks returned 200 for the home
  page and `/api/health`, and 401 for unauthenticated `/api/me`.
- Production HTML carries CSP, framing, content-type, referrer, and permissions
  headers; API responses include `Cache-Control: no-store`.
- `npx supabase migration list --linked` lists matching local and remote versions
  for all 23 migrations. This checks migration history, not out-of-band schema drift.

## Verification

`npm run check` passed formatting, lint, and TypeScript, then stopped at a failing
database test: 97 of 98 tests passed. The failure uses a hard-coded October 2, 2025
activity date, which is outside the current 365-day window beginning October 3, 2025. Make the fixture relative to the tested window or control database time.

The normal browser command initially exceeded its 60-second server-start timeout.
A temporary ignored configuration increased startup allowance and limited the run
to four workers. That run encountered five failures and stalled during teardown;
it was interrupted. A sequential rerun of those five cases passed four, but the
recording scenario again failed waiting for the “Game paused” indicator. The
focused run also stalled during teardown and was interrupted after those results.
The recording/disconnect flow therefore remains a release-verification gap; the
observed failure alone does not establish whether the cause is application code
or the test harness. These browser tests mock authentication/API responses; they do
not verify real production OAuth, Storage, Realtime, or paid AI integrations.

| Command                                | Outcome                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `npm run format:check`                 | Passed, including the review document                                   |
| `npm run lint`                         | Passed as part of `npm run check`                                       |
| `npm run typecheck`                    | Passed as part of `npm run check`                                       |
| `npm test`                             | 97 passed, 1 failed; date-dependent activity fixture                    |
| `npm run build`                        | Passed separately after the check sequence stopped                      |
| `npm run test:e2e`                     | Default startup timeout; adjusted run and focused retry described above |
| `npm run supabase:start`               | Started a local stack and applied migrations                            |
| `npm run db:reset`                     | Passed; all 23 migrations executed against local Supabase               |
| `npm run test:db:concurrency`          | Passed against real local PostgreSQL                                    |
| `npm audit --json`                     | Five development dependency findings: two high, three moderate          |
| `npm audit --omit=dev --json`          | Passed; zero production dependency findings                             |
| `npx supabase migration list --linked` | All 23 local and remote migration versions match                        |

Additional isolated probes reproduced shared-card injection in embedded PostgreSQL
and duplicate AI calls in the mocked API. No production AI call was made. The local
Supabase stack started for this review was stopped afterward, preserving its data.

## Remaining production validation

Use two fresh accounts to exercise Google sign-up and callback, username exchange,
invitation and acceptance, both game modes, microphone permission denial, a long
recording, disconnect/reconnect, scoring, and ending a partnership. Include mobile
Safari and Android Chrome. Verify OAuth publishing/redirect
settings, provider budgets, backups, and error monitoring in their dashboards.
The public health endpoint does not probe those dependencies.

No production data was modified or paid AI requests sent during this review.
