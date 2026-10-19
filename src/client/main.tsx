import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/figtree'
import '@fontsource-variable/outfit'

import { App } from '@app/App'
import '@app/styles/index.css'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Root element was not found')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
