# Check AI usage accounting

Usage tracking has no daily limits or quotas. It starts when this change is applied; old
requests are not backfilled. The application records the cost OpenRouter returns, not a
locally maintained price list. No new credential or certificate is required for accounting.

## Prepare

1. Apply the pending migration with `npm run db:push` if it has not already been applied.
2. Start or restart `npm run dev`, then sign in on localhost.
3. Open a second browser/profile with your partner account for playing a game.
4. Open browser developer tools (F12) in the first account and select **Console**.
5. Run this helper. It uses the existing local application's session without printing its token.
   The source-module import is for the Vite development server, not the deployed build.

```js
window.showAiUsage = async () => {
  const { supabase } = await import('/src/client/shared/api/supabase.ts')
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in first')
  const response = await fetch('/api/ai-usage', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message)
  console.table(result.data.entries)
  console.log('This page:', result.data.pageTotals)
  console.log('Next page:', result.data.nextCursor)
  return result.data
}
await showAiUsage()
```

The default period is the current UTC calendar month. An empty result before your first AI
request is normal. Each page contains at most 100 entries. `pageTotals` is explicitly a page
subtotal, not an all-time total. For another period, use a URL such as
`/api/ai-usage?from=2026-10-01T00:00:00Z&to=2026-11-01T00:00:00Z`.
The start is inclusive and the end is exclusive. Follow `nextCursor` by adding its
`beforeCreatedAt` and `beforeId` fields as URL parameters, retaining the same `from` and `to`.
Add each page's known costs and unknown counts to get the whole period. Cost strings use
12 decimal places so very small charges are not rounded to whole cents.

## Check a normal recording

1. Note your current entries and `knownCostUsd`.
2. Start a Recorded practice game, record a short explanation, and send it.
3. Wait for the explanation to be ready for your partner.
4. Run `await showAiUsage()` again.
5. Expect one new **transcription** entry. Check `model`, `providerRequestId`, `costUsd`,
   `audioSeconds`, and token counts. Some provider metadata may be absent (`null`).
6. Compare the request ID and cost with the request in your OpenRouter Activity dashboard.
7. There should be no coaching entry or coaching call.

`costUsd: null` means unknown, never free. A reported zero is stored as `0.000000000000`.
`knownCostUsd` adds only known amounts, while `unknownCostCount` tells you how many costs are
unresolved. `outcome` describes the provider's HTTP response, not whether the game update succeeded.
A valid charge is recorded even if the model output is unusable or a later game save fails.

## Check duplicate submissions

1. In developer tools, select **Network** and filter for `transcription`.
2. Send a new recording normally.
3. While its request is still pending, right-click it and choose **Replay XHR** or **Edit and
   Resend** if your browser offers that command. Otherwise use **Copy as fetch**, paste the
   copied request into Console, and execute it while the first request is pending. Keep the
   same recording body and authorization header; do not share that copied request.
4. The duplicate should receive `409 ai_processing`. If the first request already finished,
   it may instead receive a round-state conflict. Neither starts another AI call.
5. Run `await showAiUsage()`. Expect only one new transcription entry.

A retry that uses an already saved AI result also adds no usage. The automated test below
checks this case without deliberately breaking your database or spending provider credits.

## Check card generation

1. Starting a round with an existing pooled card should add no card-generation entry.
2. When a round needs a genuinely new AI batch, expect one **cards** entry, with token counts
   and cost. Its cost is included in `sharedCardCostUsd`, separate from `transcriptionCostUsd`.
3. One batch is one provider call, not one call per card. Later reuse adds no cost.

Do not delete pooled cards or production data to force this path. The automated tests exercise
card generation with mocked provider responses. Live generation still needs the previously
configured shared-card writer; accounting does not change that separate connection. A paid
batch followed by a card-storage failure is still a real cost and is recorded.

## Check account privacy

1. Run the same helper in your partner's browser/profile.
2. Your account's recording must not appear in their report.
3. Submit a recording from that second account: its new entry belongs only to that account.

## Check failures safely

Run the focused tests (no real AI calls or provider charges):

```sh
npx vitest run src/server/lib/ai-usage.test.ts src/server/ai-usage.test.ts src/server/lib/game-ai.test.ts tests/database/security.test.ts
```

They cover missing cost versus zero, network failure, interrupted response bodies, unusable
model output, cached retries, repeated accounting saves, forged receipts, cross-account access,
and pagination. A timeout/lost response remains an unknown-cost entry; retrying after reservation
expiry creates another attempt because another provider call may be charged.

## Persistence and limitations

The ledger lives in `private.ai_usage_events`, written through authenticated RPCs. The Worker
signs metadata and verifies it before including it in reports: raw database receipts are not
independently verified by SQL. Use the API for trusted totals. No prompts, transcripts, or audio
are stored in the ledger. Entries survive game deletion and are removed when their account is
deleted. Failed final accounting writes leave the initial unknown entry and a server log containing
only its event ID. Missing costs are not automatically reconciled with OpenRouter yet; use a saved
provider request ID in OpenRouter Activity when investigating discrepancies. A request interrupted
between recording intent and dispatch can also remain unknown without having incurred a charge.

The existing OpenRouter key signs receipts by default. Before rotating it, set
`AI_USAGE_SIGNING_KEY` to the old signing value in the Worker and local environment, then rotate
only `OPENROUTER_API_KEY`. Alternatively set a separate stable `AI_USAGE_SIGNING_KEY` before your
first recorded request. Never expose either value in browser variables. Changing the signing key
makes old receipts unverifiable; the report counts and excludes them rather than trusting them.
The initial accounting write must succeed before a provider request is dispatched; if the ledger
is unavailable, that action fails rather than spending money without a record. This is not a quota.

## Provider temporarily busy

If OpenRouter returns HTTP 429, the application responds with `503 ai_provider_busy` and
"The AI service is busy. Please try again shortly." This is an upstream provider limit, not an
application usage quota. A supplied provider `Retry-After` header is forwarded; otherwise no exact
retry time is claimed. The request is recorded as failed with unknown cost unless the provider
reports a cost. It is not retried automatically. Wait before submitting again.
