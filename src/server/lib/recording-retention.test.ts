import { expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../shared/database.types'
import { deleteExpiredRecordings, runRecordingRetention } from './recording-retention'
function client() {
  const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
  const remove = vi.fn().mockResolvedValue({ error: null })
  const from = vi.fn(() => ({ remove }))
  return {
    rpc,
    remove,
    from,
    value: { rpc, storage: { from } } as unknown as SupabaseClient<Database>,
  }
}
it('deletes actual Storage objects in batches before reconciling references', async () => {
  const c = client()
  c.rpc.mockResolvedValueOnce({ data: [{ name: 'game/expired.wav' }] })
  expect(await deleteExpiredRecordings(c.value)).toBe(1)
  expect(c.from).toHaveBeenCalledWith('word-game-recordings')
  expect(c.remove).toHaveBeenCalledWith(['game/expired.wav'])
  expect(c.rpc).toHaveBeenLastCalledWith('clear_deleted_recording_paths')
  expect(c.remove.mock.invocationCallOrder[0]).toBeLessThan(c.rpc.mock.invocationCallOrder[2]!)
})
it('keeps database references when Storage deletion fails so the next run can retry', async () => {
  const c = client()
  c.rpc.mockResolvedValueOnce({ data: [{ name: 'game/expired.wav' }] })
  c.remove.mockResolvedValue({ error: { message: 'offline' } })
  await expect(deleteExpiredRecordings(c.value)).rejects.toThrow('deletion failed')
  expect(c.rpc).not.toHaveBeenCalledWith('clear_deleted_recording_paths')
})
it('reconciles already deleted objects even if no files are currently expired', async () => {
  const c = client()
  expect(await deleteExpiredRecordings(c.value)).toBe(0)
  expect(c.remove).not.toHaveBeenCalled()
  expect(c.rpc).toHaveBeenLastCalledWith('clear_deleted_recording_paths')
})
it('reports missing scheduled cleanup configuration', async () => {
  await expect(runRecordingRetention({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' })).rejects.toThrow(
    'secret is missing',
  )
})
