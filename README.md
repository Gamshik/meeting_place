# Meeting Place

Meeting Place helps people practice English together. A user can connect with any number of
learning partners; every partnership is private and contains exactly two people.

This repository contains the first vertical slice:

- Google sign-up and sign-in through Supabase Auth
- automatic user profiles with editable display names and usernames
- invitations by exact username, without exposing a searchable user directory
- accepting, declining, canceling, and ending partnerships
- real-time invitation and partnership updates across signed-in browsers
- invitation attempt limits and a cooldown after a relationship closes
- paginated partner lists and accessible feedback while changes are saved
- friend-only profiles with yearly and monthly practice activity calendars
- a turn-based “explain the word” game with Live call and Recorded practice modes, AI-generated
  cards, creator-selected 1–5 minute explanation rounds, and speech transcription;
  when automatic matching rejects a synonym, the explainer makes the final scoring
  decision without AI review
- a React interface and Hono API deployed together on Cloudflare Workers
- PostgreSQL constraints, atomic functions, and Row Level Security in Supabase

## Interface

Incoming game invitations are handled through the notification toast or notification panel, not a
full-page room card. Opening a room with an unaccepted invitation does not redirect or accept it;
the recipient can leave using Lobby to access notifications. Senders keep their waiting screen.

Both game modes share a compact broadcast-style score strip with colored player names beside dark
score cells, and wrapping names on narrow screens.

Recorded rounds use a compact microphone button that becomes Stop with a countdown while recording.
After recording, players can preview, record again, or send their clue using icon controls.
The controls have accessible labels, keyboard-focus tooltips, and reduced-motion support.
When guessing in Recorded mode, the audio player sits above the answer field. The transcript is
hidden by default and can be opened below the field without moving the answer controls.
After sending a clue, the explainer sees a compact headphone avatar with orbiting clue tiles while
waiting for an answer. The decorative animation pauses with the game and respects reduced motion.

Practice is the home screen. It is deliberately partner-first: the current activity is selected
automatically, and people with a game to join or resume rise to the top. One action opens the game
room, whether the user is starting, joining, or returning to a session. The UI makes the resulting
state explicit as **Start a round**, **Join now**, **Waiting room**, or **Jump back in**. Finished
games appear in the History tab. Each entry in
`src/client/features/games/catalog/model/games.ts` provides its route and session operations; adding
a game requires implementing its route and backend as well as registering it. History shows six
finished games per page in a compact list with game icons, outcomes, scores, and completion times.
Selecting a game opens its Word, Answer, and Result panel beside the list (below it on mobile).
Long round lists scroll within the results panel, keeping the score and column headings visible.
The game counter has a subtle orbit animation that respects reduced-motion preferences.
The **Play again** action uses a lime replay sticker that straightens and rotates its arrow on
mouse hover. Touch screens keep the sticker still while scrolling; reduced-motion preferences
disable its animation.

Friends manages connections only. **Invite** is also available from the global header and Practice
screen, so a missing partner never becomes a navigation dead end. The compact form uses exact
username lookup and explains that invitations are private. After sending, the Invitations list
shows the pending request, with actions to accept, decline, or cancel. Search covers all loaded
partnership pages, and refreshing does not drop older friends. Friend removal is under the friend's
options menu and requires confirmation. Profile fields are editable directly, with Save changes,
Reset, and Copy username actions. Profiles are created on first Google sign-in. A profile activity calendar
counts successful game requests, acceptances, round starts, explanations, guesses, and meaningful
game completions. The default trail shows the previous 365 days with today at the right edge and
connects consecutive active days. Active friends can open one another's profile and see
these aggregates, while recordings, transcripts, answers, and private coaching remain protected.
Each profile keeps an editable IANA activity timezone. It is initially detected from the browser,
never inferred from an IP address, and determines the calendar day for both the owner and friends.

