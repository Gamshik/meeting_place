import { expect, test, type Page } from '@playwright/test'
import type { Partnership, ProfileActivity, WordGame } from '../../src/shared/contracts'

const userId = '11111111-1111-4111-8111-111111111111'
const partnerId = '22222222-2222-4222-8222-222222222222'
const relationshipId = '33333333-3333-4333-8333-333333333333'
const secondPartnerId = '88888888-8888-4888-8888-888888888888'
const secondRelationshipId = '99999999-9999-4999-8999-999999999999'
async function signIn(page: Page, id = userId) {
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
    { id },
  )
  await page.route('https://browser-test.supabase.co/auth/v1/**', (route) =>
    route.fulfill({ status: 503, json: { message: 'Sign-out unavailable' } }),
  )
  await page.route('**/api/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id,
          username: id === partnerId ? 'bob' : 'alice',
          displayName: id === partnerId ? 'Bob' : 'Alice',
          avatarUrl: null,
          createdAt: '2026-01-01T00:00:00Z',
          timeZone: 'UTC',
        },
      },
    }),
  )
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  await page.route('**/api/profiles/**', (route) => {
    const requestedId = new URL(route.request().url()).pathname.split('/')[3] ?? userId
    const isFriend = requestedId === partnerId
    const data: ProfileActivity = {
      profile: {
        id: requestedId,
        username: isFriend ? 'bob' : 'alice',
        displayName: isFriend ? 'Bob' : 'Alice',
        avatarUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
        timeZone: 'UTC',
      },
      isOwner: !isFriend,
      year: 2026,
      startDate: '2025-09-14',
      endDate: '2026-09-13',
      timeZone: 'UTC',
      totals: {
        activeDays: 0,
        interactionCount: 0,
        gamesPlayed: 0,
        gamesCompleted: 0,
        roundsStarted: 0,
        explanationsSubmitted: 0,
        guessesSubmitted: 0,
        speakingDurationSeconds: 0,
        topicsExplored: 0,
      },
      days: [],
    }
    return route.fulfill({ json: { data } })
  })
  await page.route('**/api/games/explain-word/history', (route) =>
    route.fulfill({ json: { data: [] } }),
  )
  await page.route('**/api/games/explain-word', (route) => route.fulfill({ json: { data: [] } }))
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
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await page.getByRole('button', { name: 'Add a friend', exact: true }).click()
  await page.getByLabel('Friend’s username').fill('bob')
  await page.getByRole('button', { name: 'Send invite', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Sending…' })).toBeDisabled()
  release!()
  await expect(page.getByRole('status').filter({ hasText: 'Invitation sent.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  expect(attempts).toBe(1)
  await page.getByRole('button', { name: 'Cancel invitation', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0)
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
  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  await page
    .getByRole('region', { name: 'Notifications' })
    .getByRole('button', { name: 'Accept', exact: true })
    .click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
    "You're all caught up.",
  )
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await page.getByLabel('Manage Bob').click()
  await page.getByRole('button', { name: 'Remove friend', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove friend', exact: true }).click()
  await expect(page.getByText('Add a friend using their username.')).toBeVisible()
  await page.getByRole('link', { name: 'Your profile', exact: true }).click()
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
  await page.getByRole('link', { name: 'Friends', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Charlie', exact: true })).toBeVisible()
  await page.getByLabel('Find a friend').fill('Charlie')
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0)
  await page.waitForTimeout(3500)
  await expect(page.getByRole('heading', { name: 'Charlie', exact: true })).toBeVisible()
})

test('refreshes invitations when Realtime reports a partnership change', async ({ page }) => {
  await signIn(page)
  let data: Partnership[] = []
  let partnershipReads = 0
  let sendPartnershipChange: (() => void) | undefined

  await page.routeWebSocket('wss://browser-test.supabase.co/realtime/v1/**', (socket) => {
    let channelTopic = ''

    socket.onMessage((message) => {
      const [joinReference, reference, topic, event, payload] = JSON.parse(message.toString())

      if (event === 'phx_join') {
        channelTopic = topic
        const postgresChanges = payload.config.postgres_changes.map(
          (filter: Record<string, unknown>, index: number) => ({ ...filter, id: index + 1 }),
        )
        socket.send(
          JSON.stringify([
            joinReference,
            reference,
            topic,
            'phx_reply',
            { status: 'ok', response: { postgres_changes: postgresChanges } },
          ]),
        )
      } else if (event === 'heartbeat') {
        socket.send(
          JSON.stringify([
            joinReference,
            reference,
            topic,
            'phx_reply',
            { status: 'ok', response: {} },
          ]),
        )
      }
    })

    sendPartnershipChange = () => {
      socket.send(
        JSON.stringify([
          null,
          null,
          channelTopic,
          'postgres_changes',
          {
            ids: [1],
            data: {
              columns: [],
              commit_timestamp: '2026-01-01T00:00:00Z',
              errors: null,
              old_record: {},
              record: {},
              schema: 'public',
              table: 'partnerships',
              type: 'INSERT',
            },
          },
        ]),
      )
    }
  })
  await page.route('**/api/partnerships**', (route) => {
    partnershipReads++
    return route.fulfill({ json: { data, nextCursor: null } })
  })

  await page.goto('/')
  await expect.poll(() => partnershipReads).toBeGreaterThanOrEqual(2)

  data = [relationship('incoming')]
  sendPartnershipChange!()

  await expect(
    page.getByRole('button', { name: 'Notifications, pending invitations' }),
  ).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toContainText(
    'Bob sent you a friend invitation.',
  )
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('serves production security headers on a browser route', async ({ page }) => {
  const response = await page.goto('/login')
  const headers = response!.headers()
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).toContain(
    "connect-src 'self' https://browser-test.supabase.co wss://browser-test.supabase.co;",
  )
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['permissions-policy']).toContain('microphone=(self)')
  await expect(page.getByRole('button', { name: 'Start practising with Google' })).toBeVisible()
})

test('prevents duplicate profile saves and restores saved values after cancel', async ({
  page,
}) => {
  await signIn(page)
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => undefined },
    })
  })
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [], nextCursor: null } }),
  )
  let release: (() => void) | undefined
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  let saves = 0
  let savedProfile: Record<string, unknown> | null = null
  await page.route('**/api/me', async (route) => {
    if (route.request().method() === 'PATCH') {
      saves++
      savedProfile = route.request().postDataJSON() as Record<string, unknown>
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
          timeZone: saves ? 'Europe/Minsk' : 'UTC',
        },
      },
    })
  })
  await page.goto('/?view=profile')
  await page.getByRole('button', { name: 'Profile settings' }).click()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your profile' })).toHaveCount(0)
  const copyUsername = page.getByRole('button', { name: 'Copy username' })
  await expect(copyUsername).toBeVisible()
  await copyUsername.click()
  const copiedNotice = page.getByRole('status').filter({ hasText: 'Username copied.' })
  await expect(copiedNotice).toBeVisible()
  expect((await copiedNotice.boundingBox())!.height).toBeLessThan(80)
  await expect(copiedNotice).toHaveCSS('border-radius', '18px 18px 18px 6px')
  await expect(page.getByText('Shown to friends and during games.')).toHaveCount(0)
  await expect(page.getByText('Friends use this unique handle to find you.')).toHaveCount(0)
  await expect(page.getByText('Sets where each practice day begins.')).toHaveCount(0)
  const timeZoneLabelBounds = await page
    .getByText('Activity timezone', { exact: true })
    .boundingBox()
  const timeZoneInputBounds = await page.getByLabel('Activity timezone').boundingBox()
  expect(timeZoneInputBounds!.y).toBeGreaterThan(
    timeZoneLabelBounds!.y + timeZoneLabelBounds!.height,
  )
  await page.getByLabel('Display name').fill('Alice Updated')
  await page.getByLabel('Activity timezone').selectOption('Europe/Minsk')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Reset', exact: true })).toBeDisabled()
  release!()
  await expect(page.getByRole('status').filter({ hasText: 'Profile saved.' })).toBeVisible()
  expect(saves).toBe(1)
  expect(savedProfile).toMatchObject({
    displayName: 'Alice Updated',
    username: 'alice',
    timeZone: 'Europe/Minsk',
  })
  await page.getByLabel('Display name').fill('Unsaved')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await expect(page.getByLabel('Display name')).toHaveValue('Alice Updated')
})

