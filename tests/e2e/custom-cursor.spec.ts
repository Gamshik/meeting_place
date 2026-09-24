import { expect, test } from '@playwright/test'

test('desktop login fits without page scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/login')

  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true)
})

test('login badge icons fit their backgrounds on mobile', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  for (const width of [320, 375, 480, 658]) {
    await page.setViewportSize({ width, height: 740 })
    await expect(page.locator('.login-orbit-arrow svg')).toHaveCount(2)
    for (const arrow of await page.locator('.login-orbit-arrow svg').all()) {
      await expect(arrow).toHaveCSS('stroke', 'rgb(255, 109, 85)')
      await expect(arrow).toHaveAttribute('aria-hidden', 'true')
    }
    if (width === 375) {
      await page
        .locator('.login-art')
        .screenshot({ path: testInfo.outputPath('login-svg-arrows.png') })
    }
    const badges = page.locator('.login-promises')
    const bounds = await badges.locator('i').evaluateAll((icons) =>
      icons.map((icon) => {
        const range = document.createRange()
        range.selectNodeContents(icon)
        const text = range.getBoundingClientRect()
        const box = icon.getBoundingClientRect()
        const badge = icon.parentElement!.getBoundingClientRect()
        return {
          textFits:
            text.top >= box.top &&
            text.bottom <= box.bottom &&
            text.left >= box.left &&
            text.right <= box.right,
          iconFits:
            box.top >= badge.top &&
            box.bottom <= badge.bottom &&
            box.left >= badge.left &&
            box.right <= badge.right,
          width: box.width,
        }
      }),
    )
    for (const icon of bounds) {
      expect(icon.textFits).toBe(true)
      expect(icon.iconFits).toBe(true)
      expect(icon.width).toBe(24)
    }
    await badges.screenshot({ path: testInfo.outputPath(`login-badges-${width}.png`) })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }
})

test('custom cursor stays subtle and responds to interactive controls', async ({ page }) => {
  await page.goto('/login')
  await page.mouse.move(80, 120)

  const cursor = page.locator('.custom-cursor')
  await expect(page.locator('html')).toHaveClass(/custom-cursor-visible/)
  await expect(cursor).toHaveCSS('width', '11px')
  const cursorBounds = await cursor.boundingBox()
  expect(cursorBounds?.x).toBeCloseTo(74.5, 0)
  expect(cursorBounds?.y).toBeCloseTo(114.5, 0)

  await page.getByRole('button', { name: 'Start practicing with Google' }).hover()
  await expect(page.locator('html')).toHaveClass(/custom-cursor-interactive/)
  await expect(cursor).toHaveCSS('width', '38px')
})

test('custom cursor is disabled when reduced motion is preferred', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/login')
  await page.mouse.move(80, 120)

  await expect(page.locator('html')).not.toHaveClass(/custom-cursor-enabled/)
  await expect(page.locator('.custom-cursor')).toHaveCSS('display', 'none')
})

test('custom cursor overrides component and disabled cursors across control types', async ({
  page,
}) => {
  await page.goto('/login')
  await page.evaluate(() => {
    const fixture = document.createElement('section')
    fixture.id = 'cursor-controls'
    fixture.style.cssText =
      'position:fixed;inset:0;z-index:100;background:white;overflow:auto;padding:20px'
    fixture.innerHTML = `
      <button class="activity-cell" disabled style="width:30px;height:30px">Day</button>
      <div class="activity-year-control"><button disabled>Year</button></div>
      <div class="history-pagination"><button disabled>Previous</button></div>
      <div class="archive-pagination"><button disabled>Next</button></div>
      <fieldset class="game-mode-picker" disabled><label>Disabled mode</label></fieldset>
      <button class="button" disabled><span>Disabled action</span></button>
      <a href="#cursor-controls"><span>Link child</span></a>
      <label><input type="checkbox">Checkbox</label>
      <input type="range" aria-label="Range">
      <details><summary>Details</summary></details>
      <input type="text" aria-label="Text">
      <textarea aria-label="Notes"></textarea>
      <div contenteditable="true"><span>Editable text</span></div>
      <select aria-label="Select"><option>Option</option></select>
    `
    document.body.append(fixture)
  })
  const controls = page.locator('#cursor-controls')
  for (const selector of [
    '.activity-cell',
    '.activity-year-control button',
    '.history-pagination button',
    '.archive-pagination button',
    '.game-mode-picker label',
    '.button span',
    'a span',
    'input[type="checkbox"]',
    'input[type="range"]',
    'summary',
  ]) {
    const target = controls.locator(selector)
    await target.hover()
    await expect(page.locator('html')).toHaveClass(/custom-cursor-visible/)
    await expect(target).toHaveCSS('cursor', 'none')
  }
  for (const selector of ['input[type="text"]', 'textarea', '[contenteditable] span', 'select']) {
    const target = controls.locator(selector)
    await target.hover()
    await expect(page.locator('html')).toHaveClass(/custom-cursor-over-text/)
    await expect(target).toHaveCSS('cursor', selector === 'select' ? 'default' : 'text')
    await expect(page.locator('.custom-cursor').first()).toHaveCSS('opacity', '0')
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(controls.locator('.activity-cell')).toHaveCSS('cursor', 'default')
  await expect(controls.locator('.button')).toHaveCSS('cursor', 'not-allowed')
})
