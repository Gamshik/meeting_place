# AGENTS.md

## Purpose

Meeting Place is an English-practice application. Preserve its central rule: one user may have many
partnerships, but every partnership contains exactly two users.

## Architecture rules

- Keep browser code in `src/client`, Worker code in `src/server`, and transport-safe contracts in
  `src/shared`.
- Hono on Cloudflare Workers is the primary backend. Do not introduce a second general-purpose
  backend through Supabase Edge Functions.
- Supabase Auth owns identity; `public.profiles.id` must continue to match `auth.users.id`.
- Treat PostgreSQL constraints and Row Level Security as mandatory security boundaries, not merely
  API implementation details.
- Never use the Supabase service-role key in browser code or committed configuration.
- Keep mutations that cross user boundaries atomic and authorization-checked in database functions.
- Prefer exact username lookup to public user-directory access.
- Create forward-only Supabase migrations. Never edit a migration that may have been deployed;
  create a new timestamped migration instead.
- Keep Cloudflare bindings typed in `src/server/types.ts` and runtime secrets out of source control.

## Style

- Use strict TypeScript and Zod at untrusted request boundaries.
- Keep routes thin: validate, call the domain/database operation, map the response.
- Return API errors as `{ "error": { "code", "message", "details?" } }`.
- Prefer small feature-focused components over large generic abstractions.
- Use accessible labels, native controls, visible focus states, and plain English interface copy.
- Use American English spelling and vocabulary in all user-facing copy and project documentation.
- Treat Neubrutalism as the core visual language. New and updated interface elements must use flat
  high-contrast fills, strong dark outlines, hard offset shadows, bold typography, and deliberately
  compact corner radii. Avoid soft drop shadows, glass effects, and decorative gradients unless an
  existing feature specifically requires them.
- Make interactive elements feel tactile: their hard shadow should shorten or disappear on hover
  and press without relying on color alone. Preserve keyboard focus visibility and reduced-motion
  behavior while applying this treatment.
- Keep user-facing typography readable across the site. Use `17px` for normal body and control text,
  and never render supporting text below `15px` on larger screens or below `16px` at viewport widths
  of `760px` and under. Use the shared typography tokens in `base.css`; do not shrink text to solve a
  layout problem. Sizes below these floors are allowed only for decorative glyphs with no readable
  text content.
- Run Prettier instead of manually aligning code.

## Required verification

Before completing a code change, run all relevant checks. For the normal application path run:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` runs the same sequence. For migration changes, also run `npm run db:reset` when a
local Supabase/Docker environment is available. If it is unavailable, state that the migration was
not executed locally.

## Documentation

Update `README.md` when setup, environment values, deployment, or user-facing capabilities change.
Update `docs/architecture.md` when a system boundary or data lifecycle changes.