test('shows yearly activity by default and lets friends open the monthly profile view', async ({
  page,
}) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.unroute('**/api/profiles/**')
  await page.route('**/api/profiles/**', (route) => {
    const data: ProfileActivity = {
      profile: {
        id: partnerId,
        username: 'bob',
        displayName: 'Bob',
        avatarUrl: null,
        createdAt: '2026-01-01T00:00:00Z',
        timeZone: 'UTC',
      },
      isOwner: false,
      year: 2026,
      startDate: '2025-09-14',
      endDate: '2026-09-13',
      timeZone: 'UTC',
      totals: {
        activeDays: 1,
        interactionCount: 5,
        gamesPlayed: 1,
        gamesCompleted: 1,
        roundsStarted: 1,
        explanationsSubmitted: 1,
        guessesSubmitted: 1,
        speakingDurationSeconds: 13,
        topicsExplored: 2,
      },
      days: [
        {
          date: '2026-09-13',
          interactionCount: 5,
          intensity: 2,
          gamesRequested: 0,
          gamesAccepted: 1,
          roundsStarted: 1,
          explanationsSubmitted: 1,
          guessesSubmitted: 1,
          gamesCompleted: 1,
          gamesPlayed: 1,
          speakingDurationSeconds: 13,
          topics: ['Food', 'Travel'],
        },
      ],
    }
    return route.fulfill({ json: { data } })
  })

  await page.goto('/?view=friends')
  await page.getByRole('link', { name: 'View Bob’s profile' }).click()
  await expect(page).toHaveURL(`/profiles/${partnerId}`)
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Practice with Bob' })).toBeVisible()
  expect((await page.locator('.friend-profile-heading').boundingBox())!.height).toBeLessThan(140)
  await expect(page.getByRole('heading', { name: 'Bob’s practice activity' })).toBeVisible()
  await expect(page.getByLabel('Sep 14, 2025 to Sep 13, 2026 practice summary')).toContainText(
    '5practice actions',
  )
  await expect(
    page.getByRole('grid', {
      name: 'Practice activity from Sep 14, 2025 through Sep 13, 2026',
    }),
  ).toBeVisible()
  const firstMonthLabel = page.locator('.activity-month-labels span').first()
  await expect(firstMonthLabel).toHaveText('Sep')
  const firstLabelBounds = await firstMonthLabel.boundingBox()
  expect(firstLabelBounds?.width).toBeGreaterThanOrEqual(18)
  await expect(page.getByRole('gridcell', { name: /Dec 31, 2026/ })).toHaveCount(0)
  const todayCell = page.getByRole('gridcell', { name: /Sep 13, 2026: 5 practice actions/ })
  await todayCell.scrollIntoViewIfNeeded()
  const calendarBounds = await page.locator('.activity-year-calendar').boundingBox()
  const todayBounds = await todayCell.boundingBox()
  expect(todayBounds!.x + todayBounds!.width).toBeLessThan(
    calendarBounds!.x + calendarBounds!.width - 8,
  )
  await todayCell.click()
  await expect(page.getByRole('heading', { name: '5 practice actions' })).toBeVisible()
  await expect(page.getByText('Food', { exact: true })).toBeVisible()

  const friendBounds = await page.locator('.friend-profile-page').boundingBox()
  const friendScroll = page.locator('.friend-profile-page .activity-year-scroll')
  expect(await friendScroll.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

  await page.getByRole('button', { name: 'Months' }).click()
  await expect(page.getByRole('region', { name: 'Sep 2025' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Sep 2026' })).toContainText('1 active')
  await expect(page.getByRole('region', { name: 'Oct 2026' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Back to friends' }).click()
  await expect(page).toHaveURL('/?view=friends')

  await page.goto('/?view=profile')
  const accountBounds = await page.locator('.account-page').boundingBox()
  const accountScroll = page.locator('.account-page .activity-year-scroll')
  expect(accountBounds?.width).toBeCloseTo(friendBounds!.width, 1)
  expect(await accountScroll.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)

  const cell = page.locator('.account-page .activity-cell:not(.activity-cell-hidden)').first()
  const cellBounds = await cell.boundingBox()
  expect(cellBounds?.height).toBeGreaterThanOrEqual(15)
  expect(cellBounds?.width).toBeCloseTo(cellBounds!.height, 0.1)

  await page.setViewportSize({ width: 1440, height: 900 })
  const wideCellBounds = await cell.boundingBox()
  expect(wideCellBounds?.width).toBeCloseTo(wideCellBounds!.height, 0.1)
  expect(wideCellBounds!.width).toBeGreaterThan(cellBounds!.width)

  await page.setViewportSize({ width: 600, height: 800 })
  const mobileCellBounds = await cell.boundingBox()
  expect(mobileCellBounds?.width).toBeCloseTo(mobileCellBounds!.height, 0.1)
  const weekdays = page.locator('.account-page .activity-weekdays')
  await accountScroll.evaluate((el) => {
    el.scrollLeft = 100
  })
  const scrolledAt100 = (await weekdays.boundingBox())!.x
  await accountScroll.evaluate((el) => {
    el.scrollLeft = 250
  })
  const scrolledAt250 = (await weekdays.boundingBox())!.x
  expect(scrolledAt100).toBe(scrolledAt250)
  await expect(weekdays).toBeVisible()

  await page.getByRole('button', { name: 'Months' }).click()
  const monthCell = page
    .locator('.account-page .activity-month-days .activity-cell:not(.activity-cell-hidden)')
    .first()
  const monthCellBounds = await monthCell.boundingBox()
  expect(monthCellBounds?.width).toBeCloseTo(monthCellBounds!.height, 0.1)

  await page.setViewportSize({ width: 390, height: 844 })
  const smallMonthCellBounds = await monthCell.boundingBox()
  expect(smallMonthCellBounds?.width).toBeCloseTo(smallMonthCellBounds!.height, 0.1)
})

test('starts a word game and submits a browser recording for transcription', async ({ page }) => {
  await signIn(page)
  await page.addInitScript(() => {
    const fakeTrack = { stop() {} }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: async () => ({ getTracks: () => [fakeTrack] }) },
    })
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true
      }
      mimeType = 'audio/webm;codecs=opus'
      state: RecordingState = 'inactive'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) })
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder })
    class FakeAudioContext {
      async decodeAudioData() {
        return { duration: 0.1 }
      }
      async close() {}
    }
    class FakeOfflineAudioContext {
      destination = {}
      createBufferSource() {
        return { buffer: null, connect() {}, start() {} }
      }
      async startRendering() {
        return { getChannelData: () => new Float32Array(1600) }
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext })
    Object.defineProperty(window, 'OfflineAudioContext', {
      configurable: true,
      value: FakeOfflineAudioContext,
    })
  })

  const gameId = '44444444-4444-4444-8444-444444444444'
  const roundId = '55555555-5555-4555-8555-555555555555'
  const baseGame: WordGame = {
    id: gameId,
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'active',
    requestedById: userId,
    acceptedAt: '2026-09-11T12:00:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: null,
  }
  let game = baseGame
  let started = false
  let pauseSession = false
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (route.request().method() === 'GET' && !started) {
      await route.fulfill({
        status: 404,
        json: { error: { code: 'word_game_not_found', message: 'Not started' } },
      })
      return
    }
    if (route.request().method() === 'GET' && game.status === 'pending') {
      game = { ...game, status: 'active', acceptedAt: '2026-09-11T12:00:00Z' }
    }
    if (path.endsWith('/presence')) {
      if (route.request().method() === 'DELETE') await route.fulfill({ status: 204 })
      else {
        game = pauseSession
          ? {
              ...game,
              status: 'paused',
              pausedAt: new Date().toISOString(),
              reconnectDeadline: new Date(Date.now() + 300_000).toISOString(),
              disconnectedPlayerId: partnerId,
              finishedAt: null,
            }
          : {
              ...game,
              status: 'active',
              pausedAt: null,
              reconnectDeadline: null,
              disconnectedPlayerId: null,
            }
        await route.fulfill({ json: { data: game } })
      }
      return
    }
    if (path.endsWith('/end')) {
      game = { ...game, status: 'finished', finishedAt: new Date().toISOString() }
      await route.fulfill({ status: 204 })
      return
    }
    if (path.endsWith('/transcription')) {
      const requestBody = await route.request().postDataBuffer()
      expect(requestBody?.includes(Buffer.from('audio/wav'))).toBe(true)
      game = {
        ...game,
        round: {
          ...game.round!,
          status: 'awaiting_guess',
          audioAvailable: true,
          explainedAt: new Date().toISOString(),
          transcript: 'You need this document to cross a border.',
          transcriptWords: [],
          usedForbiddenWord: false,
          coachScore: 91,
          coachFeedback: 'Clear description. Add one more identifying detail.',
        },
      }
    } else if (path.endsWith('/recording-started')) {
      game = {
        ...game,
        serverTime: new Date().toISOString(),
        round: { ...game.round!, recordingStartedAt: new Date().toISOString() },
      }
    } else if (path.endsWith('/recording-stopped')) {
      game = {
        ...game,
        serverTime: new Date().toISOString(),
        round: { ...game.round!, recordingFinishedAt: new Date().toISOString() },
      }
    } else if (path.endsWith('/rounds')) {
      game = {
        ...game,
        round: {
          id: roundId,
          turnNumber: 1,
          explainerId: userId,
          topic: 'Travel',
          status: 'explaining',
          secretWord: 'passport',
          forbiddenWords: ['passport', 'passports'],
          transcript: null,
          transcriptWords: [],
          audioAvailable: false,
          explanationMethod: null,
          usedForbiddenWord: null,
          guess: null,
          isCorrect: null,
          score: null,
          coachScore: null,
          coachFeedback: null,
          createdAt: '2026-09-11T12:00:00Z',
          completedAt: null,
        },
      }
    } else if (route.request().method() === 'POST') {
      started = true
      game = { ...game, status: 'pending', acceptedAt: null }
    }
    await route.fulfill({ status: path.endsWith('/rounds') ? 201 : 200, json: { data: game } })
  })

  await page.goto(`/games/explain-word/${relationshipId}`)
  await page.getByRole('button', { name: 'How to play' }).click()
  await expect(page.getByRole('dialog', { name: 'How to play' })).toBeVisible()
  await expect(page.getByText('Explain naturally')).toBeVisible()
  await page.getByRole('button', { name: 'Close rules' }).click()
  await page.getByRole('radio', { name: /Recorded practice/ }).check()
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Give me a word' }).click()
  await expect(page.getByText('passport', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rounds' })).toBeInViewport()
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByText('1:00 remaining')).toBeVisible()
  await expect(page.getByText(/0:5[89] remaining/)).toBeVisible({ timeout: 2_500 })
  pauseSession = true
  await expect(page.getByText('Game paused', { exact: true })).toBeVisible({ timeout: 6_000 })
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await expect(page.getByText(/0:[0-5][0-9] remaining/)).toBeVisible()
  pauseSession = false
  await expect(page.getByText('Game paused', { exact: true })).toHaveCount(0, { timeout: 6_000 })
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('button', { name: 'Play Your recorded explanation' })).toBeVisible()
  await page.getByRole('button', { name: 'Send explanation' }).click()
  await expect(page.getByText('AI coaching · 91/100')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await page.getByRole('button', { name: 'End game' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish for both players?' })).toBeVisible()
  await page.getByRole('button', { name: 'End game for everyone' }).click()
  await expect(page).toHaveURL('/')
})

test('shows the other player an immediate choice when a word game finishes', async ({ page }) => {
  await signIn(page)
  await page.addInitScript(() => {
    const testWindow = window as Window & { recordingTrackStopped?: boolean }
    const fakeTrack = {
      stop() {
        testWindow.recordingTrackStopped = true
      },
    }
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          testWindow.recordingTrackStopped = false
          return { getTracks: () => [fakeTrack] }
        },
      },
    })
    class FakeMediaRecorder {
      static isTypeSupported() {
        return true
      }
      mimeType = 'audio/webm;codecs=opus'
      state: RecordingState = 'inactive'
      ondataavailable: ((event: { data: Blob }) => void) | null = null
      onstop: (() => void) | null = null
      start() {
        this.state = 'recording'
      }
      stop() {
        this.state = 'inactive'
        this.onstop?.()
      }
    }
    Object.defineProperty(window, 'MediaRecorder', { configurable: true, value: FakeMediaRecorder })
  })
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )

  const gameId = '44444444-4444-4444-8444-444444444444'
  let game: WordGame = {
    id: gameId,
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'active',
    requestedById: partnerId,
    acceptedAt: '2026-09-11T12:00:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 1, partner: 2 },
    round: {
      id: '55555555-5555-4555-8555-555555555555',
      turnNumber: 1,
      explainerId: userId,
      topic: 'Travel',
      status: 'explaining',
      secretWord: 'souvenir',
      forbiddenWords: ['souvenir', 'souvenirs'],
      transcript: null,
      transcriptWords: [],
      audioAvailable: false,
      explanationMethod: null,
      usedForbiddenWord: null,
      guess: null,
      isCorrect: null,
      score: null,
      coachScore: null,
      coachFeedback: null,
      createdAt: '2026-09-13T12:00:00Z',
      completedAt: null,
    },
    rounds: [],
  }
  let sendGameFinished: (() => void) | undefined

  await page.routeWebSocket('wss://browser-test.supabase.co/realtime/v1/**', (socket) => {
    socket.onMessage((message) => {
      const [joinReference, reference, topic, event, payload] = JSON.parse(message.toString())

      if (event === 'phx_join') {
        const postgresChanges = payload.config.postgres_changes.map(
          (filter: Record<string, unknown>, index: number) => ({ ...filter, id: index + 1 }),
        )
        socket.send(
          JSON.stringify([
            joinReference,
            reference,
            topic,
            'phx_reply',
            { status: 'ok', response: { postgres_changes: postgresChanges } },
          ]),
        )

        if (
          payload.config.postgres_changes.some(
            (filter: Record<string, unknown>) => filter.table === 'word_games',
          )
        ) {
          sendGameFinished = () => {
            socket.send(
              JSON.stringify([
                null,
                null,
                topic,
                'postgres_changes',
                {
                  ids: [1],
                  data: {
                    columns: [],
                    commit_timestamp: '2026-09-13T12:00:00Z',
                    errors: null,
                    old_record: { id: gameId },
                    record: { id: gameId, status: 'finished' },
                    schema: 'public',
                    table: 'word_games',
                    type: 'UPDATE',
                  },
                },
              ]),
            )
          }
        }
      } else if (event === 'heartbeat') {
        socket.send(
          JSON.stringify([
            joinReference,
            reference,
            topic,
            'phx_reply',
            { status: 'ok', response: {} },
          ]),
        )
      }
    })
  })
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/presence') && route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 })
    } else {
      await route.fulfill({ json: { data: game } })
    }
  })

  await page.goto(`/games/explain-word/${relationshipId}`)
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await expect.poll(() => Boolean(sendGameFinished)).toBe(true)

  game = {
    ...game,
    status: 'finished',
    finishedAt: '2026-09-13T12:00:00Z',
    scores: { you: 1, partner: 3 },
  }
  sendGameFinished!()

  const dialog = page.getByRole('dialog', { name: 'The game has finished' })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Stop recording' })).toHaveCount(0)
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { recordingTrackStopped?: boolean }).recordingTrackStopped,
      ),
    )
    .toBe(true)
  await expect(dialog.getByLabel('Final score')).toContainText('You1:Bob3')
  await expect(dialog.getByRole('button', { name: 'Go home' })).toBeVisible()
  await dialog.getByRole('button', { name: 'View results' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Game finished' })).toBeVisible()
  await expect(page.getByText('Your result is saved. Review the rounds below')).toBeVisible()
  await expect(page.getByText('souvenir', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Rounds' })).toBeVisible()
})

test('synchronizes live-call preparation and guessing for both players', async ({ browser }) => {
  const explainerContext = await browser.newContext()
  const guesserContext = await browser.newContext()
  const explainerPage = await explainerContext.newPage()
  const guesserPage = await guesserContext.newPage()
  await signIn(explainerPage)
  await signIn(guesserPage, partnerId)
  const roundId = '55555555-5555-4555-8555-555555555555'
  const createdAt = new Date().toISOString()
  const round: NonNullable<WordGame['round']> = {
    id: roundId,
    turnNumber: 1,
    explainerId: userId,
    topic: 'Travel',
    status: 'awaiting_guess',
    secretWord: 'passport',
    forbiddenWords: ['passport', 'passports'],
    transcript: null,
    transcriptWords: [],
    audioAvailable: false,
    explanationMethod: 'live',
    usedForbiddenWord: null,
    guess: null,
    isCorrect: null,
    score: null,
    coachScore: null,
    coachFeedback: null,
    createdAt,
    completedAt: null,
  }
  const explainerGame: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'live_call',
    status: 'active',
    requestedById: userId,
    acceptedAt: '2026-09-11T12:00:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round,
    rounds: [],
  }
  const guesserGame: WordGame = {
    ...explainerGame,
    partner: { id: userId, username: 'alice', displayName: 'Alice', avatarUrl: null },
    round: { ...round, secretWord: null, forbiddenWords: null },
  }
  await explainerPage.route(`**/api/games/explain-word/${relationshipId}**`, (route) =>
    route.fulfill({ json: { data: explainerGame } }),
  )
  await guesserPage.route(`**/api/games/explain-word/${relationshipId}**`, (route) =>
    route.fulfill({ json: { data: guesserGame } }),
  )

  await Promise.all([
    explainerPage.goto(`/games/explain-word/${relationshipId}`),
    guesserPage.goto(`/games/explain-word/${relationshipId}`),
  ])
  await expect(explainerPage.getByText('Prepare the clue')).toBeVisible()
  await expect(guesserPage.getByText('Prepare the clue')).toBeVisible()
  await expect(explainerPage.getByRole('button', { name: /record/i })).toHaveCount(0)
  await expect(guesserPage.getByLabel('Your answer')).toHaveCount(0)

  await expect(explainerPage.getByText('Explain and guess')).toBeVisible({ timeout: 7_000 })
  await expect(guesserPage.getByText('Explain and guess')).toBeVisible({ timeout: 7_000 })
  await expect(explainerPage.getByText('Explain it now')).toBeVisible()
  await expect(guesserPage.getByLabel('Your answer')).toBeVisible()
  await expect(explainerPage.getByLabel('Your answer')).toHaveCount(0)

  await explainerContext.close()
  await guesserContext.close()
})

test('gives both live-call players a final 30-second guessing phase', async ({ browser }) => {
  const explainerContext = await browser.newContext()
  const guesserContext = await browser.newContext()
  const explainerPage = await explainerContext.newPage()
  const guesserPage = await guesserContext.newPage()
  await signIn(explainerPage)
  await signIn(guesserPage, partnerId)
  const createdAt = new Date(Date.now() - 65_000).toISOString()
  const serverTime = new Date().toISOString()
  const round: NonNullable<WordGame['round']> = {
    id: '55555555-5555-4555-8555-555555555555',
    turnNumber: 1,
    explainerId: userId,
    topic: 'Travel',
    status: 'awaiting_guess',
    secretWord: 'passport',
    forbiddenWords: ['passport', 'passports'],
    transcript: null,
    transcriptWords: [],
    audioAvailable: false,
    explanationMethod: 'live',
    usedForbiddenWord: null,
    guess: null,
    isCorrect: null,
    score: null,
    coachScore: null,
    coachFeedback: null,
    createdAt,
    completedAt: null,
  }
  const game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'live_call',
    status: 'active',
    serverTime,
    requestedById: userId,
    acceptedAt: '2026-09-11T12:00:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round,
    rounds: [],
  }
  await explainerPage.route(`**/api/games/explain-word/${relationshipId}**`, (route) =>
    route.fulfill({ json: { data: game } }),
  )
  await guesserPage.route(`**/api/games/explain-word/${relationshipId}**`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...game,
          partner: { id: userId, username: 'alice', displayName: 'Alice', avatarUrl: null },
          round: { ...round, secretWord: null, forbiddenWords: null },
        },
      },
    }),
  )

  await Promise.all([
    explainerPage.goto(`/games/explain-word/${relationshipId}`),
    guesserPage.goto(`/games/explain-word/${relationshipId}`),
  ])
  await expect(explainerPage.getByText('Final guess', { exact: true })).toBeVisible()
  await expect(guesserPage.getByText('Final guess', { exact: true })).toBeVisible()
  await expect(explainerPage.locator('.live-round-clock')).toHaveClass(/is-final-guess/)
  await expect(guesserPage.locator('.live-round-clock')).toHaveClass(/is-final-guess/)
  await expect(explainerPage.getByText('Clue finished')).toBeVisible()
  await expect(explainerPage.getByRole('timer')).toHaveText(/0:(2[89]|30)/)
  await expect(guesserPage.getByRole('timer')).toHaveText(/0:(2[89]|30)/)
  await expect(explainerPage.getByLabel('Your answer')).toHaveCount(0)
  await expect(guesserPage.getByLabel('Your answer')).toBeVisible()

  await explainerContext.close()
  await guesserContext.close()
})

