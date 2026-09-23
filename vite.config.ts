import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env }
  return {
    server:
      mode === 'tunnel'
        ? {
            allowedHosts: ['.trycloudflare.com'],
            hmr: {
              clientPort: 443,
            },
          }
        : undefined,
    plugins: [
      react(),
      tailwindcss(),
      cloudflare(),
      {
        name: 'static-security-headers',
        generateBundle() {
          if (this.environment.name !== 'client') return
          if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
            throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY before building.')
          }
          const authOrigin = new URL(env.VITE_SUPABASE_URL).origin
          const realtimeUrl = new URL(authOrigin)
          realtimeUrl.protocol = realtimeUrl.protocol === 'https:' ? 'wss:' : 'ws:'
          const csp = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https:; connect-src 'self' ${authOrigin} ${realtimeUrl.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`
          this.emitFile({
            type: 'asset',
            fileName: '_headers',
            source: `/*\n  Content-Security-Policy: ${csp}\n  X-Frame-Options: DENY\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Permissions-Policy: camera=(), microphone=(self), geolocation=()\n`,
          })
        },
      },
    ],
  }
})
