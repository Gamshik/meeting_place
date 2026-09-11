# Meeting Place

Meeting Place helps people practise English together. A user can connect with any number of
learning partners; every partnership is private and contains exactly two people.

This repository contains the first vertical slice:

- Google sign-up and sign-in through Supabase Auth
- automatic user profiles with editable display names and usernames
- invitations by exact username, without exposing a searchable user directory
- accepting, declining, cancelling, and ending partnerships
- invitation attempt limits and a cooldown after a relationship closes
- paginated partner lists and accessible feedback while changes are saved
- a React interface and Hono API deployed together on Cloudflare Workers
- PostgreSQL constraints, atomic functions, and Row Level Security in Supabase

## Technology

- React, TypeScript, Vite, React Router, and Tailwind CSS
- Hono on Cloudflare Workers
- Supabase Auth and PostgreSQL
- Zod, ESLint, Prettier, and Vitest

## Architecture

```text
Browser
  ├─ React UI
  ├─ Supabase Auth (Google OAuth and session refresh)
  └─ authenticated /api requests
          ↓
Cloudflare Worker / Hono
          ↓ user JWT, never a service-role key
Supabase Postgres
  ├─ row-level security
  └─ atomic partnership functions
```

The frontend and API share request types and validation rules in `src/shared`. The Worker validates
the Supabase access token and forwards that user's identity to PostgreSQL. Business invariants are
also enforced in the database, so bypassing the UI cannot create invalid partnerships.

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
```

These files are ignored by Git. A Supabase publishable/anon key is intended for public clients; the
database is protected by Row Level Security. Never put a Supabase service-role key in either file.

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
```

Enter each value when prompted. Despite the command name, these are deliberately the project URL
and publishable/anon key—not the service-role key.

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

| Command                       | Purpose                                      |
| ----------------------------- | -------------------------------------------- |
| `npm run dev`                 | Run React and the Worker locally             |
| `npm run build`               | Type-check and create a production bundle    |
| `npm run lint`                | Run ESLint                                   |
| `npm run typecheck`           | Check TypeScript                             |
| `npm test`                    | Run unit tests once                          |
| `npm run test:e2e`            | Run browser regression tests                 |
| `npm run test:db:concurrency` | Test concurrent requests on local Supabase   |
| `npm run format`              | Format source files                          |
| `npm run format:check`        | Check formatting without changing files      |
| `npm run check`               | Run all repository checks                    |
| `npm run deploy`              | Build and deploy to Cloudflare Workers       |
| `npm run supabase:start`      | Start local Supabase using Docker            |
| `npm run db:reset`            | Rebuild the local database from migrations   |
| `npm run db:push`             | Apply local migrations to the linked project |

## Security notes

- Never expose or commit the Supabase service-role key.
- Browser and Worker database access uses the current user's JWT and the publishable/anon key.
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

## Testing

`npm run check` runs formatting, lint, type checking, unit/API tests, embedded PostgreSQL migration
tests, and a production build. Embedded tests execute both application migrations with minimal
Supabase identity fixtures; the pgcrypto UUID alias uses PostgreSQL's built-in UUID function.
They check RLS, privileges, lifecycle rules, lookup limits, cooldowns, username collisions, and
pagination. They do not replace validation against the full Supabase services.

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

This foundation intentionally stops at identity and two-person partnerships. Meetings, topics,
activities, AI orchestration, speech transcription, notifications, and billing belong in later
vertical slices.