test('shows the guesser synchronized Recorded practice timers', async ({ page }) => {
  await signIn(page)
  const now = new Date().toISOString()
  let game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'active',
    serverTime: now,
    requestedById: userId,
    acceptedAt: now,
    currentPlayerId: partnerId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: {
      id: '55555555-5555-4555-8555-555555555555',
      turnNumber: 1,
      explainerId: partnerId,
      topic: 'Travel',
      status: 'explaining',
      secretWord: null,
      forbiddenWords: null,
      transcript: null,
      transcriptWords: [],
      audioAvailable: false,
      explanationMethod: null,
      usedForbiddenWord: null,
      guess: null,
      isCorrect: null,
      score: null,
      coachScore: null,
      coachFeedback: null,
      recordingStartedAt: now,
      explainedAt: null,
      createdAt: now,
      completedAt: null,
    },
    rounds: [],
  }
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/audio')) {
      return route.fulfill({ json: { data: { url: 'https://audio.example.test/recording.wav' } } })
    }
    return route.fulfill({ json: { data: game } })
  })

  await page.goto(`/games/explain-word/${relationshipId}`)
  await expect(page.getByText('Recording in progress')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/(0:59|1:00)/)
  await expect(page.getByLabel('Your answer')).toHaveCount(0)

  const explainedAt = new Date().toISOString()
  game = {
    ...game,
    serverTime: explainedAt,
    round: {
      ...game.round!,
      status: 'awaiting_guess',
      audioAvailable: true,
      explanationMethod: 'recorded',
      transcript: 'You need this document to cross a border.',
      explainedAt,
    },
  }
  await expect(page.getByText('Listen and guess')).toBeVisible({ timeout: 4_500 })
  await expect(page.getByRole('timer')).toHaveText(/(1:29|1:30)/)
  await expect(page.getByLabel('Your answer')).toBeVisible()
})

