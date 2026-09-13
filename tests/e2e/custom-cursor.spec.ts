import { expect, test } from '@playwright/test'

test('custom cursor stays subtle and responds to interactive controls', async ({ page }) => {
  await page.goto('/login')
  await page.mouse.move(80, 120)

  const cursor = page.locator('.custom-cursor')
  await expect(page.locator('html')).toHaveClass(/custom-cursor-visible/)
  await expect(cursor).toHaveCSS('width', '11px')
  const cursorBounds = await cursor.boundingBox()
  expect(cursorBounds?.x).toBeCloseTo(74.5, 0)
  expect(cursorBounds?.y).toBeCloseTo(114.5, 0)

  await page.getByRole('button', { name: 'Start practising with Google' }).hover()
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
