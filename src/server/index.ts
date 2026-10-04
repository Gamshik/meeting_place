import { app } from './app'
import { runRecordingRetention } from './lib/recording-retention'
import type { WorkerBindings } from './types'

export default {
  fetch: app.fetch,
  async scheduled(_controller: unknown, env: WorkerBindings) {
    await runRecordingRetention(env)
  },
}