test('shows the partner both the recording and transcript before their answer', async ({
  page,
}) => {
  await signIn(page)
  const roundId = '55555555-5555-4555-8555-555555555555'
  const game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'active',
    serverTime: new Date().toISOString(),
    requestedById: partnerId,
    acceptedAt: '2026-09-11T12:00:00Z',
    currentPlayerId: partnerId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: {
      id: roundId,
      turnNumber: 1,
      explainerId: partnerId,
      topic: 'Travel',
      status: 'awaiting_guess',
      secretWord: null,
      forbiddenWords: null,
      transcript: 'You need this document to cross a border.',
      transcriptWords: [],
      audioAvailable: true,
      explanationMethod: 'recorded',
      usedForbiddenWord: false,
      guess: null,
      isCorrect: null,
      score: null,
      coachScore: null,
      coachFeedback: null,
      explainedAt: new Date().toISOString(),
      createdAt: '2026-09-11T12:00:00Z',
      completedAt: null,
    },
    rounds: [
      {
        id: roundId,
        turnNumber: 1,
        explainerId: partnerId,
        topic: 'Travel',
        status: 'awaiting_guess',
        word: null,
        guess: null,
        isCorrect: null,
        score: null,
        explanationMethod: 'recorded',
        coachScore: null,
        completedAt: null,
      },
    ],
  }
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/audio')) {
      return route.fulfill({ json: { data: { url: 'https://audio.example.test/recording.wav' } } })
    }
    return route.fulfill({ json: { data: game } })
  })

  await page.goto(`/games/explain-word/${relationshipId}`)

  await expect(
    page.getByText('You need this document to cross a border.', { exact: true }),
  ).toBeVisible()
  await expect(page.getByText('Listen to their explanation')).toBeVisible()
  await expect(page.getByText('Listen and guess')).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/(1:29|1:30)/)
  await expect(page.locator('audio')).toHaveAttribute(
    'src',
    'https://audio.example.test/recording.wav',
  )
  await expect(
    page.getByRole('button', { name: 'Play Partner’s recorded explanation' }),
  ).toBeVisible()
  const recordingProgress = page.getByLabel('Partner’s recorded explanation progress')
  await recordingProgress.hover()
  await expect(page.locator('html')).toHaveClass(/custom-cursor-interactive/)
  await expect(recordingProgress).toHaveCSS('cursor', 'none')
  await page.getByRole('button', { name: 'Playback speed, 1 times' }).click()
  await expect(page.getByRole('button', { name: 'Playback speed, 1.25 times' })).toBeVisible()
  const answerInput = page.getByLabel('Your answer')
  await expect(answerInput).toBeVisible()
  await expect(answerInput).toHaveAttribute('autocomplete', 'off')
  await expect(answerInput).toHaveAttribute('name', `word-guess-${roundId}`)
  const liveRounds = page.getByRole('table')
  await expect(liveRounds).toContainText('Travel')
  await expect(liveRounds).toContainText('Hidden')
  await expect(liveRounds).toContainText('In progress')
})

