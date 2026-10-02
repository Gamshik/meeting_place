import { expect, it } from 'vitest'
import { databaseConnection } from './database-connection'

it('keeps local connection settings unchanged without a custom CA', () => {
  expect(databaseConnection('postgresql://localhost/postgres')).toMatchObject({
    connectionString: 'postgresql://localhost/postgres',
  })
  expect(databaseConnection('postgresql://localhost/postgres').ssl).toBeUndefined()
})

it('uses the supplied CA with verification enabled, even with URL SSL parameters', () => {
  const config = databaseConnection(
    'postgresql://user:password@example.test:6543/postgres?sslmode=verify-full&sslrootcert=unused&application_name=meeting-place',
    'first\\nsecond',
  )
  expect(config.ssl).toEqual({ ca: 'first\nsecond', rejectUnauthorized: true })
  const url = new URL(config.connectionString!)
  expect(url.searchParams.has('sslmode')).toBe(false)
  expect(url.searchParams.has('sslrootcert')).toBe(false)
  expect(url.searchParams.get('application_name')).toBe('meeting-place')
  expect(url.username).toBe('user')
  expect(url.password).toBe('password')
})
