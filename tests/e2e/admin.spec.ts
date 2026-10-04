import { expect, test, type Page } from '@playwright/test'

const id = '11111111-1111-4111-8111-111111111111'
async function setup(page: Page, isAdmin = true) {
  await page.addInitScript(
    ({ id }) => {
      localStorage.setItem(
        'sb-browser-test-auth-token',
        JSON.stringify({
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id,
            aud: 'authenticated',
            role: 'authenticated',
            email: 'owner@example.test',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      )
    },
    { id },
  )
  await page.route('https://browser-test.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ status: 503, json: {} }),
  )
  await page.route('**/api/legal', (route) =>
    route.fulfill({
      json: {
        data: { accepted: true, termsVersion: '2026-10-04', acceptedAt: '2026-10-04T00:00:00Z' },
      },
    }),
  )
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id,
          username: 'owner',
          displayName: 'Owner',
          avatarUrl: null,
          timeZone: 'UTC',
          createdAt: '2026-01-01T00:00:00Z',
          isAdmin,
        },
      },
    }),
  )
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  await page.route('**/api/games/explain-word', (route) => route.fulfill({ json: { data: [] } }))
}

for (const width of [320, 375, 768, 1440]) {
  test(`admin totals, filters and pagination at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    await page.route('**/api/admin/users?**', (route) => {
      const query = new URL(route.request().url()).searchParams
      const second = query.has('afterId')
      return route.fulfill({
        json: {
          data: {
            users: [
              {
                id,
                username: second ? 'second_user' : 'learner',
                displayName: second ? 'Second User' : 'English Learner',
                knownCostUsd: '0.012345000000',
                knownTokens: '12345',
                knownAudioSeconds: 125.5,
                unknownAudioDurationCount: 0,
                unknownCostCount: 1,
                unknownTokenCount: 0,
                unverifiedCount: 0,
              },
            ],
            nextCursor: second ? null : id,
            from: '1970-01-01T00:00:00Z',
            to: '2026-10-02T12:00:00Z',
            currency: 'USD',
          },
        },
      })
    })
    await page.goto('/admin')
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    )
    await expect(page.getByText('@learner', { exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: '$0.012345 (known)', exact: true })).toBeVisible()
    await expect(page.getByText(/Incomplete usage data:/)).toBeVisible()
    await expect(page.getByRole('columnheader', { name: 'Word tokens', exact: true })).toBeVisible()
    await expect(page.getByRole('cell', { name: '125.5 s', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.getByRole('navigation', { name: 'Main navigation' }).evaluate((nav) => {
        const bounds = nav.getBoundingClientRect()
        return Array.from(nav.querySelectorAll('a')).every((link) => {
          const box = link.getBoundingClientRect()
          return (
            box.top >= bounds.top &&
            box.bottom <= bounds.bottom &&
            box.left >= bounds.left &&
            box.right <= bounds.right &&
            box.bottom <= innerHeight
          )
        })
      }),
    ).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`admin-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(page.getByText('@second_user', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.getByText('@learner', { exact: true })).toBeVisible()
    const request = page.waitForRequest((request) =>
      request.url().includes('/api/admin/users?period=month'),
    )
    await page.getByLabel('Reporting period').selectOption('month')
    await request
    await expect(page.getByText('@learner', { exact: true })).toBeVisible()
    await page.route('**/api/admin/users?**', (route) =>
      route.fulfill({
        status: 403,
        json: { error: { code: 'admin_required', message: 'Admin access was revoked.' } },
      }),
    )
    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('Admin access was revoked.')
    await expect(page.getByRole('table')).toHaveCount(0)
  })
}

test('a regular user cannot open the admin UI or trigger its report request', async ({ page }) => {
  await setup(page, false)
  let requested = false
  await page.route('**/api/admin/**', (route) => {
    requested = true
    return route.fulfill({ status: 403, json: {} })
  })
  await page.goto('/admin')
  await expect(page.getByRole('alert')).toContainText('available only to the administrator')
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  expect(requested).toBe(false)
})