test('shows every finished game and its rounds in History', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.unroute('**/api/games/explain-word/history')
  await page.route('**/api/games/explain-word/history', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            partnershipId: relationshipId,
            mode: 'recorded',
            finishedAt: '2026-09-11T12:10:00Z',
            partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
            scores: { you: 2, partner: 1 },
            roundCount: 2,
            rounds: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                turnNumber: 1,
                explainerId: userId,
                topic: 'Travel',
                status: 'completed',
                word: 'passport',
                guess: 'passport',
                isCorrect: true,
                score: 1,
                explanationMethod: 'recorded',
                coachScore: 88,
                completedAt: '2026-09-11T12:05:00Z',
              },
              {
                id: '66666666-6666-4666-8666-666666666666',
                turnNumber: 2,
                explainerId: partnerId,
                topic: 'Food',
                status: 'skipped',
                word: 'sandwich',
                guess: null,
                isCorrect: false,
                score: 0,
                explanationMethod: null,
                coachScore: null,
                completedAt: '2026-09-11T12:09:00Z',
              },
            ],
          },
          {
            id: '77777777-7777-4777-8777-777777777777',
            partnershipId: relationshipId,
            mode: 'live_call',
            finishedAt: '2026-09-10T10:10:00Z',
            partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
            scores: { you: 0, partner: 0 },
            roundCount: 0,
            rounds: [],
          },
        ],
      },
    }),
  )

  await page.goto('/')
  await page.getByRole('link', { name: 'History', exact: true }).click()
  await expect(page.locator('.history-card')).toHaveCount(2)
  await expect(page.getByLabel('2 finished games')).toBeVisible()
  await page.getByText('Round details', { exact: true }).first().click()
  const rounds = page.locator('.history-card').first().getByRole('table')
  await expect(rounds.getByRole('row')).toHaveCount(3)
  await expect(rounds).toContainText('passport')
  await expect(rounds).toContainText('+1 correct')
})

