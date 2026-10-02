import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ connect: vi.fn(), query: vi.fn(), end: vi.fn() }))
vi.mock('pg', () => ({
  Client: class {
    connect = mocks.connect
    query = mocks.query
    end = mocks.end
  },
}))
import { cacheGeneratedCards, WordCardStoreError } from './word-card-store'

beforeEach(() => {
  mocks.connect.mockReset().mockResolvedValue(undefined)
  mocks.query.mockReset().mockResolvedValue({ rows: [] })
  mocks.end.mockReset().mockResolvedValue(undefined)
})

const input = {
  requesterId: 'verified-user',
  gameId: 'game',
  topic: 'Travel',
  sourceModel: 'model',
  cards: [],
}

it('parameterizes the trusted identity and cards and closes the connection', async () => {
  await cacheGeneratedCards('postgresql://localhost/postgres', input)
  expect(mocks.query).toHaveBeenCalledWith(
    'select private.cache_word_game_cards($1, $2, $3, $4, $5::jsonb)',
    ['verified-user', 'game', 'Travel', 'model', '[]'],
  )
  expect(mocks.end).toHaveBeenCalledOnce()
})

it.each(['connect', 'query'] as const)(
  'sanitizes %s failures and closes the connection',
  async (operation) => {
    mocks[operation].mockRejectedValue(new Error('private-password and connection details'))
    await expect(cacheGeneratedCards('postgresql://localhost/postgres', input)).rejects.toThrow(
      WordCardStoreError,
    )
    expect(mocks.end).toHaveBeenCalledOnce()
  },
)
