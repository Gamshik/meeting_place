import { expect, test, type Page } from '@playwright/test'
import type { Partnership, ProfileActivity, WordGame } from '@contracts/contracts'

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
  await page.getByRole('button', { name: 'Remove Bob', exact: true }).click()
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
  await expect(page.getByRole('button', { name: 'Start practicing with Google' })).toBeVisible()
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
  const copyUsername = page.getByRole('button', { name: 'Copy username' })
  await expect(copyUsername).toBeVisible()
  await copyUsername.click()
  const copiedNotice = page.getByRole('status').filter({ hasText: 'Username copied.' })
  await expect(copiedNotice).toBeVisible()
  expect((await copiedNotice.boundingBox())!.height).toBeLessThan(80)
  await expect(copiedNotice).toHaveCSS('border-radius', '18px 18px 18px 6px')
  await page.getByRole('button', { name: 'Profile settings' }).click()
  await expect(page.getByRole('heading', { name: 'Profile settings' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Your profile' })).toHaveCount(0)
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
    explanationDurationSeconds: 60,
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
          explanationDurationSeconds: 60,
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
  await page.getByRole('radio', { name: 'Recorded' }).check()
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page.getByRole('heading', { name: 'Explain the word' })).toHaveClass(/sr-only/)
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Give me a word' }).click()
  await expect(page.getByText('passport', { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rounds' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByText('1:00 remaining')).toBeVisible()
  await expect(page.getByText(/0:5[89] remaining/)).toBeVisible({ timeout: 2_500 })
  pauseSession = true
  await expect(page.getByText('Game paused', { exact: true })).toBeVisible({ timeout: 6_000 })
  const pauseCard = page.locator('.session-pause-card')
  expect(await pauseCard.evaluate((element) => element.clientWidth)).toBeLessThanOrEqual(760)
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible()
  await expect(page.getByText(/0:[0-5][0-9] remaining/)).toBeVisible()
  pauseSession = false
  await expect(page.getByText('Game paused', { exact: true })).toHaveCount(0, { timeout: 6_000 })
  await page.getByRole('button', { name: 'Stop recording' }).click()
  await expect(page.getByRole('button', { name: 'Play Your recorded explanation' })).toBeVisible()
  await page.getByRole('button', { name: 'Send explanation' }).click()
  await expect(page.getByText('Your explanation is ready.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await page.getByRole('button', { name: 'End game' }).click()
  const endDialog = page.getByRole('dialog', { name: 'End game?' })
  await expect(endDialog).toBeVisible()
  await expect(endDialog.locator('p')).toHaveCount(0)
  expect(await endDialog.evaluate((element) => element.clientHeight)).toBeLessThanOrEqual(250)
  await expect(endDialog.locator('.end-game-player')).toHaveCount(2)
  expect(await endDialog.locator('.end-game-player').allTextContents()).toEqual(['', ''])
  await expect(endDialog).toHaveCSS('animation-name', 'end-game-dialog-arrive')
  await expect(endDialog.locator('.end-game-player.is-left')).toHaveCSS(
    'animation-name',
    'end-game-player-left',
  )
  await endDialog.getByRole('button', { name: 'End game', exact: true }).click()
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
    explanationDurationSeconds: 60,
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
      explanationDurationSeconds: 60,
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

  await page.unroute('**/api/games/explain-word/history')
  await page.route('**/api/games/explain-word/history', (route) =>
    route.fulfill({
      json: {
        data:
          game.status === 'finished'
            ? [
                {
                  id: gameId,
                  partnershipId: relationshipId,
                  mode: 'recorded',
                  finishedAt: game.finishedAt,
                  partner: game.partner,
                  scores: game.scores,
                  roundCount: 0,
                  rounds: [],
                },
              ]
            : [],
      },
    }),
  )

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
  await expect(dialog.locator('.finished-game-celebration')).toBeVisible()
  await expect(dialog.locator('.finished-game-trophy')).toHaveCSS(
    'animation-name',
    'finished-trophy-bounce',
  )
  await expect(dialog.locator('#finished-game-title')).toHaveClass(/sr-only/)
  await expect(dialog.locator('p')).toHaveCount(1)
  await expect(page.getByText('Record your explanation', { exact: true })).toBeVisible()
  await expect(page.locator('.session-finished-card')).toHaveCount(0)
  await expect(page.locator('.rounds-section')).toHaveCount(0)
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
  await expect(page).toHaveURL(`/?view=history&highlight=${gameId}`)
  const highlightedGame = page.locator('.archive-results')
  await expect(highlightedGame).toBeVisible()
  await expect(highlightedGame).toHaveAttribute('data-game-id', gameId)
  await expect(highlightedGame).toBeFocused()

  await page.goto(`/games/explain-word/${relationshipId}?new=1`)
  await expect(page.getByRole('dialog', { name: 'The game has finished' })).toHaveCount(0)
  await expect(page.getByText('Mode', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Invite to play' })).toBeVisible()
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
    explanationDurationSeconds: 60,
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
    explanationDurationSeconds: 60,
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
  await expect(explainerPage.getByText('Get ready', { exact: true })).toBeVisible()
  await expect(guesserPage.getByText('Get ready', { exact: true })).toBeVisible()
  await expect(explainerPage.getByRole('button', { name: /record/i })).toHaveCount(0)
  await expect(guesserPage.getByLabel('Your answer')).toHaveCount(0)
  await expect(guesserPage.locator('.live-ready-cue')).toBeVisible()
  expect(
    await guesserPage.locator('.live-ready-cue').evaluate((element) => element.clientHeight),
  ).toBeLessThanOrEqual(140)
  await expect(guesserPage.locator('.live-listener-card')).toHaveCount(0)

  await expect(explainerPage.getByText('Explain now')).toBeVisible({ timeout: 7_000 })
  await expect(guesserPage.getByText('Guess now')).toBeVisible({ timeout: 7_000 })
  await expect(guesserPage.locator('.live-ready-cue')).toHaveCount(0)
  await expect(guesserPage.getByLabel('Your answer')).toBeVisible()
  await expect(guesserPage.locator('.guess-card')).toBeVisible()
  expect(
    await guesserPage.locator('.guess-card').evaluate((element) => element.clientWidth),
  ).toBeLessThanOrEqual(1040)
  expect(
    await guesserPage.locator('.guess-card').evaluate((element) => element.clientHeight),
  ).toBeLessThanOrEqual(270)
  await expect(explainerPage.getByLabel('Your answer')).toHaveCount(0)

  await explainerContext.close()
  await guesserContext.close()
})

test('lets the explainer approve an inexact guess without automatic checking', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  const roundId = '55555555-5555-4555-8555-555555555555'
  let game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'live_call',
    status: 'active',
    requestedById: userId,
    explanationDurationSeconds: 60,
    acceptedAt: '2026-09-18T12:00:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 0, partner: 0 },
    round: {
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
      explanationDurationSeconds: 60,
      usedForbiddenWord: false,
      guess: 'travel document',
      isCorrect: null,
      score: null,
      coachScore: null,
      coachFeedback: null,
      createdAt: '2026-09-18T12:00:00Z',
      completedAt: null,
    },
    rounds: [],
  }
  let submittedReview: unknown
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/presence') && route.request().method() === 'DELETE') {
      await route.fulfill({ status: 204 })
      return
    }
    if (path.endsWith('/review')) {
      submittedReview = route.request().postDataJSON()
      game = {
        ...game,
        currentPlayerId: partnerId,
        scores: { you: 1, partner: 0 },
        round: {
          ...game.round!,
          status: 'completed',
          isCorrect: true,
          score: 1,
          completedAt: '2026-09-18T12:01:00Z',
        },
      }
    }
    await route.fulfill({ json: { data: game } })
  })

  await page.goto(`/games/explain-word/${relationshipId}`)
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Meeting Place home' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Lobby' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Does this answer count?' })).toBeVisible()
  await expect(page.getByText('Answer review', { exact: true })).toHaveCount(0)
  expect(
    await page.locator('.guess-review-card').evaluate((element) => element.clientWidth),
  ).toBeLessThanOrEqual(720)
  expect(
    await page.locator('.guess-review-card').evaluate((element) => element.clientHeight),
  ).toBeLessThanOrEqual(240)
  await expect(page.getByText('travel document', { exact: true })).toBeVisible()
  await expect(page.getByText('passport', { exact: true })).toBeVisible()
  const comparisonColors = await page
    .locator('.guess-review-comparison > div')
    .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backgroundColor))
  expect(comparisonColors).toHaveLength(2)
  expect(comparisonColors[0]).not.toBe(comparisonColors[1])
  await page.getByRole('button', { name: 'Approve answer' }).click()

  expect(submittedReview).toEqual({ approved: true })
  await expect(page.getByRole('status', { name: 'Round 1: Correct!' })).toBeVisible()
  await expect(page.getByText('travel document', { exact: true })).toBeVisible()
  await expect(page.getByText('passport', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Score')).toContainText('You1:Bob0')
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
    explanationDurationSeconds: 60,
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
    explanationDurationSeconds: 60,
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
  await expect(explainerPage.getByRole('timer')).toHaveText(/0:(2[89]|30)/)
  await expect(guesserPage.getByRole('timer')).toHaveText(/0:(2[89]|30)/)
  await expect(explainerPage.getByLabel('Your answer')).toHaveCount(0)
  await expect(guesserPage.getByLabel('Your answer')).toBeVisible()

  await explainerContext.close()
  await guesserContext.close()
})

test('shows the guesser synchronized Recorded timers', async ({ page }) => {
  await signIn(page)
  const now = new Date().toISOString()
  let game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    mode: 'recorded',
    status: 'active',
    serverTime: now,
    requestedById: userId,
    explanationDurationSeconds: 60,
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
      explanationDurationSeconds: 60,
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
    explanationDurationSeconds: 60,
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
      explanationDurationSeconds: 60,
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

  await expect(page.locator('blockquote')).toContainText(
    'You need this document to cross a border.',
  )
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
  await expect(page.getByRole('table')).toHaveCount(0)
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
  await expect(page.locator('.archive-match')).toHaveCount(2)
  await expect(page.getByLabel('2 finished games')).toBeVisible()
  await expect(page.locator('.archive-match').first()).toHaveAttribute('aria-pressed', 'true')
  const rounds = page.locator('.archive-results').getByRole('table')
  await expect(rounds.getByRole('row')).toHaveCount(3)
  await expect(rounds).toContainText('passport')
  await expect(rounds).toContainText('You +1')
  await page.locator('.archive-match').nth(1).click()
  await expect(page.getByText('No rounds were played.', { exact: true })).toBeVisible()
  await expect(page.locator('.archive-match').nth(1)).toHaveAttribute('aria-pressed', 'true')
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
    explanationDurationSeconds: 60,
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

  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect.poll(() => cancelled).toBe(true)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
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
  expect(await gameRequest.evaluate((element) => element.parentElement === document.body)).toBe(
    true,
  )
  const viewport = page.viewportSize()!
  await expect
    .poll(async () => {
      const bounds = (await gameRequest.boundingBox())!
      return bounds.x + bounds.width
    })
    .toBeGreaterThan(viewport.width - 40)
  await expect
    .poll(async () => {
      const bounds = (await gameRequest.boundingBox())!
      return bounds.y + bounds.height
    })
    .toBeGreaterThan(viewport.height - 40)
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
  await expect(page.getByRole('navigation', { name: 'Friend lists' })).toBeVisible()
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
  await expect(page.getByRole('navigation', { name: 'Friend lists' })).toBeVisible()
  const friendsBounds = await header.boundingBox()

  expect(friendsBounds?.x).toBe(practiceBounds?.x)
  expect(friendsBounds?.width).toBe(practiceBounds?.width)
})

test('requires a game selection before a friend can be chosen', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({
      json: { data: [relationship('incoming', 'active')], nextCursor: null },
    }),
  )
  await page.goto('/')

  const game = page.getByRole('button', { name: 'Explain the word' })
  const start = page.getByRole('button', { name: 'Play', exact: true })
  await expect(game).toHaveAttribute('aria-pressed', 'false')
  await expect(start).toBeDisabled()

  await game.click()
  await expect(game).toHaveAttribute('aria-pressed', 'true')
  await expect(start).toBeEnabled()

  await game.click()
  await expect(game).toHaveAttribute('aria-pressed', 'false')
  await expect(start).toBeDisabled()
})

