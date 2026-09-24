import { fileURLToPath } from 'node:url'

function fromProjectRoot(path: string) {
  return fileURLToPath(new URL(path, import.meta.url))
}

export const aliases = {
  '@app': fromProjectRoot('./src/client/app'),
  '@contracts': fromProjectRoot('./src/shared'),
  '@features': fromProjectRoot('./src/client/features'),
  '@pages': fromProjectRoot('./src/client/pages'),
  '@shared': fromProjectRoot('./src/client/shared'),
  '@widgets': fromProjectRoot('./src/client/widgets'),
}
