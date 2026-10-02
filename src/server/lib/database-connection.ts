import type { ClientConfig } from 'pg'

export function databaseConnection(connectionString: string, caCertificate?: string): ClientConfig {
  const options: ClientConfig = {
    connectionString,
    connectionTimeoutMillis: 5_000,
    query_timeout: 10_000,
  }
  if (!caCertificate) return options
  const url = new URL(connectionString)
  // pg parses these URL options after ClientConfig.ssl and would overwrite our CA.
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) {
    url.searchParams.delete(key)
  }
  return {
    ...options,
    connectionString: url.toString(),
    ssl: { ca: caCertificate.replace(/\\n/g, '\n'), rejectUnauthorized: true },
  }
}