test('the admin can save zero limits and restore unlimited defaults', async ({ page }) => {
  await setup(page)
  let limits: { monthlyUsd: string | null; lifetimeUsd: string | null } = {
    monthlyUsd: null,
    lifetimeUsd: null,
  }
  await page.route('**/api/admin/users?**', (route) =>
    route.fulfill({
      json: {
        data: {
          users: [
            {
              id,
              username: 'learner',
              displayName: 'Learner',
              knownCostUsd: '0.000000000000',
              knownTokens: '0',
              knownAudioSeconds: 0,
              unknownCostCount: 0,
              unknownTokenCount: 0,
              unknownAudioDurationCount: 0,
              unverifiedCount: 0,
            },
          ],
          nextCursor: null,
          from: '1970-01-01T00:00:00Z',
          to: '2026-10-03T12:00:00Z',
          currency: 'USD',
        },
      },
    }),
  )
  await page.route(`**/api/admin/users/${id}/limits`, (route) => {
    if (route.request().method() === 'PATCH') limits = route.request().postDataJSON()
    return route.fulfill({ json: { data: limits } })
  })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Spending limits', exact: true }).click()
  await expect(page.getByLabel('Lifetime spending limit (USD)')).toBeEnabled()
  await expect(page.getByLabel('Monthly spending limit (USD)')).toHaveValue('')
  await page.getByLabel('Lifetime spending limit (USD)').fill('0')
  await page.getByLabel('Monthly spending limit (USD)').fill('2.5')
  await page.getByRole('button', { name: 'Save limits', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Limits saved.')
  expect(limits).toEqual({ monthlyUsd: '2.5', lifetimeUsd: '0' })
  await page.getByLabel('Lifetime spending limit (USD)').fill('')
  await page.getByLabel('Monthly spending limit (USD)').fill('')
  await page.getByRole('button', { name: 'Save limits', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Limits saved.')
  expect(limits).toEqual({ monthlyUsd: null, lifetimeUsd: null })
})

test('exhausted credits show only the existing soft notification during a paid game action', async ({
  page,
}) => {
  await setup(page, false)
  const partnership = '22222222-2222-4222-8222-222222222222'
  const game = {
    id: '33333333-3333-4333-8333-333333333333',
    partnershipId: partnership,
    mode: 'live_call',
    status: 'active',
    requestedById: id,
    explanationDurationSeconds: 60,
    acceptedAt: '2026-10-03T12:00:00Z',
    currentPlayerId: id,
    partner: { id: partnership, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: null,
  }
  await page.route('**/api/games/explain-word/**', (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/rounds'))
      return route.fulfill({
        status: 403,
        json: { error: { code: 'credits_exhausted', message: 'You’ve run out of credits.' } },
      })
    return route.fulfill({ json: { data: game } })
  })
  await page.goto(`/games/explain-word/${partnership}`)
  await page.getByRole('button', { name: 'Give me a word' }).click()
  const notice = page.locator('.toast').filter({ hasText: 'You’ve run out of credits.' })
  await expect(notice).toHaveAttribute('role', 'status')
  await expect(notice).not.toHaveClass(/toast-error/)
  await expect(page.getByText(/monthly spending|lifetime spending|USD/i)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Give me a word' })).toBeEnabled()
  await notice.getByRole('button', { name: 'Dismiss notification' }).click()
  await expect(notice).toHaveCount(0)
})

test('confirms the selected user before deleting and keeps failed deletions retryable', async ({
  page,
}, testInfo) => {
  await setup(page)
  const targetId = '22222222-2222-4222-8222-222222222222'
  let deleted = false
  let calls = 0
  await page.route('**/api/admin/users?**', (route) =>
    route.fulfill({
      json: {
        data: {
          users: deleted
            ? []
            : [
                {
                  id: targetId,
                  username: 'learner',
                  displayName: 'Learner',
                  knownCostUsd: '0.000000000000',
                  knownTokens: '0',
                  knownAudioSeconds: 0,
                  unknownAudioDurationCount: 0,
                  unknownCostCount: 0,
                  unknownTokenCount: 0,
                  unverifiedCount: 0,
                },
              ],
          nextCursor: null,
          from: '1970-01-01T00:00:00Z',
          to: '2026-10-04T00:00:00Z',
          currency: 'USD',
        },
      },
    }),
  )
  await page.route(`**/api/admin/users/${targetId}`, (route) => {
    calls++
    expect(route.request().method()).toBe('DELETE')
    expect(route.request().postDataJSON()).toEqual({ username: 'learner', confirm: true })
    if (calls === 1)
      return route.fulfill({
        status: 503,
        json: { error: { code: 'user_deletion_failed', message: 'Try again.' } },
      })
    deleted = true
    return route.fulfill({ status: 204 })
  })
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Delete @learner' }).click()
  const dialog = page.getByRole('dialog', { name: 'Delete @learner?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).hover()
  await expect(dialog.locator('.custom-cursor')).toBeVisible()
  await expect(dialog.locator('.custom-cursor')).toHaveCSS('pointer-events', 'none')

  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: 'Delete @learner' }).click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(calls).toBe(0)
  await page.getByRole('button', { name: 'Delete @learner' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ path: testInfo.outputPath('delete-user-confirmation.png') })
  await dialog.getByRole('button', { name: 'Permanently delete user' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Try again.')
  await dialog.getByRole('button', { name: 'Permanently delete user' }).click()
  await expect(dialog).not.toBeVisible()
  await expect(page.getByRole('status')).toContainText('Deleted @learner')
  await expect(page.getByRole('button', { name: 'Delete @learner' })).toHaveCount(0)
})
