import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'

import { errorResponse } from './lib/responses'
import { requireAuthentication } from './middleware/auth'
import { meRoutes } from './routes/me'
import { partnershipRoutes } from './routes/partnerships'
import { wordGameRoutes } from './routes/word-game'
import type { AppEnvironment } from './types'

export const app = new Hono<AppEnvironment>()

app.use('/api/*', secureHeaders())
app.use('/api/*', async (context, next) => {
  context.header('Cache-Control', 'no-store')
  await next()
})

app.get('/api/health', (context) =>
  context.json({
    data: {
      service: 'meeting-place-api',
      status: 'ok',
    },
  }),
)

app.use('/api/*', requireAuthentication)
app.route('/api/me', meRoutes)
app.route('/api/partnerships', partnershipRoutes)
app.route('/api/games/explain-word', wordGameRoutes)

app.notFound((context) => {
  if (context.req.path.startsWith('/api/')) {
    return errorResponse(context, 404, 'not_found', 'API route not found.')
  }

  return context.text('Not found', 404)
})

app.onError((error, context) => {
  console.error('Unhandled API error', { name: error.name })
  return errorResponse(context, 500, 'internal_error', 'Something went wrong.')
})