test('returns to Games after cancelling a replay request from History', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.unroute('**/api/games/explain-word/history')
  await page.route('**/api/games/explain-word/history', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            partnershipId: relationshipId,
            mode: 'recorded',
            finishedAt: '2026-09-11T12:10:00Z',
            partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
            scores: { you: 2, partner: 1 },
            roundCount: 0,
            rounds: [],
          },
        ],
      },
    }),
  )

  const pendingGame: WordGame = {
    id: '77777777-7777-4777-8777-777777777777',
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'pending',
    requestedById: userId,
    acceptedAt: null,
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: null,
    rounds: [],
  }
  let cancelled = false
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    if (route.request().method() === 'DELETE') {
      cancelled = true
      await route.fulfill({ status: 204 })
    } else {
      await route.fulfill({ json: { data: pendingGame } })
    }
  })

  await page.goto('/?view=history')
  await page.getByRole('button', { name: 'Play again' }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()

  await page.getByRole('button', { name: 'Cancel invitation' }).click()

  await expect.poll(() => cancelled).toBe(true)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Who are you practising with?' })).toBeVisible()
})

test('notifications are anchored, actionable, and do not block navigation', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.route('**/api/games/explain-word', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            partnershipId: relationshipId,
            mode: 'live_call',
            status: 'pending',
            requestedById: partnerId,
          },
        ],
      },
    }),
  )
  await page.goto('/')
  const gameRequest = page.getByRole('region', { name: 'Game invitation' })
  await expect(gameRequest).toBeVisible()
  await expect(gameRequest).toContainText('Bob wants to play')
  await expect(gameRequest).toContainText('Live call')
  const requestBounds = (await gameRequest.boundingBox())!
  const viewport = page.viewportSize()!
  expect(requestBounds.x + requestBounds.width).toBeGreaterThan(viewport.width - 40)
  expect(requestBounds.y + requestBounds.height).toBeGreaterThan(viewport.height - 40)
  await gameRequest.getByRole('button', { name: 'Dismiss game invitation' }).click()
  await expect(gameRequest).toHaveCount(0)
  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  const panel = page.getByRole('region', { name: 'Notifications' })
  await expect(panel.getByRole('button', { name: 'Join game' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(
    page.getByRole('button', { name: 'Notifications, pending invitations' }),
  ).toBeFocused()
  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible()
})

test('keeps the app shell aligned between dashboard views with different heights', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 })
  await signIn(page)
  await page.goto('/')

  const header = page.locator('.site-header')
  const practiceBounds = await header.boundingBox()
  expect(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarGutter),
  ).toBe('stable')

  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Friends', exact: true })).toBeVisible()
  const friendsBounds = await header.boundingBox()

  expect(friendsBounds?.x).toBe(practiceBounds?.x)
  expect(friendsBounds?.width).toBe(practiceBounds?.width)
})

