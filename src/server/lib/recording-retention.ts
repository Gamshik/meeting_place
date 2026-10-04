import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types'
import type { WorkerBindings } from '../types'

export async function deleteExpiredRecordings(client: SupabaseClient<Database>) {
  let removed = 0
  // Bounded batches fit a scheduled Worker run; remaining objects are retried next run.
  for (let batch = 0; batch < 20; batch++) {
    const { data, error } = await client.rpc('list_expired_recordings')
    if (error || !data) throw new Error('Recording retention listing failed')
    if (data.length === 0) break
    const { error: deletionError } = await client.storage
      .from('word-game-recordings')
      .remove(data.map((row) => row.name))
    if (deletionError) throw new Error('Recording retention deletion failed')
    removed += data.length
  }
  // Reconcile even after a previous run deleted objects but failed before clearing references.
  const { error } = await client.rpc('clear_deleted_recording_paths')
  if (error) throw new Error('Recording retention reconciliation failed')
  return removed
}

export async function runRecordingRetention(env: WorkerBindings) {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Recording retention secret is missing')
  const client = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(30_000) }),
    },
  })
  const removed = await deleteExpiredRecordings(client)
  console.info('Recording retention completed', { removed })
}
