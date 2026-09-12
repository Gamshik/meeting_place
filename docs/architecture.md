# Architecture

## Product model

A `profile` represents one authenticated learner. A `partnership` represents one private learning
relationship between exactly two profiles. A profile can participate in any number of partnerships.

Partnerships move through a small lifecycle:

```text
pending ──accept──> active ──leave──> ended
   │
   ├──decline──> declined
   └──cancel───> ended
```

Declined and ended records are retained for future auditing and history, but the current API only
lists pending and active relationships. A partial unique index prevents another pending or active
relationship from being created for the same unordered pair.

## Runtime boundaries

### React client

The client owns rendering, navigation, Supabase's OAuth browser flow, and local interaction state.
It never contains privileged credentials and does not mutate product data directly. An authenticated
Realtime subscription listens for changes to participant-visible partnership rows. Events are
treated as invalidation signals: the client debounces them and reloads the canonical partnership
view through the Hono API rather than constructing joined partner data from an event payload.

### Hono API

The API is the application's server boundary. It:

- verifies the Supabase access token;
- validates request data with shared Zod schemas;
- invokes database operations in the current user's security context;
- maps infrastructure errors to stable API responses;
- will later protect AI provider keys and enforce usage limits.

The API and static frontend are one Cloudflare Worker deployment. `/api/*` executes the Worker;
browser routes and assets are handled by Cloudflare's static asset support.

### Supabase

Supabase owns authentication and persistent data. PostgreSQL is also the final authorization and
consistency boundary:

- Row Level Security limits direct table access.
- `invite_partner` performs an exact private user lookup and atomic invitation insert.
- `respond_to_partnership` allows only the invitee to accept or decline a pending invitation.
- `end_partnership` allows a participant to end an active relationship and an inviter to cancel a
  pending invitation.
- `list_my_partnerships` returns only relationships containing the authenticated user.

Invitation attempts are limited to ten per account in a rolling hour, stored as at most ten
timestamps in `private.invitation_limits`. That schema is not exposed to clients, and the table
has RLS enabled with no client grants. The invitation function locks the account's ledger row,
counts all attempts before looking up a username, and returns expected failures as JSON values
instead of exceptions so rejected attempts commit their counters. Unexpected failures still
abort the transaction. Direct authenticated RPC calls have the same restrictions as the Worker.

Invitation creation and lifecycle mutations share an advisory transaction lock for the unordered
pair. This serializes competing invites and prevents an invitation from racing an end/decline to
bypass the seven-day cooldown. The unique index remains the final open-pair constraint.
Profile creation retries a username collision with a new random suffix.

Lists use a `(created_at, id)` cursor ordered descending, with 50 visible items per Worker page
and a database maximum of 100 rows per call. The Worker fetches one extra row to determine whether
there is a next page. The client appends pages and discards stale refresh responses. Dashboard
mutations are serialized while controls show pending states.

Expected domain errors are explicitly mapped to stable HTTP errors. Unexpected database errors
produce generic 500 responses and sanitized diagnostic logs. Auth service outages return 503.
Static assets receive production security headers generated during the frontend build; API
middleware separately protects API responses and disables their caching.

`public.partnerships` belongs to the Supabase Realtime publication. Postgres Changes applies the
table's participant-only `select` policy before delivering an insert or update over WebSockets, so
unrelated accounts cannot observe relationship activity. The client reloads after the channel first
subscribes to close the race between its initial HTTP request and WebSocket connection. It also
reloads after its own mutations, so a temporary Realtime outage does not delay local confirmation.

These operations are database functions because they cross privacy boundaries or must remain
atomic. Ordinary self-profile updates use standard row operations under RLS.

## Explain-the-word game

Each active partnership can have at most one unfinished `word_games` record and any number of
finished records. Its `word_game_rounds` rows stay attached to that immutable finished session, so a
new game never erases earlier results. Rounds alternate the explainer between the partnership's two
users. Security-definer database functions lock and advance the turn atomically; direct table access
is revoked. The game-state function shapes its response for the caller, so an unfinished round's
secret word and forbidden forms are visible only to the explainer.

A profile can participate in only one active or paused game at a time across all partnerships. Game
request creation and acceptance lock both participant profile rows in stable order, then check for
another ongoing game before inserting or activating the request. This makes simultaneous operations
serialize and keeps the rule effective for direct authenticated RPC Supabase calls as well as the
Worker API.

