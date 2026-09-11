import { expect, test, type Page } from '@playwright/test'
import type { Partnership } from '../../src/shared/contracts'

const userId = '11111111-1111-4111-8111-111111111111'
const partnerId = '22222222-2222-4222-8222-222222222222'
const relationshipId = '33333333-3333-4333-8333-333333333333'
async function signIn(page: Page) {
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
            email: 'alice@example.test',
            app_metadata: {},
            user_metadata: {},
            created_at: '2026-01-01T00:00:00Z',
          },
        }),
      )
    },
    { id: userId },
  )
  await page.route('https://browser-test.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ status: 503, json: { message: 'Sign-out unavailable' } }),
  )
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: userId,
          username: 'alice',
          displayName: 'Alice',
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      },
    }),
  )
}
function relationship(
  direction: 'incoming' | 'outgoing',
  status: 'pending' | 'active' = 'pending',
): Partnership {
  return {
    id: relationshipId,
    direction,
    status,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    createdAt: '2026-01-01T00:00:00Z',
    acceptedAt: null,
  }
}

test('sends and cancels an invitation, disabling actions while saving', async ({ page }) => {
  await signIn(page)
  let data: Partnership[] = []
  let attempts = 0
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/api/partnerships**', async (route) => {
    if (route.request().method() === 'POST') {
      attempts++
      await pending
      data = [relationship('outgoing')]
      await route.fulfill({ status: 201, json: { data: { partnershipId: relationshipId } } })
    } else if (route.request().method() === 'DELETE') {
      data = []
      await route.fulfill({ status: 204 })
    } else await route.fulfill({ json: { data, nextCursor: null } })
  })
  await page.goto('/')
  await page.getByLabel('Their username').fill('bob')
  await page.getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  release!()
  await expect(page.getByRole('status').filter({ hasText: 'Invitation sent.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting for a reply' })).toBeVisible()
  expect(attempts).toBe(1)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for a reply' })).toHaveCount(0)
})

test('accepts then ends a partnership and shows sign-out failures', async ({ page }) => {
  await signIn(page)
  let data = [relationship('incoming')]
  await page.route('**/api/partnerships**', async (route) => {
    if (route.request().method() === 'POST') {
      data = [relationship('incoming', 'active')]
      await route.fulfill({ json: { data: { accepted: true } } })
    } else if (route.request().method() === 'DELETE') {
      data = []
      await route.fulfill({ status: 204 })
    } else await route.fulfill({ json: { data, nextCursor: null } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.getByRole('button', { name: 'End partnership' }).click()
  await expect(page.getByText('No active partners yet')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('alert')).toContainText('Sign-out unavailable')
})

test('loads the next page without replacing existing partners', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) => {
    const more = new URL(route.request().url()).searchParams.has('beforeId')
    const item = relationship('incoming', 'active')
    return route.fulfill({
      json: {
        data: more
          ? [{ ...item, id: partnerId, partner: { ...item.partner, displayName: 'Charlie' } }]
          : [item],
        nextCursor: more ? null : { id: relationshipId, createdAt: item.createdAt },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Load more partners and invitations' }).click()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Charlie', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Load more partners and invitations' }),
  ).toHaveCount(0)
})

test('serves production security headers on a browser route', async ({ page }) => {
  const response = await page.goto('/login')
  const headers = response!.headers()
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).toContain(
    "connect-src 'self' https://browser-test.supabase.co;",
  )
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
})

test('prevents duplicate profile saves and restores saved values after cancel', async ({
  page,
}) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let saves = 0
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      saves++
      await pending
    }
    await route.fulfill({
      json: {
        data: {
          id: userId,
          username: 'alice',
          displayName: saves ? 'Alice Updated' : 'Alice',
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Display name').fill('Alice Updated')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
  release!()
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible()
  expect(saves).toBe(1)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await page.getByLabel('Display name').fill('Unsaved')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await expect(page.getByLabel('Display name')).toHaveValue('Alice Updated')
})
