import { expect, test, type Page } from '@playwright/test'

import words from '../../src/client/features/demo/words.json' with { type: 'json' }

test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test('keeps the game card readable across breakpoints and opens / in guest mode from the logo', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/demo')
  const game = page.getByRole('button', { name: 'Explain the word' })
  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(game).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  for (const width of [320, 390, 600, 700, 701, 722, 768, 850, 851, 1024, 1025, 1280, 1440]) {
    await page.setViewportSize({ width, height: 646 })
    const fits = await game.evaluate((card) => {
      const bounds = card.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(card.querySelector('.game-choice-copy')!)
      const textFits = [...range.getClientRects()].every(
        (rect) => rect.left >= bounds.left && rect.right <= bounds.right,
      )
      return textFits && document.documentElement.scrollWidth <= innerWidth
    })
    expect(fits, `Catalog content fits at ${width}px`).toBe(true)
    const centered = await play.evaluate((button) => {
      const { left, width } = button.getBoundingClientRect()
      const footer = button.closest('.quick-start-footer')!.getBoundingClientRect()
      return Math.abs(left + width / 2 - (footer.left + footer.width / 2)) <= 1
    })
    expect(centered, `Play is centered at ${width}px`).toBe(true)
  }

  await page.setViewportSize({ width: 722, height: 646 })
  await game.click()
  await expect(page.locator('.demo-play-ball')).toHaveCSS('animation-name', 'none')
  await page.getByRole('link', { name: 'Meeting Place demo home' }).click()
  await expect(page).toHaveURL('/')
  await expect(game).toHaveAttribute('aria-pressed', 'true')
  await page.reload()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await game.click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('link', { name: 'Lobby' }).click()
  await expect(page).toHaveURL('/')
  await expect(game).toBeVisible()
  await page.getByRole('link', { name: 'Sign in' }).click()
  await expect(page.getByRole('button', { name: 'Start practicing with Google' })).toBeVisible()
})

async function startDemo(page: Page, topic: string) {
  const play = page.getByRole('button', { name: 'Play', exact: true })
  await expect(play).toBeDisabled()
  await page.getByRole('button', { name: 'Explain the word' }).click()
  await expect(page.locator('.demo-play-ball')).toHaveCSS(
    'animation-name',
    'demo-play-ping-pong-pass',
  )
  await expect(page.locator('.demo-play-ball')).toHaveCSS('animation-iteration-count', 'infinite')
  await play.click()
  await expect(page.getByRole('heading', { name: 'Explain the word' })).toBeVisible()
  await expect(page.locator('.game-lobby-ready')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Recorded' })).toBeChecked()
  await page.getByRole('button', { name: '2 min' }).click()
  await expect(page.getByRole('button', { name: '2 min' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: 'Start game' }).click()
  await expect(page.locator('.game-page-header.is-room')).toBeVisible()
  await expect(page.locator('.new-round-card')).toBeVisible()
  await page.getByRole('radio', { name: topic }).locator('..').click()
  await expect(page.getByRole('radio', { name: topic })).toBeChecked()
  await page.getByRole('button', { name: 'Give me a word' }).click()
}

async function sendExplanation(page: Page) {
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByRole('timer')).toContainText(/2:00|1:5[5-9]/u)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  const preview = page.getByRole('group', { name: 'Your recorded explanation' }).locator('audio')
  await expect(preview).toHaveAttribute('src', /^blob:/u)
  const previewUrl = await preview.getAttribute('src')
  await page.getByRole('button', { name: 'Send explanation' }).click()
  await expect(page.locator('.demo-guess-waiting-stage')).toBeVisible()
  await expect(page.locator('.demo-clue-orbit-satellite').first()).toHaveCSS(
    'animation-name',
    'demo-clue-orbit-loop',
  )
  await expect(preview).toHaveCount(0)
  await expect(page.locator('html')).toHaveAttribute('data-revoked-preview', previewUrl!)
}

async function waitForPartnerClue(page: Page, clueDurationMs: number) {
  const preparing = page.getByRole('heading', { name: 'Waiting for Demo partner' })
  await page.clock.fastForward(4000)
  await expect(preparing).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true)
  await page.clock.fastForward(6000)

  const recording = page.getByText('Recording in progress', { exact: true })
  await expect(recording).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText('2:00')
  await page.clock.fastForward(clueDurationMs - 1500)
  await expect(recording).toBeVisible()
  await expect(page.getByRole('timer')).toHaveText(/^1:5\d$/u)
  await page.clock.fastForward(1500)
}