for (const width of [320, 390, 1440]) {
  test(`compact add-friend flow fits ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await signIn(page)
    await page.goto('/')
    if (width === 1440) {
      await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeInViewport()
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
    expect((await sendButton.boundingBox())!.height).toBeLessThan(72)
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
  explanationDurationSeconds: 60,
  acceptedAt: '2026-09-11T12:00:00Z',
  currentPlayerId: userId,
  partner: relationship('incoming').partner,
  scores: { you: 0, partner: 0 },
  round: null,
}

test('keeps the mobile game setup heading aligned', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.route(`**/api/games/explain-word/${relationshipId}**`, (route) =>
    route.fulfill({
      json: {
        data: {
          ...activeGame,
          status: 'finished',
          finishedAt: '2026-09-10T12:00:00Z',
        },
      },
    }),
  )

  await page.goto(`/games/explain-word/${relationshipId}?new=1`)
  const home = page.getByRole('link', { name: 'Lobby' })
  const title = page.getByRole('heading', { name: 'Explain the word' })
  const info = page.getByRole('button', { name: 'How to play' })
  const [homeBox, titleBox, infoBox] = await Promise.all([
    home.boundingBox(),
    title.boundingBox(),
    info.boundingBox(),
  ])

  expect(homeBox).not.toBeNull()
  expect(titleBox).not.toBeNull()
  expect(infoBox).not.toBeNull()
  expect(
    Math.abs(homeBox!.y + homeBox!.height / 2 - (titleBox!.y + titleBox!.height / 2)),
  ).toBeLessThan(3)
  expect(
    Math.abs(infoBox!.y + infoBox!.height / 2 - (titleBox!.y + titleBox!.height / 2)),
  ).toBeLessThan(3)
  expect(infoBox!.x).toBeGreaterThan(titleBox!.x + titleBox!.width)
  await expect(home).toHaveCSS('width', '48px')
  await expect(title).toHaveCSS('white-space', 'nowrap')
})

test('dashboard opens mode selection before sending one invitation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  let requests = 0
  let requestedDuration = 0
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
      requestedDuration = route.request().postDataJSON().explanationDurationSeconds
      await new Promise((resolve) => setTimeout(resolve, 200))
    }
    if (route.request().method() === 'DELETE' && route.request().url().endsWith('/presence'))
      left = true
    await route.fulfill({ json: { data: activeGame } })
  })
  await page.goto('/?view=friends')
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Practice', exact: true }).click()
  await page.getByRole('button', { name: 'Explain the word' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}?new=1`)
  expect(requests).toBe(0)
  await expect(page.getByRole('radio', { name: /Live call/ })).toBeChecked()
  await page.getByRole('button', { name: '3 min' }).click()
  await expect(page.getByRole('button', { name: 'Back to results' })).toHaveCount(0)
  const recordedModeCard = page.getByRole('radio', { name: 'Recorded' }).locator('..')
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
  await expect(page.locator('.game-lobby-ready')).toHaveCSS('box-shadow', 'none')
  await expect(page.locator('.game-lobby-ready')).toHaveCSS('border-top-width', '0px')
  await expect(page.locator('.game-mode-picker')).toHaveCSS('box-shadow', 'none')
  await expect(page.locator('.game-mode-picker')).toHaveCSS('border-top-width', '0px')
  await page.getByRole('button', { name: 'Invite to play' }).dblclick()
  expect(requests).toBe(1)
  expect(requestedDuration).toBe(180)
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible()
  const foodTopicCard = page.getByRole('radio', { name: 'Food' }).locator('..')
  await foodTopicCard.hover()
  await expect(page.locator('html')).toHaveClass(/custom-cursor-interactive/)
  await expect(foodTopicCard).toHaveCSS('cursor', 'none')
  expect(left).toBe(false)
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  await page.getByRole('link', { name: 'Lobby', exact: true }).click()
  await expect.poll(() => left).toBe(true)
})