Notifications open in a nonmodal panel anchored to the bell. Friend actions work directly in the
panel during a game. A second game request remains visible, but joining stays disabled until the
current game finishes; declining remains available. Opening notifications does not navigate away or
pause the game. Clicking outside or pressing Escape closes the panel. The dot indicates pending
incoming invitations until they are resolved. Notifications are in-app, not background push
notifications. Dialogs and sections size to content; long notification lists scroll with the close
control visible.

## Technology

- React, TypeScript, Vite, React Router, and Tailwind CSS
- Hono on Cloudflare Workers
- Supabase Auth and PostgreSQL
- Zod, ESLint, Prettier, and Vitest

## Architecture

```text
Browser
  ├─ React UI
  ├─ Supabase Auth and participant-authorized Realtime events
  └─ authenticated /api requests
          ↓
Cloudflare Worker / Hono
          ↓ user JWT, never a service-role key
Supabase Postgres
  ├─ row-level security
  ├─ atomic partnership functions
  └─ partnership change publication
```

The frontend and API share request types and validation rules in `src/shared`. The Worker validates
the Supabase access token and forwards that user's identity to PostgreSQL. Business invariants are
also enforced in the database, so bypassing the UI cannot create invalid partnerships.
Supabase Realtime tells an authorized browser when one of its partnership rows changes; the browser
then reloads the canonical partnership view through the Worker API.

See [docs/architecture.md](docs/architecture.md) for the boundaries and design decisions.

## Requirements

- Node.js 22 or newer
- npm 10 or newer
- Docker Desktop only if you want to run Supabase locally
- Supabase and Cloudflare accounts for a hosted environment
- a Google Cloud OAuth client for Google sign-in

## Local development

### 1. Install the project

```sh
npm install
```

### 2. Choose a database

The quickest option is a hosted Supabase development project. Follow the hosted setup below, apply
the migration, and use that project's URL and publishable key locally.

To run Supabase locally instead, start Docker Desktop and run:

```sh
npm run supabase:start
npm run db:reset
```

The start command prints the local API URL and anon key.

### 3. Configure local environment values

Copy `.env.example` to `.env.local` and `.dev.vars.example` to `.dev.vars`. Put the same Supabase URL
and publishable/anon key in both files:

```dotenv
# .env.local — values used by the React build
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-or-anon-key
```

```dotenv
# .dev.vars — values available to the local Worker
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-publishable-or-anon-key
OPENROUTER_API_KEY=your-openrouter-api-key
OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=http://localhost:5173
```

These files are ignored by Git. A Supabase publishable/anon key is intended for public clients; the
database is protected by Row Level Security. Never put a Supabase service-role key in either file.
The OpenRouter key is private and belongs only in `.dev.vars` or Cloudflare runtime secrets. The
configured text model must support structured JSON output. MAI-Transcribe 2 is selected in server
code for speech-to-text. Browser recordings are converted locally to 16 kHz mono WAV before upload
because that format is supported consistently by the transcription provider.

### 4. Start the application

```sh
npm run dev
```

Open `http://localhost:5173`. The public API health check is available at
`http://localhost:5173/api/health`.

## Create and connect a hosted Supabase project

These steps intentionally require you to use your own accounts and credentials.

1. In the Supabase dashboard, create a project and keep its database password somewhere safe.
2. Open **Project Settings → API** and copy the project URL and the publishable key. Older projects
   may label it the `anon` key.
3. Authenticate the local CLI and connect this repository:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Review the pending migration, then apply it:

   ```sh
   npx supabase db push --dry-run
   npm run db:push
   ```

5. In **Authentication → URL Configuration**, initially set:

   - Site URL: `http://localhost:5173`
   - Redirect URL: `http://localhost:5173/auth/callback`

6. Put the project URL and publishable key in `.env.local` and `.dev.vars` as described above.

The migrations in `supabase/migrations` create the schema, triggers, database
functions, permissions, and Row Level Security policies. Do not reproduce it manually in the SQL
editor.

The hardening migration changes the invitation RPC result and partnership pagination arguments.
Apply it with a coordinated deployment of the current Worker and frontend; do not run an older
application version against the updated RPC contracts. Always apply new migrations rather than
editing previously deployed ones.

