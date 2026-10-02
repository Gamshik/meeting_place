import { Client } from 'pg'

import type { Json } from '../../shared/database.types'

export class WordCardStoreError extends Error {
  constructor() {
    super('The shared card store is unavailable.')
    this.name = 'WordCardStoreError'
  }
}

export async function cacheGeneratedCards(
  connectionString: string,
  input: { requesterId: string; gameId: string; topic: string; sourceModel: string; cards: Json },
) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  })
  try {
    await client.connect()
    await client.query('select private.cache_word_game_cards($1, $2, $3, $4, $5::jsonb)', [
      input.requesterId,
      input.gameId,
      input.topic,
      input.sourceModel,
      JSON.stringify(input.cards),
    ])
  } catch {
    // Connection errors may contain the credential or provider connection details.
    throw new WordCardStoreError()
  } finally {
    await client.end().catch(() => undefined)
  }
}