test('the game creator can change the next round explanation time', async ({ page }) => {
  await signIn(page)
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  let game = activeGame
  await page.route(`**/api/games/explain-word/${relationshipId}**`, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/settings')) {
      game = { ...game, explanationDurationSeconds: 180 }
    }
    await route.fulfill({ json: { data: game } })
  })

  await page.goto(`/games/explain-word/${relationshipId}`)
  await page.locator('summary[aria-label="Change explanation time"]').click()
  await page.getByRole('button', { name: 'Close explanation time' }).click()
  await expect(page.getByRole('button', { name: 'Close explanation time' })).toBeHidden()
  await page.locator('summary[aria-label="Change explanation time"]').click()
  await page.getByRole('button', { name: '3 min' }).click()
  await page.getByRole('button', { name: 'Save for next round' }).click()

  await expect(page.getByText(/Explanation time changed to 3 min/)).toBeVisible()
  await expect(page.getByText(/It will apply from the next round/)).toBeVisible()
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
  await page.getByRole('button', { name: 'Explain the word' }).click()
  const activeFriendCard = page
    .locator('article.quick-friend')
    .filter({ has: page.getByRole('heading', { name: 'Bob', exact: true }) })
  await expect(activeFriendCard.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
  await expect(
    page
      .getByRole('region', { name: 'Game invitation' })
      .getByRole('button', { name: 'Game in progress' }),
  ).toBeDisabled()

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
  await page.getByRole('button', { name: 'Explain the word' }).click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: 'Play', exact: true }).click()
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
  await page.getByRole('button', { name: 'Explain the word' }).click()
  await page.getByLabel('Play with').fill('bob')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page.getByRole('alert')).toContainText(
    'Your friend is already playing another game. Try again later.',
  )
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}?new=1`)
  await page.getByRole('button', { name: 'Invite to play' }).click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  expect(attempts).toBe(2)
})

for (const width of [320, 1440]) {
  test(`history selection, pagination, and answers fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await signIn(page)
    await page.route('**/api/partnerships**', (route) =>
      route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
    )
    const entries = Array.from({ length: 8 }, (_, index) => ({
      id: `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
      partnershipId: relationshipId,
      mode: 'live_call',
      finishedAt: '2026-09-24T12:10:00Z',
      partner: {
        id: partnerId,
        username: 'bob',
        displayName: index === 7 ? 'A partner with a very long display name' : 'Bob',
        avatarUrl: null,
      },
      scores: { you: 0, partner: 1 },
      roundCount: 4,
      rounds: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          turnNumber: 1,
          explainerId: partnerId,
          topic: 'Nature',
          status: 'completed',
          word: 'meadow',
          guess: 'forest',
          isCorrect: false,
          score: 0,
          explanationMethod: 'live',
          coachScore: null,
          completedAt: '2026-09-24T12:05:00Z',
        },
        {
          id: '66666666-6666-4666-8666-666666666666',
          turnNumber: 2,
          explainerId: partnerId,
          topic: 'Travel',
          status: 'completed',
          word: 'harbor',
          guess: 'harbor',
          isCorrect: true,
          score: 1,
          explanationMethod: 'live',
          coachScore: null,
          completedAt: '2026-09-24T12:06:00Z',
        },
        {
          id: '77777777-7777-4777-8777-777777777777',
          turnNumber: 3,
          explainerId: userId,
          topic: 'Nature',
          status: 'awaiting_guess',
          word: 'glacier',
          guess: null,
          isCorrect: null,
          score: null,
          explanationMethod: 'live',
          coachScore: null,
          completedAt: null,
        },
        {
          id: '88888888-8888-4888-8888-888888888888',
          turnNumber: 4,
          explainerId: userId,
          topic: 'Nature',
          status: 'completed',
          word: 'tree',
          guess: 'tree',
          isCorrect: true,
          score: 0,
          explanationMethod: 'recorded',
          coachScore: null,
          completedAt: '2026-09-24T12:07:00Z',
        },
      ],
    }))
    await page.unroute('**/api/games/explain-word/history')
    await page.route('**/api/games/explain-word/history', (route) =>
      route.fulfill({ json: { data: entries } }),
    )
    entries[0]!.rounds = Array.from({ length: 30 }, (_, index) => ({
      ...entries[0]!.rounds[index % 4]!,
      id: `99999999-9999-4999-8999-${String(index).padStart(12, '0')}`,
      turnNumber: index + 1,
    }))
    entries[0]!.roundCount = 30
    await page.goto(`/?view=history&highlight=${entries[7]!.id}`)
    const results = page.locator('.archive-results')
    await expect(results).toHaveAttribute('data-game-id', entries[7]!.id)
    await expect(results).toBeFocused()
    await expect(page.locator('.archive-match')).toHaveCount(2)
    await expect(results.getByRole('columnheader')).toHaveText(['Word', 'Answer', 'Result'])
    await expect(results.getByRole('row').nth(1)).toContainText('forest')
    await expect(results.getByRole('row').nth(1)).toContainText('Incorrect')
    await expect(results.getByRole('row').nth(2)).toContainText(
      'A partner with a very long display name +1',
    )
    await expect(results).toContainText('Unfinished')
    await expect(results.getByRole('row').nth(4)).toContainText('No point')
    await expect(page.locator('.archive-count-orbit')).toHaveCSS('animation-name', 'none')
    await expect(page.getByRole('heading', { name: 'History', exact: true })).toHaveCount(0)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole('button', { name: 'Previous', exact: true }).click()
    await expect(page.locator('.archive-match')).toHaveCount(6)
    await expect(results).toHaveAttribute('data-game-id', entries[0]!.id)
    const scrollableRounds = page.getByRole('region', { name: 'Scrollable round results' })
    await scrollableRounds.focus()
    expect(
      await scrollableRounds.evaluate((element) => element.scrollHeight > element.clientHeight),
    ).toBe(true)
    const headingTop = (await results.getByRole('columnheader').first().boundingBox())!.y
    const documentTop = await page.evaluate(() => window.scrollY)
    await page.keyboard.press('End')
    await expect
      .poll(() => scrollableRounds.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)
    await expect(results.getByRole('row').last()).toBeInViewport()
    expect(
      Math.abs((await results.getByRole('columnheader').first().boundingBox())!.y - headingTop),
    ).toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => window.scrollY)).toBe(documentTop)
    const scrollBounds = (await scrollableRounds.boundingBox())!
    const tableBounds = (await results.getByRole('table').boundingBox())!
    expect(scrollBounds.height).toBeLessThanOrEqual(420)
    expect(
      scrollBounds.x + scrollBounds.width - tableBounds.x - tableBounds.width,
    ).toBeGreaterThanOrEqual(14)
    await page.screenshot({ path: `test-results/history-scrolled-${width}.png`, fullPage: true })
    await page.locator('.archive-match').nth(2).focus()
    await page.keyboard.press('Enter')
    await expect(results).toHaveAttribute('data-game-id', entries[2]!.id)
    await expect.poll(() => scrollableRounds.evaluate((element) => element.scrollTop)).toBe(0)
    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(results).toHaveAttribute('data-game-id', entries[6]!.id)
    await page.screenshot({ path: `test-results/history-${width}.png`, fullPage: true })
  })
}
