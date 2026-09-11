import type { SupabaseClient, User } from '@supabase/supabase-js'

import type { Database } from '../shared/database.types'

export type WorkerBindings = {
  OPENROUTER_API_KEY?: string
  OPENROUTER_SITE_URL?: string
  OPENROUTER_TEXT_MODEL?: string
  SUPABASE_ANON_KEY: string
  SUPABASE_URL: string
}

export type WorkerVariables = {
  supabase: SupabaseClient<Database>
  user: User
}

export type AppEnvironment = {
  Bindings: WorkerBindings
  Variables: WorkerVariables
}
