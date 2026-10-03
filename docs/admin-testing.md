# Owner admin setup and testing

The read-only `/admin` page lists all profiles, including accounts with no usage, with verified
word-token totals, transcription duration in seconds, and combined AI spending in USD. It defaults to All time; This month uses UTC boundaries.
Only one profile can be an administrator. An Admin navigation link appears only for that account.

## Setup

1. Apply pending forward migrations with `npm run db:push` to your intended Supabase project.
   This includes `202610020005_add_owner_admin.sql` and the earlier usage accounting migration.
2. In Supabase Authentication, copy your existing account's user UUID. In the SQL Editor, run:

   ```sql
   update public.profiles
   set is_admin = true
   where id = 'YOUR_AUTH_USER_UUID'::uuid;
   ```

   Confirm exactly one row was updated. Never use another account's UUID. No application endpoint
   grants this permission. The normal profile-update grants do not include `is_admin`.

3. Start development with `npm run dev`, or deploy the application with `npm run deploy`.
   Reload the browser after changing your admin flag.
4. Keep the existing usage signing secret unchanged. Reporting uses `AI_USAGE_SIGNING_KEY`, falling
   back to `OPENROUTER_API_KEY`; changing its value makes old receipts unverifiable.

To remove access, set your profile's `is_admin` to `false` in the SQL Editor. To transfer access,
clear the existing flag and set the new account's flag in one transaction. A second simultaneous
admin is rejected by the `profiles_single_admin` unique index.

## Browser checks

1. Sign in with your admin account. Open **Admin** in the navigation. Confirm the list includes
   your account, other profiles, and accounts without usage. The latter show zero word tokens, zero seconds, and $0.00.
2. Compare a user's totals with their verified accounting history. Totals include every receipt
   in the selected period, even when there are more than 100 or 500 usage records.
3. Switch between **All time** and **This month (UTC)**. Old usage should appear only in All time.
   The user list resets to its first page when the period changes.
4. With more than 20 profiles, use Next and Previous. Each page shows up to 20 users; user pagination
   does not limit the history included in their totals. Refresh recalculates the current page.
5. Make a real paid AI request, then refresh. The triggering account's known cost should increase
   if the provider returned cost metadata. A cached retry or pooled card must not add spending.
   Missing word-token metadata or transcription duration may show an incomplete indicator even when the dollar cost is known. Transcription does not require token metadata.
6. Sign in as a regular user in another browser session. There must be no Admin menu item.
   Visiting `/admin` directly must show an access message and no user list. A request to
   `/api/admin/users` with that user's bearer token must return 403; without a token it returns 401.
7. Revoke your admin flag in the SQL Editor while the page is open. Refresh must clear the old
   report and show an access error. Reloading also removes the navigation item.

Use test accounts and a development database for negative database checks: an authenticated user
must not be able to update `is_admin`, enumerate users through `admin_list_users`, or read others'
receipts through `admin_list_usage`. The automated database tests exercise these cases, including
the second-admin constraint. Do not alter real accounting receipts to test signature failures.

## Reporting semantics and limits

- Dollar amounts are decimal strings summed with integer arithmetic. Word-token totals are accumulated as integers from card-generation receipts only. Missing total
  tokens fall back to input plus output only if both exist. Transcription duration sums reported
  audio seconds from transcription receipts only; absent duration remains unknown. Dollar totals
  include both operations and use provider-reported costs, not token or duration-based estimates.
- Unknown costs, missing word-token counts, and missing transcription durations are not treated as confirmed zero. Invalid signatures
  or mismatched receipt identities are excluded. The UI marks the affected totals as known amounts
  and shows counts explaining incomplete data.
- All time means since usage tracking began. Shared-card generation is attributed to its triggering
  user. Deleting an account deletes its ledger entries under the existing accounting lifecycle.
- Reports scan receipts for the current page of users on the Worker. Each report fixes its date
  boundaries, but concurrent receipt updates may require a refresh; this is not an immutable
  accounting snapshot. Subsequent user pages use their own request time.
- At most 50,000 receipts are scanned per user page. A larger report, database failure, or runtime
  failure must not display partial totals as complete. The API returns an error; try This month.
  Larger installations will need a verified aggregation pipeline.

## Automated verification

```sh
npm run check
npm run db:reset
```

`npm run check` includes API tests for authorization, signature verification, complete totals across
receipt batches, missing metadata, zero-usage users, user pagination, and UTC periods. The embedded
PostgreSQL security suite applies all migrations and tests database authorization and constraints.
`npm run db:reset` additionally requires a running local Supabase/Docker environment and resets
that local database; it is not needed against your hosted project.