test('plays both recorded roles from the public demo with local audio and no API requests', async ({
  page,
}) => {
  await page.setViewportSize({ width: 705, height: 646 })
  await page.clock.install()
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url) => {
      revoke(url)
      document.documentElement.dataset.revokedPreview = url
    }
  })
  const networkCalls: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (
      url.protocol !== 'blob:' &&
      (url.origin !== 'http://127.0.0.1:5174' ||
        url.pathname.startsWith('/api/') ||
        ['fetch', 'xhr'].includes(request.resourceType()))
    ) {
      networkCalls.push(request.url())
    }
  })
  page.on('websocket', (socket) => networkCalls.push(socket.url()))

  await page.goto('/demo')
  await expect(page.getByRole('heading', { name: 'Choose a game' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Choose a friend' })).toHaveCount(0)
  await startDemo(page, 'Food')

  await expect(page.getByRole('heading', { name: 'pancake' })).toBeVisible()
  await expect(page.getByText(/never uploaded or saved/)).toBeVisible()
  await sendExplanation(page)
  await page.clock.fastForward(4000)
  await expect(page.locator('.demo-guess-waiting-stage')).toBeVisible()
  await page.clock.fastForward(6000)
  await expect(page.getByRole('status', { name: 'Round 1: Correct!' })).toBeVisible()
  const { clueDurationMs } = words.Food[1]!
  await waitForPartnerClue(page, clueDurationMs)
  const player = page.getByRole('group', { name: 'Partner’s recorded explanation' })
  await expect(player).toBeVisible({ timeout: 7000 })
  const clue = player.locator('audio')
  await expect
    .poll(() => clue.evaluate((audio: HTMLAudioElement) => audio.duration))
    .toBeGreaterThanOrEqual(5)
  expect(await clue.evaluate((audio: HTMLAudioElement) => audio.duration)).toBeLessThan(10.1)
  expect(
    Math.abs(
      (await clue.evaluate((audio: HTMLAudioElement) => audio.duration)) * 1000 - clueDurationMs,
    ),
  ).toBeLessThan(100)
  const playClue = player.getByRole('button', { name: 'Play Partner’s recorded explanation' })
  if (await playClue.isVisible()) await playClue.click()
  await expect
    .poll(() => clue.evaluate((audio: HTMLAudioElement) => audio.currentTime))
    .toBeGreaterThan(0)
  await expect(playClue).toBeVisible({ timeout: 12_000 })
  const progress = player.getByRole('slider', { name: 'Partner’s recorded explanation progress' })
  await expect(progress).toHaveValue((await progress.getAttribute('max'))!)
  await expect(player).toHaveCSS('--audio-progress', '100%')
  await expect(progress).toHaveAttribute('aria-valuetext', /^(\d+:\d\d) of \1$/u)
  await page.getByText('Show transcript', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Your answer' }).fill('A lemon')
  await page.getByRole('button', { name: 'Submit guess' }).click()
  await expect(page.getByRole('status', { name: 'Round 2: Correct!' })).toBeVisible()
  await page.getByRole('button', { name: 'Give me a word' }).click()
  await expect(page.getByRole('heading', { name: 'sandwich' })).toBeVisible()
  await sendExplanation(page)
  await page.clock.fastForward(10_000)
  await expect(page.getByRole('heading', { name: 'Does this answer count?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep as incorrect' }).click()
  await expect(page.getByRole('status', { name: 'Round 3: Not quite' })).toBeVisible()
  await waitForPartnerClue(page, words.Food[0]!.clueDurationMs)
  await page.getByText('Show transcript', { exact: true }).click()
  await page.getByRole('textbox', { name: 'Your answer' }).fill('waffle')
  await page.getByRole('button', { name: 'Submit guess' }).click()
  await page.clock.fastForward(4000)
  await expect(page.getByRole('heading', { name: 'Waiting for answer review' })).toBeVisible()
  await page.clock.fastForward(6000)
  await expect(page.getByRole('status', { name: 'Round 4: Not quite' })).toContainText('pancake')
  await page.getByRole('button', { name: 'Give me a word' }).click()
  await expect(page.getByRole('heading', { name: 'lemon' })).toBeVisible()
  expect(networkCalls).toEqual([])
})

test('opens the demo from sign-in and still plays when microphone access is denied', async ({
  page,
}) => {
  await page.clock.install()
  await page.setViewportSize({ width: 320, height: 800 })
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError')
    }
  })
  await page.goto('/login')
  await page.getByRole('link', { name: 'Try without signing up' }).click()
  await startDemo(page, 'Travel')
  await page.getByRole('button', { name: 'Start recording' }).click()
  await expect(page.getByRole('alert')).toContainText('Couldn’t access the microphone')
  await page.getByRole('button', { name: 'Skip word' }).click()
  await waitForPartnerClue(page, words.Travel[1]!.clueDurationMs)
  await expect(page.getByRole('textbox', { name: 'Your answer' })).toBeVisible({ timeout: 7000 })
  expect(page.url()).toContain('/demo/play')
})
