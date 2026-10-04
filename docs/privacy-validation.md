# Adult onboarding and recording retention

## Implemented rules

- Only users who declare they are 18+ and accept Terms version `2026-10-04` can use authenticated app APIs. This is self-declaration, not verified age or parental consent.
- The Google button opens a confirmation dialog with unchecked age and Terms boxes. Only confirming both starts Google sign-in. A tab-scoped pending choice expires after 30 minutes; after OAuth returns it is saved against the authenticated account and cleared. Missing or expired choices fall back to authenticated onboarding. Google/Supabase can create the basic identity and profile before this final confirmation; no practice UI is mounted first.
- The database stores the authenticated user ID, Terms version, adult declaration, and server timestamp in `private.legal_acceptances`. Repeat acceptance preserves the original time. Users cannot write the table directly, choose another user, or accept an obsolete version.
- The API fails closed if the acceptance lookup fails. Database triggers additionally reject unaccepted partnership, game, round, and AI reservation mutations, including direct RPCs. Storage RLS also requires acceptance. Existing participant authorization is preserved.
- Privacy information is a notice, not a blanket processing-consent checkbox. These records do not establish consent for every use of personal data.
- Audio expires seven days after its first Storage upload. Replacement does not extend the original object's expiry. New reads and replacements are denied at expiry; existing signed links can last up to five minutes. A scheduled Worker deletes expired files every 15 minutes, up to 2,000 per run. Failed uploads left in Storage are included. Failures/backlogs can delay physical deletion and must be monitored.
- Deletion uses the Storage API, never a SQL deletion of `storage.objects`. After successful removal, missing expired audio references are cleared. The job is retryable and runs reconciliation even after an interrupted prior run.
- Transcripts, word timestamps, guesses, scores, account information, Terms records, and AI usage are NOT subject to the seven-day audio rule.
- Public Terms/Privacy pages and profile settings link to `gkovsharov05@gmail.com` for verified manual privacy/deletion requests. There is no automatic account deletion button or email-sending integration.

## Apply and deploy

1. Review the new forward-only migration, then run `npm run db:push`. This affects existing users: everyone without current acceptance must confirm again. Existing audio older than seven days becomes eligible for deletion.
2. Find the server-side service-role key in Supabase API settings. Save it with `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY`. Paste only into the terminal prompt. For local scheduled testing, set it in ignored `.dev.vars`. Never put it in a `VITE_` variable, a browser bundle, or Git.
3. Run `npm run check`, then `npm run deploy`. `wrangler.jsonc` installs the `*/15 * * * *` scheduled trigger. Cloudflare trigger changes can take up to 15 minutes to propagate.
4. Check Cloudflare's Worker scheduled events/logs for `Recording retention completed`. Missing configuration and deletion errors fail the scheduled invocation. Configure failure notifications in your hosting monitoring and investigate repeated failures or a count of 2,000 (the batch cap).
5. Monitor `gkovsharov05@gmail.com` for privacy requests. The mailbox is a manual operational responsibility; the app cannot verify inbox delivery or guarantee a response.

## Browser validation

1. Sign out and open `/login`. Click the Google button: the confirmation dialog opens with both boxes unchecked. Continue stays disabled until both are checked. Cancel or Escape closes it without starting OAuth. Terms and Privacy open without signing in.
2. Confirm both choices and sign in with a new account. The callback saves acceptance without showing the form again. If that save fails, retry is offered and app access remains blocked. If the callback has no valid pending choice, the app shows `Before you practice`. Continue stays disabled until BOTH boxes are checked. Links open the full documents without losing the form. Declining leaves the game unavailable; Sign out is available.
3. Confirm and continue. Reload: the gate should not reappear. An existing account without acceptance should see the same gate.
4. In Supabase SQL Editor, inspect `select user_id, terms_version, adult_declared, accepted_at from private.legal_acceptances;`. Confirm the ID and server timestamp. A repeated valid acceptance must not rewrite the time.
5. Before accepting on a test account, use the browser console to call the app API using that account's session (do not share its token). `/api/partnerships` must return 403 `terms_acceptance_required`. Posting `adult: false`, `acceptTerms: false`, or an old version to `/api/legal` must return 400. The automated API tests cover these without exposing tokens.
6. Open a recorded round. Before recording, the visible notice explains seven-day audio storage, AI transcription, partner playback, and that transcripts/results remain. Test on a narrow phone viewport too.
7. Open Profile settings, then Privacy and deletion. Check the email link has the correct address. Send a normal test email yourself and confirm receipt; the app does not send mail.

## Retention validation without waiting a week

Use a disposable local/staging Supabase project, never production fixtures. The cleanup permanently deletes eligible audio.

1. Upload one test recording through the app; note its round ID and private Storage path. Confirm it can be played and has a transcript.
2. For the test, adjust ONLY that object's `created_at` and round's `created_at` to eight days ago in your disposable database. Keep a second recording fresh. Do not delete Storage metadata manually.
3. The expired recording should no longer get a new playable signed URL through Storage. The fresh recording remains available to its authorized participant.
4. Build and start local Worker scheduled testing: `npm run build`, then `npx wrangler dev --test-scheduled`. With the test project's runtime variables loaded, visit `http://localhost:8787/cdn-cgi/local/scheduled` (use the port printed by Wrangler).
5. Verify the expired file is actually gone from the Storage dashboard, the fresh file remains, and the expired round has `audio_path = null`. Its transcript and scores must be unchanged. Run the handler again: it should be safe and report zero if no other files are due.
6. Test an abandoned upload: an expired object in `word-game-recordings` without a round reference must also be removed.
7. In staging, test invalid cleanup credentials: the scheduled event must fail visibly, not claim successful deletion. Restore credentials and rerun; pending files should then be removed.

`npm test` exercises real PostgreSQL logic in PGlite, including expiry boundaries, authorization, and preserving transcripts. `npm run db:reset` additionally validates migrations on full local Supabase when Docker is running. Browser tests use mocked auth/API/audio and do not prove hosted Storage deletion; perform the staging check above.

## Handling deletion requests

Verify the request through the account email without asking for passwords or routine ID scans. Agree on whether it concerns audio, transcripts, or the whole account. Locate only the verified user's data. Delete audio through the Storage dashboard/API; clearing a database path does not delete the file. Before deleting an Auth user, inventory affected game paths and remove Storage objects: database cascades do not remove file bytes. Account deletion cascades may also remove shared partnership/game history; explain that effect. For a transcript-only request, remove associated word timestamps and any cached transcription in `private.game_ai_jobs`, not just the displayed transcript. Check provider deletion mechanisms and backups separately, document any justified retained records, and confirm the outcome to the requester within the applicable deadline. Restrict this work to an authorized operator.

## Legal review before public launch

These are implementation controls and initial policy wording, not a legal-compliance certification. Have Belarus/international privacy counsel confirm the processing basis for each purpose; whether separate recording consent is needed; Belarus and EU/UK international-transfer arrangements; required operator address/contact disclosures; rights/complaints wording; age-assurance adequacy; provider agreements, actual AI subprocessors, retention and training settings; and retention of transcripts, account, usage, and backup data. Do not claim the seven-day cleanup covers provider-side copies or backups. If policy wording changes substantively, publish a new version and update both shared constants and the database's required Terms version in a new migration.

Technical references: [Supabase Storage deletion](https://supabase.com/docs/guides/storage/management/delete-objects), [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