Reusable B1–B2 cards live in a private database pool. Per-profile exposure rows prevent a card from
being selected when either participant has seen it before. Card selection, round creation, exposure
updates, and usage counters run in one authorization-checked database transaction. When no unseen
card remains for a topic, the Worker asks the configured OpenRouter text model for one batch of up
to 20 cards. Structurally valid, non-conflicting cards are cached for later rounds, including cards
not selected immediately. Grammatical answer aliases are globally unique, so case, punctuation, and
singular/plural variants cannot become separate cards. Existing round snapshots are backfilled into
the exposure ledger when the pool migration is applied. Ten curated cards per supported topic
provide a cold-start fallback before the pool grows through normal play.

There is never more than one word-generation request for a round. If the generated batch contains
no unseen card or the provider is unavailable, PostgreSQL selects the card least recently seen by
either participant. An error is returned only when the topic has no stored card at all. Increasing
model temperature and varying the requested vocabulary focus improve variety, but the database—not
the model prompt—enforces deduplication and the terminating fallback.

The Worker also calls
`microsoft/mai-transcribe-2` in verbatim mode for each completed browser recording. A game begins in
the `pending` state and becomes active only when the other participant accepts. The browser converts
recordings to mono WAV, and the Worker stores them in a private Supabase Storage bucket before
transcription. Storage policies limit uploads to the current explainer and playback to the two active
participants. The transcript, word timestamps, recording path, and private coaching are stored on
the round. The partner's normalized answer and deterministic forbidden-word detection decide the
shared point; AI coaching never changes the official score.

The dashboard and game page poll the canonical game state while waiting for invitations, acceptance,
recordings, or guesses. Recording links are short-lived signed URLs rather than public object URLs.
This keeps the first slice simple and allows a later move to participant-authorized Realtime
invalidation without changing the database ownership model.

Active game pages also send a short authenticated presence heartbeat. Once both players have joined,
an explicit departure or a missing heartbeat pauses the session and locks server-side mutations. A
returning player resumes the same round when both participants are present again. The reconnect
window is five minutes; its deadline and terminal state live in PostgreSQL, so refreshing the browser
cannot bypass them. A recorder already running remains mounted and can finish locally while paused,
but its result cannot be submitted unless the session resumes before expiry.
Either participant may also finish an active or paused session immediately. This transition is
authorization-checked in PostgreSQL; both clients leave the game screen after observing the terminal
state.
The dashboard separates live game sessions, friendship controls, and full game history. Both the live
game and each completed result expose an ordered rounds table. Playing again inserts a new pending
session for the same partnership while preserving the finished game, its score, and all of its round
rows.

## Dependency direction

```text
client ───────> shared
server ───────> shared
client ─X─────> server internals
server ─X─────> client internals
```

Shared code contains serializable contracts, validation, and generated database types. It must not
depend on browser or Worker-specific modules.

## Adding a feature

Prefer a complete vertical slice:

1. add or change a migration when persistence is required;
2. update shared validation and response types;
3. add a focused Hono route;
4. add the React feature;
5. test the invariant at the lowest practical layer;
6. run `npm run check`.

Do not add Supabase Edge Functions for ordinary API behavior. The Cloudflare Worker is the primary
backend. A Supabase Edge Function is appropriate only when a concrete platform integration makes it
the clearer boundary.

## Future growth

Future tables should reference `partnerships.id` for shared topics, meetings, and activities.
Personal feedback should reference both the activity and its owning profile so one partner cannot
read the other's private coaching data. AI calls are made by the Worker, with provider keys in
Cloudflare secrets. A future billing slice should record provider usage before returning results.

## Shared client activity

A provider inside the authenticated route loads every page of the current user's partnerships and
registered game summaries. It stays mounted while navigating between Games, Friends, Profile, and
a game. Realtime partnership events and foreground polling refresh the canonical API data, replacing
the complete snapshot together. This lets friend search and notifications include older pages
without dropping them on refresh. No public profile directory is queried.

Game registration supplies session operations and a route; game rules and authorization still live
in the existing Worker and database. The Games workspace sends or accepts a request before entering
the game route. Active sessions are reopened instead of restarted. The shared notification panel
uses the same snapshot and can accept invitations without a route change when the player is free.
Notifications have no separate persistent store or push service; the bell marks currently pending
incoming invitations.
