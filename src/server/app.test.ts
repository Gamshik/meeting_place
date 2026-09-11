import { describe, expect, it } from 'vitest'

import { app } from './app'

describe('API', () => {
  it('exposes a public health endpoint', async () => {
    const response = await app.request('/api/health')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      data: {
        service: 'meeting-place-api',
        status: 'ok',
      },
    })
  })

  it('protects authenticated endpoints', async () => {
    const response = await app.request('/api/me')

    expect(response.status).toBe(401)
  })
})
