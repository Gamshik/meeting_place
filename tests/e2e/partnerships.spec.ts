import { expect, test, type Page } from '@playwright/test'
import type { Partnership, WordGame } from '../../src/shared/contracts'

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

  await expect(page.getByRole('heading', { name: 'Invitations for you' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bob', exact: true })).toBeVisible()
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
          transcript: 'You need this document to cross a border.',
          transcriptWords: [],
          usedForbiddenWord: false,
          coachScore: 91,
          coachFeedback: 'Clear description. Add one more identifying detail.',
        },
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
  await page.getByRole('button', { name: 'Send game request' }).click()
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Choose a topic' })).toBeVisible({
    timeout: 5000,
  })
  await page.getByRole('button', { name: 'Give me a word' }).click()
  await expect(page.getByText('passport', { exact: true }).first()).toBeVisible()
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
  await page.getByRole('button', { name: 'Send explanation' }).click()
  await expect(page.getByText('AI coaching · 91/100')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting for Bob' })).toBeVisible()
  await page.getByRole('button', { name: 'End game' }).click()
  await expect(page.getByRole('dialog', { name: 'Finish for both players?' })).toBeVisible()
  await page.getByRole('button', { name: 'End game for everyone' }).click()
  await expect(page).toHaveURL('/')
})

test('shows the partner both the recording and transcript before their answer', async ({
  page,
}) => {
  await signIn(page)
  const roundId = '55555555-5555-4555-8555-555555555555'
  const game: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    status: 'active',
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
      usedForbiddenWord: false,
      guess: null,
      isCorrect: null,
      score: null,
      coachScore: null,
      coachFeedback: null,
      createdAt: '2026-09-11T12:00:00Z',
      completedAt: null,
    },
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
  await expect(page.locator('audio')).toHaveAttribute(
    'src',
    'https://audio.example.test/recording.wav',
  )
  await expect(page.getByLabel('Your answer')).toBeVisible()
})

test('opens a finished game from the final-score button', async ({ page }) => {
  await signIn(page)
  const finishedGame: WordGame = {
    id: '44444444-4444-4444-8444-444444444444',
    partnershipId: relationshipId,
    status: 'finished',
    requestedById: userId,
    acceptedAt: '2026-09-11T12:00:00Z',
    finishedAt: '2026-09-11T12:10:00Z',
    currentPlayerId: userId,
    partner: { id: partnerId, username: 'bob', displayName: 'Bob', avatarUrl: null },
    scores: { you: 2, partner: 1 },
    round: null,
  }
  await page.route('**/api/partnerships**', (route) =>
    route.fulfill({ json: { data: [relationship('incoming', 'active')], nextCursor: null } }),
  )
  await page.unroute('**/api/games/explain-word')
  await page.route('**/api/games/explain-word', (route) =>
    route.fulfill({
      json: {
        data: [{ partnershipId: relationshipId, status: 'finished', requestedById: userId }],
      },
    }),
  )
  await page.route(`**/api/games/explain-word/${relationshipId}`, (route) =>
    route.fulfill({ json: { data: finishedGame } }),
  )

  await page.goto('/')
  const finalScoreButton = page.getByRole('button', { name: 'View final score' })
  await expect(finalScoreButton).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Play again' })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled()
  await finalScoreButton.click()
  await expect(page).toHaveURL(`/games/explain-word/${relationshipId}`)
  await expect(page.getByText('Game finished', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start a new game' })).toBeEnabled()
})
