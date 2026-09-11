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
read the other's private coaching data. AI calls should be made by the Worker, with provider keys in
Cloudflare secrets and usage recorded before returning results.