for (const width of [320, 390, 1440]) {
  test(`compact add-friend flow fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)
    await page.goto('/')
    if (width === 1440) {
      await expect(
        page.getByRole('heading', { name: 'Who are you practising with?' }),
      ).toBeInViewport()
      await page.getByRole('link', { name: 'History', exact: true }).click()
      await expect(
        page.getByRole('heading', { name: 'Your finished games will live here' }),
      ).toBeInViewport()
      await page.getByRole('link', { name: 'Practice', exact: true }).click()
    }
    await page.getByRole('link', { name: 'Invite your first friend', exact: true }).click()
    const inviteDialog = page.getByRole('dialog', { name: 'Invite a friend' })
    await expect(inviteDialog).toBeVisible()
    expect((await inviteDialog.boundingBox())!.height).toBeLessThan(400)
    if (width === 1440) {
      const closeButton = page.getByRole('button', { name: 'Close panel' })
      await closeButton.hover()
      const dialogCursor = inviteDialog.locator('.custom-cursor')
      await expect(dialogCursor).toHaveCSS('opacity', '1')
      await expect(dialogCursor).toHaveCSS('width', '38px')
    }
    const sendButton = page.getByRole('button', { name: 'Send invite', exact: true })
    expect((await sendButton.boundingBox())!.height).toBeLessThan(60)
    expect(await sendButton.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe(
      'nowrap',
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: 'Invitations', exact: true }).click()
    await expect(page.getByText('No pending invitations.')).toBeVisible()
    if (width === 1440) {
      await expect(page.getByText('No pending invitations.')).toBeInViewport()
    }
    await page.getByRole('link', { name: 'Your profile' }).click()
    await page.getByRole('button', { name: 'Profile settings' }).click()
    await expect(page.getByLabel('Display name')).toBeVisible()
    if (width === 1440) {
      await expect(page.getByLabel('Display name')).toBeInViewport()
    }
  })
}

const activeGame: WordGame = {
  id: '44444444-4444-4444-8444-444444444444',
  partnershipId: relationshipId,
  mode: 'recorded',
  status: 'active',
  requestedById: userId,
  acceptedAt: '2026-09-11T12:00:00Z',
  currentPlayerId: userId,
  partner: relationship('incoming').partner,
  scores: { you: 0, partner: 0 },
  round: null,
}

test('dashboard opens mode selection before sending one invitation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  let requests = 0
  let left = false
  const previousGame: WordGame = {
    ...activeGame,
    status: 'finished',
    finishedAt: '2026-09-10T12:00:00Z',
  }
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    if (route.request().method() === 'GET' && requests === 0) {
      await route.fulfill({ json: { data: previousGame } })
      return
    }
    if (route.request().method() === 'POST' && route.request().url().endsWith(relationshipId)) {
      requests++
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (route.request().method() === 'DELETE' && route.request().url().endsWith('/presence'))
      left = true
    await route.fulfill({ json: { data: activeGame } })
  })
  await page.goto('/?view=friends')
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(
    page.getByRole('button', { name: /Choose a mode|Join now|Jump back in/ }),
  ).toHaveCount(0)
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: 'Choose a mode' }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}?new=1`)
  expect(requests).toBe(0)
  await expect(page.getByRole('radio', { name: /Live call/ })).toBeChecked()
  await expect(page.getByRole('button', { name: 'Back to results' })).toHaveCount(0)
  const recordedModeCard = page.getByRole('radio', { name: /Recorded practice/ }).locator('..')
  await recordedModeCard.hover()
  await expect(page.locator('html')).toHaveClass(/custom-cursor-interactive/)
  await expect(recordedModeCard).toHaveCSS('cursor', 'none')
  for (const width of [947, 760, 640, 601, 390]) {
    await page.setViewportSize({ width, height: 844 })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `mode selection should fit a ${width}px viewport`,
    ).toBe(true)
  }
  await page.getByRole('button', { name: 'Invite to play' }).dblclick()
  expect(requests).toBe(1)
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible()
  const foodTopicCard = page.getByRole('radio', { name: 'Food' }).locator('..')
  await foodTopicCard.hover()
  await expect(page.locator('html')).toHaveClass(/custom-cursor-interactive/)
  await expect(foodTopicCard).toHaveCSS('cursor', 'none')
  await page.getByRole('button', { name: 'Notifications', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Notifications' })).toBeVisible()
  expect(left).toBe(false)
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  await page.getByRole('link', { name: 'Friends', exact: true }).click()
  await expect.poll(() => left).toBe(true)
})