## Configure the backend card writer

The migration `202610020001_restrict_shared_card_writes.sql` removes browser access to shared
card writes and creates the `word_card_writer` PostgreSQL login without a password. The Worker
uses that login to execute `private.cache_word_game_cards`;
it has no direct application
table access. All ordinary API operations continue to use the signed-in user's JWT.

After applying the migrations, connect as the database administrator using `psql` and set a
unique password interactively (do not commit it or include it in a SQL migration):

```text
\password word_card_writer
```

Set `WORD_CARD_DATABASE_URL` in `.dev.vars` for development and as a Cloudflare Worker secret:

```sh
npx wrangler secret put WORD_CARD_DATABASE_URL
```

For hosted Supabase, copy the project's **transaction pooler** connection string from its Connect
dialog. Replace the username with `word_card_writer.PROJECT_REF` and use that role's password,
percent-encoded. Keep the actual pooler host shown by Supabase and require TLS verification:

```text
postgresql://word_card_writer.PROJECT_REF:ENCODED_PASSWORD@YOUR_POOLER_HOST:6543/postgres?sslmode=verify-full
```

For a Supabase server whose certificate requires its own CA, download the certificate from
**Database Settings → SSL Configuration**. Set `WORD_CARD_DATABASE_CA_CERT` to the full PEM
certificate in `.dev.vars` (a quoted value with `\n` between lines is supported). This value is
certificate content, not a local filename. The driver uses it with certificate and hostname
verification enabled. Downloading the file alone does not configure trust.

For deployment, supply the same PEM content using:

```sh
npx wrangler secret put WORD_CARD_DATABASE_CA_CERT
```

