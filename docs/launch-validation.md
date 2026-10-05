# Launch validation

Use your own disposable accounts: an administrator, two game partners (A and B), and an
unrelated user C. Separate Chrome profiles keep their sessions apart. Use staging for changes
to database records. Your completed deployment, retention, and two-player gameplay tests do
not need repeating unless a relevant change is made.

## 1. Prepare a browser API helper

In the app, press F12, open Console, and enter this helper. It reads the current tab's Supabase
session and sends requests to your own app. It does not print the token. Never share session
values or copied Authorization headers.

```js
async function checkApi(path, options = {}) {
  if (!path.startsWith('/api/')) throw new Error('Use a relative /api/ path.')
  const key = Object.keys(localStorage).find(
    (name) => name.startsWith('sb-') && name.endsWith('-auth-token'),
  )
  const session = key ? JSON.parse(localStorage.getItem(key)) : null
  if (!session?.access_token) throw new Error('Sign in to this app first.')
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  })
  console.log(response.status, await response.text())
}
```

Run this only in the intended app tab. Reloading clears the helper; re-enter it when needed.
If a token has expired, reload/sign in again. A 401 with an expired token does not prove that
role checks work. A 500/503 is an inconclusive test, not a successful permission rejection.

## 2. Admin access

1. As an ordinary user who has accepted Terms, enter `/admin` in the address bar. Expect `/`
   and Practice, with no admin table or Admin navigation item. Reload and repeat.
2. As the administrator, open `/admin`. Expect the user table.
3. In the ordinary user's Console, run:

   ```js
   await checkApi('/api/admin/users?period=all')
   ```

   Expect **403**, code `admin_required`, and no user data. The redirect alone is not proof.

4. Check mutation authorization without targeting a real user. While still signed in as the
   ordinary user, run:

   ```js
   await checkApi('/api/admin/users/00000000-0000-4000-8000-000000000000', {
     method: 'DELETE',
     body: JSON.stringify({ username: 'nonexistent_test_user', confirm: true }),
   })
   await checkApi('/api/admin/users/00000000-0000-4000-8000-000000000000/limits', {
     method: 'PATCH',
     body: JSON.stringify({ monthlyUsd: '0', lifetimeUsd: '0' }),
   })
   ```

   Both must return **403**, `admin_required`. No real account should be changed.

5. In a signed-out app tab, run:

   ```js
   const response = await fetch('/api/admin/users?period=all')
   console.log(response.status, await response.text())
   ```

   Expect **401**. See [admin testing](admin-testing.md) for the functional admin controls.

## 3. Private recordings

1. Let A and B start a Recorded game. A records and sends a clue; keep the round active.
2. In B's DevTools Network tab, filter for `audio`. Play the recording. Find the GET request
   to `/api/games/explain-word/PARTNERSHIP_ID/rounds/ROUND_ID/audio`.
3. Confirm B receives **200** and audio plays. Copy only that API path, without headers or
   the signed Storage URL returned in its response.
4. In unrelated account C's Console, run `await checkApi('COPIED_API_PATH')`.
   Expect **403 or 404**, no playable URL, and no transcript/game details. A participant must
   still be able to play it at this point, otherwise the test could merely be expired audio.
5. In Supabase Storage, verify `word-game-recordings` is a **private** bucket. Using a test
   object's path, try its public endpoint in a signed-out browser:
   `https://PROJECT.supabase.co/storage/v1/object/public/word-game-recordings/OBJECT_PATH`.
   Expect no audio download. Never make the bucket public to repair playback.

A legitimately issued signed URL is a temporary bearer link: anyone holding it can use it
until expiration (up to five minutes). Copying that link to another browser is not the same
test as asking the API to issue a new link to an unauthorized account.

## 4. Age and Terms enforcement

1. Sign out. Click Start practicing with Google. Both boxes should be unchecked; continuing
   is disabled until both are checked. Cancel should close the panel without starting OAuth.
2. Complete confirmation and Google sign-in with a disposable account. Practice should open
   without asking twice. Reload: the acceptance should remain saved.
3. To test an authenticated account without acceptance, use a staging database and delete
   only that disposable account's acceptance in Supabase SQL Editor:

   ```sql
   delete from private.legal_acceptances
   where user_id = 'DISPOSABLE_TEST_USER_UUID'::uuid;
   ```

4. Reload that account's app. Expect the confirmation screen. Before accepting, run:

   ```js
   await checkApi('/api/games/explain-word')
   await checkApi('/api/games/explain-word', { method: 'POST', body: '{}' })
   ```

   Both should return **403**, `terms_acceptance_required`. The second request intentionally
   has no valid game data: the Terms check should reject it before any game is created.

5. Accept through the panel. The normal game list should work again.

This checks declaration and enforcement, not whether a person's declared age is truthful.

## 5. Browser secrets

1. Open DevTools Sources and press Ctrl+Shift+F to search downloaded sources.
2. Look for `service_role`, `sb_secret_`, `sk-or-v1-`, and `postgresql://`. Inspect matches:
   an actual credential is a failure; a variable name or error message alone is not.
3. Inspect Network requests/responses for unintended server credentials. Your own user's
   Authorization token and Supabase public/publishable key are expected.
4. Review the frontend source and build configuration too: server secrets must never be
   assigned to `VITE_` variables or imported into browser code. Searching strings alone
   cannot prove there are no exposed secrets.

If you find an actual server credential, rotate it and remove the exposure before sharing.
Do not paste it into chat or screenshots.

## 6. Automated code checks

From the repository terminal:

```sh
npm run check
npm run test:e2e -- tests/e2e/admin.spec.ts
```

The first command checks formatting, lint, TypeScript, tests, and production build. The second
checks admin browser behavior with mocked accounts. Neither replaces the live permission tests.
Browser tests create a build with fake Auth settings; run `npm run build` afterward to restore
your normal build. `npm run deploy` also rebuilds before deployment.

## 7. AI provider privacy

1. Open [OpenRouter privacy settings](https://openrouter.ai/settings/privacy). Check prompt
   logging and provider training permissions for the account used by the app.
2. Make one test transcription and one test card-generation request. Inspect their entries
   in OpenRouter Activity to identify the model and serving provider. Do not assume the
   model's author is always the serving provider. Record the routing configuration too:
   a single request does not establish all possible fallback providers.
3. Read [OpenRouter's privacy policy](https://openrouter.ai/privacy/) and the identified
   providers' retention/training documentation for those endpoints. Verify how long audio
   or prompts are retained, whether training is permitted, and any logging exceptions.
   If this is not documented clearly, ask provider support before making a definite claim.
4. Compare those facts with `/privacy`. Seven-day deletion refers to our stored audio;
   it must not promise seven-day deletion of provider copies without evidence.
5. Save the checked settings, sources, and date privately. Recheck when routing or providers
   change. Policy links disclose sources; they do not validate your account configuration.

These checks provide practical launch evidence, not a legal certification or an exhaustive
security audit.
