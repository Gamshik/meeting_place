import { expect, test } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { GameCatalog } from '../../src/client/components/GameCatalog'

for (const width of [320, 1440]) {
  test(`catalog accommodates six future entries at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/login')
    const styles = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((elements) => elements.map((element) => (element as HTMLLinkElement).href))
    const items = Array.from({ length: 6 }, (_, index) => ({
      id: `fixture-${index}`,
      title: `Practice game ${index + 1}`,
      description: 'A different English activity.',
      path: `/games/fixture-${index}`,
      start: async () => undefined,
      accept: async () => undefined,
      decline: async () => undefined,
      cancel: async () => undefined,
      loadSessions: async () => [],
      loadHistory: async () => [],
    }))
    const markup = renderToStaticMarkup(
      createElement(GameCatalog, { items, onPlay: () => undefined }),
    )
    await page.setContent(
      `<html><head>${styles.map((href) => `<link rel="stylesheet" href="${href}">`).join('')}</head><body><main class="main-content">${markup}</main></body></html>`,
    )
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    if (width === 320) {
      await expect(page.getByRole('combobox', { name: 'Choose a game' })).toBeVisible()
      await expect(page.getByRole('combobox').locator('option')).toHaveCount(6)
    } else {
      await expect(page.getByRole('button', { name: 'Practice game 6' })).toBeVisible()
      await expect(page.getByRole('button')).toHaveCount(6)
    }
  })
}