Restart the local dev server after editing `.dev.vars`. A `SELF_SIGNED_CERT_IN_CHAIN` error in
reservation logs means the driver cannot verify the certificate chain. Never fix it by disabling
verification. See [Supabase SSL configuration](https://supabase.com/docs/guides/platform/ssl-enforcement).
The API deliberately returns a generic error; server logs include only recognized error codes,
not connection strings or database messages.

For local Supabase, use:

```text
postgresql://word_card_writer:ENCODED_PASSWORD@127.0.0.1:54322/postgres
```

Never substitute the `postgres` login or grant `word_card_writer` to `authenticated`, `anon`,
or `authenticator`. Never put this URL in a `VITE_` variable. The Worker makes a short-lived,
parameterized connection through `pg` and closes it after each operation; transaction
pooling avoids retaining an edge connection between requests. See the official
[Supabase connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
and [Cloudflare PostgreSQL guide](https://developers.cloudflare.com/workers/tutorials/postgres/).

Deploy this change by applying the forward migration, setting the role password and Worker
secret, and then deploying the updated Worker. Existing stored cards still work without the
writer secret; generation is skipped until it is configured. If no stored fallback exists,
the API returns `503 word_card_store_unavailable`. The old Worker cannot replenish the pool
after the migration, so coordinate the rollout. To rotate the credential, change the role
password and replace the Worker secret; check the pooler's password cache behavior when rotating.

## AI action reservations

Apply the pending migrations, including `202610020003_game_ai_over_authenticated_rpc.sql`,
using `npm run db:push`. Restart the local dev server; for production, deploy with
`npm run deploy`. Reservations use the existing authenticated Supabase HTTPS client. They
need no database URL, certificate, or additional secret. The existing OpenRouter key signs
cached results so browser users cannot forge provider output. Rotating that key invalidates
unfinished cached results; finish or end affected games before rotation.

Direct PostgreSQL access is still used by the earlier shared-card writer, only when saving
newly generated cards. Its configuration is separate from recording transcription.

The Worker reserves card generation per game turn and transcription per recording round in
PostgreSQL before doing paid work. Overlapping requests receive `409 ai_processing` with
`Retry-After`; they do not upload another recording or call AI. Reservations expire after two
minutes. Confirmed failures release them immediately; an uncertain network failure or timeout
keeps the reservation until expiry. Provider requests have a 60-second timeout within a
90-second operation deadline. Authenticated Supabase requests, including uploads, have a
30-second timeout so stalled storage calls cannot indefinitely occupy a reservation.

Successful provider results are saved before the final game mutation. A retry with the same
topic or recording bytes reuses the result without another AI call. A different input for an
already completed action returns `409 ai_action_conflict`. A lost provider response cannot be
recovered by this cache: after expiry, a retry may incur another charge. This is duplicate
suppression, not a guarantee of exactly one provider charge under network failures.

Recording submission now calls only transcription. Historical coaching data is preserved;
new rounds save null coaching fields. This change does not introduce account usage quotas.
If the RPC migration or Supabase API is unavailable, paid work fails closed with
`503 ai_reservation_unavailable`. Already pooled cards remain playable. Apply the migration
before deploying; old Workers do not honor reservations, so retire the old version during rollout.

## AI usage accounting

Each actual OpenRouter attempt records a signed receipt with the triggering account, operation,
model, provider request ID, reported cost, token counts, and audio duration when available.
There are no usage quotas or manually maintained prices. Cached retries and pooled cards do not
add another charge. Unknown costs remain null and are counted separately from confirmed zero.

Apply `202610020004_track_ai_usage.sql` with `npm run db:push`, then restart development or deploy
the updated Worker. Accounting uses the existing authenticated Supabase connection. No new secret
is required. Optional `AI_USAGE_SIGNING_KEY` provides a stable signing key independent of OpenRouter
key rotation; set it before first use, or preserve the previous signing value when rotating keys.
The read-only `GET /api/ai-usage` endpoint reports the signed-in account's verified entries and
page subtotals, defaulting to the current UTC month. It supports `from`, `to`, `beforeCreatedAt`,
and `beforeId` parameters. Costs use decimal strings; unknown and unverifiable rows are explicit.

See [the usage accounting check guide](docs/ai-usage-testing.md) for browser steps, examples,
repeat-submission checks, tests, pagination, and failure/reconciliation limitations.

## Owner admin panel

The read-only `/admin` page shows all users with verified word-token totals, transcription duration, and combined AI spending
in USD, with All time and This month (UTC) filters. Only the single profile with `is_admin = true`
can access it. Apply `202610020005_add_owner_admin.sql`, then assign your existing account's flag
manually in the Supabase SQL Editor. Regular users cannot change that field. Reload to reveal the
Admin navigation item. No additional credentials are needed.

See [owner admin setup and testing](docs/admin-testing.md) for the exact SQL, access checks,
reporting semantics, and limits. Unknown or unverified usage is explicitly marked as incomplete.

## Configure Google sign-in

1. In Google Cloud Console, create or select a project.
2. Configure its OAuth consent screen.
3. Create an **OAuth client ID** with application type **Web application**.
4. In Supabase, open **Authentication → Providers → Google**. Supabase displays the callback URL for
   your project. It normally looks like:

   ```text
   https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback
   ```

5. Add that exact Supabase callback URL to the Google client's **Authorized redirect URIs**.
6. Copy the Google client ID and client secret into the Supabase Google provider settings and enable
   the provider.
7. Keep `http://localhost:5173/auth/callback` in Supabase's redirect allow list while developing.

Google redirects to Supabase first; Supabase then redirects back to `/auth/callback` in this app.
The application uses the PKCE flow and creates the profile in the database on the first sign-in.

## Deploy to Cloudflare Workers

### 1. Prepare the frontend build values

Vite reads `.env.local` during a local deployment, so make sure it contains the hosted Supabase URL
and publishable key. If Cloudflare Builds will build the repository instead, add
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as build variables in Cloudflare.

### 2. Authenticate Wrangler

```sh
npx wrangler login
```

### 3. Create the Worker

Make the first deployment to create the Cloudflare application:

```sh
npm run deploy
```

Wrangler will print a URL similar to `https://meeting-place.YOUR-SUBDOMAIN.workers.dev`. Authenticated
API routes will not work until the next step adds their runtime values.

### 4. Add Worker runtime values

The Worker needs the same non-privileged Supabase connection values at runtime:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put OPENROUTER_API_KEY
```

Enter each value when prompted. The two Supabase values are deliberately the project URL and
publishable/anon key—not the service-role key. `OPENROUTER_API_KEY` is the private provider key.

Add the non-secret model configuration as Worker runtime variables in Cloudflare:

```dotenv
OPENROUTER_TEXT_MODEL=openai/gpt-4o-mini
OPENROUTER_SITE_URL=https://YOUR-WORKER-URL
```

If you configure these through Cloudflare's dashboard instead, add them under the Worker's
**Settings → Variables & Secrets** section. This runtime section is different from **Settings →
Build → Build Variables and Secrets**. The repository sets `keep_vars` so dashboard-managed runtime
variables are preserved by later Wrangler deployments.

Deploy once more so the code and configuration are active together:

```sh
npm run deploy
```

### 5. Allow the production authentication redirect

In Supabase **Authentication → URL Configuration**:

- change the Site URL to your final Worker URL (or your custom domain);
- add `https://YOUR-WORKER-URL/auth/callback` to the Redirect URLs;
- keep the localhost callback if you still use local development.

No change to the Google callback is required when only the app's Worker URL changes: Google still
returns to Supabase's `/auth/v1/callback`, and Supabase returns to this application.

## Commands

| Command                       | Purpose                                        |
| ----------------------------- | ---------------------------------------------- |
| `npm run dev`                 | Run React and the Worker locally               |
| `npm run dev:tunnel`          | Run locally behind an HTTPS development tunnel |
| `npm run build`               | Type-check and create a production bundle      |
| `npm run lint`                | Run ESLint                                     |
| `npm run typecheck`           | Check TypeScript                               |
| `npm test`                    | Run unit tests once                            |
| `npm run test:e2e`            | Run browser regression tests                   |
| `npm run test:db:concurrency` | Test concurrent requests on local Supabase     |
| `npm run format`              | Format source files                            |
| `npm run format:check`        | Check formatting without changing files        |
| `npm run check`               | Run all repository checks                      |
| `npm run deploy`              | Build and deploy to Cloudflare Workers         |
| `npm run supabase:start`      | Start local Supabase using Docker              |
| `npm run db:reset`            | Rebuild the local database from migrations     |
| `npm run db:push`             | Apply local migrations to the linked project   |

## Security notes

- Never expose or commit the Supabase service-role key.
- Ordinary browser and Worker database access uses the current user's JWT and the publishable/anon
  key. Shared card insertion alone uses the restricted backend login described above.
- Invitations are created by a `security definer` database function that performs an exact username
  lookup; authenticated users cannot enumerate every profile.
- Partnership changes are performed by database functions with participant checks.
- Keep production environment values in the platform dashboards, not committed files.
- Every account can make ten invitation attempts in a rolling hour, including invalid usernames,
  failed lookups, and duplicate invitations. A pair must wait seven days after a decline,
  cancellation, or ended partnership before another invitation. Database locks and a private,
  bounded attempt ledger enforce these rules for direct Supabase RPC calls as well as Worker calls.
- Production builds generate `dist/client/_headers` with a Content Security Policy restricted to
  the configured Supabase origin for connections, plus framing, content-type, referrer, and
  permissions protections. Rebuild after changing the Supabase URL. Local Vite development does
  not apply these production headers. Avatar images may load over HTTPS.
- Worker observability is enabled. Application error logs contain infrastructure codes rather than
  database error text or request bodies. API responses are marked `Cache-Control: no-store`.
- Game recordings are stored in a private Supabase Storage bucket and forwarded to OpenRouter for
  transcription. Only the two active participants can request short-lived playback links.
  Transcripts and historical private coaching are stored; the guessing player cannot retrieve the secret before
  the round ends.

## Testing

`npm run check` runs formatting, lint, type checking, unit/API tests, embedded PostgreSQL migration
tests, and a production build. Embedded tests execute both application migrations with minimal
Supabase identity fixtures; the pgcrypto UUID alias uses PostgreSQL's built-in UUID function.
They check RLS, privileges, lifecycle rules, lookup limits, cooldowns, username collisions, and
pagination. They do not replace validation against the full Supabase services.

To exercise the speaking game manually, apply the latest migration, configure the three OpenRouter
values above, and sign in with two accounts that have an active partnership. The first player sends
a game request. Confirm that the other browser shows the request in **Notifications**, and that neither
player can start a round before the second player accepts. Confirm that the invitation shows the mode
selected by its sender. The creator chooses a 1–5 minute explanation-time preset before inviting. They
can change the preset later from the game header; both players see the update immediately, while the current
round keeps its original timer and the new value begins with the next round. In Recorded practice,
the first player chooses a topic, records an
explanation, and sends it. While recording, confirm that the second browser sees the synchronized
configured recording timer. After the explanation arrives, both players must see the 90-second
listening timer and the guesser receives an audio player, the transcript, and the answer field. The
secret must stay hidden from the guesser until the result; a correct guess
awards the explainer one point, saying the secret produces no point, and the next turn belongs to
the previous guesser. Recording submission makes only a transcription AI call; no coaching is generated. In Live call, confirm that
creating a word starts the same five-second preparation countdown in both browsers. When it ends,
both players must see the configured explanation timer and only the guesser must receive the answer
field. When the configured clue time ends, both see a final 30-second guessing timer and the explainer is told to
stay quiet. The explainer speaks in the external call; no recording controls should appear. A matching guess is
scored using the honor system for forbidden words. Browser microphone access for Recorded practice
requires localhost or HTTPS.
Generated vocabulary is retained in a private shared card pool. A round first selects a random card
that neither participant has seen. If none exists, the Worker requests one batch from OpenRouter,
stores every valid new card, and retries the selection once. A duplicate-only or unavailable AI
response falls back to the card least recently seen by either player, so a round never loops on AI
generation. Applying the pool migration also imports existing round words and exposures.
Each built-in topic starts with ten curated cards, so an unavailable provider does not block a fresh
installation.
If either player leaves an active game, the session pauses and shows a five-minute reconnect timer.
Returning in time resumes the same round; otherwise the game finishes and all actions stay locked.
Either participant can also use **End game** to finish the session immediately. The player who ends
it returns to Games; the other player receives the final score and can choose **Go home** or **View
results**. The game screen remains in place until they choose; **View results** opens History,
selects the completed game, and focuses its saved round results.
Active and paused sessions appear under **Continue playing**. Every completed session appears in the
separate **History** tab, with its score and saved round-by-round results. Incoming requests appear in
Notifications. Starting again creates a fresh game request without deleting the previous game or its
rounds. A player may have only one active or paused game at a time. A new request is not created when
either player is already playing, and another invitation cannot be accepted until the current game
ends.

Install Chromium once with `npx playwright install chromium`, then run `npm run test:e2e`.
Browser tests build and serve the production application with isolated fake sessions and intercepted
API responses. They check the interface and static security headers, not Google's live OAuth service.
The test server uses port 5174 and test-only Supabase values. Rebuild with your normal environment
values before deployment; the browser test build uses a deliberately fictitious Supabase project.

With Docker running, use `npm run supabase:start`, `npm run db:reset`, and
`npm run test:db:concurrency`. The last command only connects to local Supabase on port 54322,
creates disposable accounts, tests racing requests, and removes its fixtures. CI runs these
checks in a separate database job, and runs browser tests in the main verification job.

## Current scope

The current application covers identity, two-person partnerships, and the first turn-based speaking
activity. Meetings, background push notifications, additional game types in the shared activity
calendar, realtime game updates, and billing belong in later vertical slices.