test('joining directly from notifications accepts before entering the game', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  let accepted = false
  await page.route('**/api/games/explain-word', (route) =>
    route.fulfill({
      json: {
        data: accepted
          ? []
          : [
              {
                partnershipId: relationshipId,
                mode: 'live_call',
                status: 'pending',
                requestedById: partnerId,
              },
            ],
      },
    }),
  )
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) => {
    if (route.request().url().endsWith('/accept')) accepted = true
    return route.fulfill({ json: { data: activeGame } })
  })
  await page.goto('/')
  const gameRequest = page.getByRole('region', { name: 'Game invitation' })
  await expect(gameRequest).toBeVisible()
  await expect(gameRequest.getByRole('button', { name: 'Join game' })).toBeVisible()
  await expect(gameRequest.getByRole('button', { name: 'Decline' })).toBeVisible()
  await gameRequest.getByRole('button', { name: 'Join game' }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  expect(accepted).toBe(true)
})

test('blocks another game invitation while a game is already in progress', async ({ page }) => {
  await signIn(page)
  const secondRelationship: Partnership = {
    id: secondRelationshipId,
    direction: 'incoming',
    status: 'active',
    partner: {
      id: secondPartnerId,
      username: 'charlie',
      displayName: 'Charlie',
      avatarUrl: null,
    },
    createdAt: '2026-01-02T00:00:00Z',
    acceptedAt: '2026-01-02T00:01:00Z',
  }
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({
      json: {
        data: [relationship('incoming', 'active'), secondRelationship],
        nextCursor: null,
      },
    }),
  )
  await page.unroute('**/api/games/explain-word')
  await page.route('**/api/games/explain-word', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            partnershipId: relationshipId,
            mode: 'recorded',
            status: 'active',
            requestedById: userId,
          },
          {
            partnershipId: secondRelationshipId,
            mode: 'live_call',
            status: 'pending',
            requestedById: secondPartnerId,
          },
        ],
      },
    }),
  )

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Jump back in' })).toBeEnabled()
  await expect(
    page
      .getByRole('region', { name: 'Game invitation' })
      .getByRole('button', { name: 'Game in progress' }),
  ).toBeDisabled()
  await expect(page.getByText('Finish your current game first', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  const notifications = page.getByRole('region', { name: 'Notifications' })
  await expect(notifications.getByRole('button', { name: 'Finish current game' })).toBeDisabled()
  await expect(notifications).toContainText(
    'Finish your current game before accepting another invitation.',
  )
  await expect(notifications.getByRole('button', { name: 'Decline' })).toBeEnabled()
})

test('long notifications scroll without hiding the close control on a short screen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 360 })
  await signIn(page)
  const data = Array.from({ length: 15 }, (_, index) => ({
    ...relationship('incoming'),
    id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
    partner: { ...relationship('incoming').partner, displayName: `Friend ${index}` },
  }))
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data, nextCursor: null } }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Notifications, pending invitations' }).click()
  const panel = page.getByRole('region', { name: 'Notifications' })
  const bounds = (await panel.boundingBox())!
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(360)
  expect(
    await page
      .locator('.notification-list')
      .evaluate((element) => element.scrollHeight > element.clientHeight),
  ).toBe(true)
  await panel.getByText('Friend 14', { exact: true }).scrollIntoViewIfNeeded()
  await expect(page.getByRole('button', { name: 'Close notifications' })).toBeInViewport()
})

test('resuming an existing game never sends a new request', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.route('**/api/games/explain-word', (route) =>
    route.fulfill({
      json: {
        data: [
          {
            partnershipId: relationshipId,
            mode: 'recorded',
            status: 'active',
            requestedById: userId,
          },
        ],
      },
    }),
  )
  let starts = 0
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith(relationshipId))
      starts++
    return route.fulfill({ json: { data: activeGame } })
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Jump back in', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Jump back in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible()
  expect(starts).toBe(0)
})

test('a busy friend is not invited and can be retried later', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  let attempts = 0
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) => {
    if (route.request().method() === 'GET' && attempts < 2) {
      return route.fulfill({
        status: 404,
        json: { error: { code: 'word_game_not_found', message: 'Not started' } },
      })
    }
    if (route.request().method() === 'POST' && route.request().url().endsWith(relationshipId)) {
      attempts++
      if (attempts === 1)
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: 'word_game_partner_busy',
              message: 'Your friend is already playing another game. Try again later.',
            },
          },
        })
    }
    return route.fulfill({ json: { data: activeGame } })
  })
  await page.goto('/')
  await page.getByLabel('Play with').fill('bob')
  await page.getByRole('button', { name: 'Choose a mode' }).click()
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Your friend is already playing another game. Try again later.',
  )
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}?new=1`)
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  expect(attempts).toBe(2)
})
