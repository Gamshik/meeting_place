import { readdirSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesRoot = resolve('src/client')
const baseStylesPath = resolve(stylesRoot, 'app/styles/base.css')

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? cssFiles(path) : extname(path) === '.css' ? [path] : []
  })
}

describe('site typography convention', () => {
  it('defines the shared desktop and mobile font floors', () => {
    const styles = readFileSync(baseStylesPath, 'utf8')

    expect(styles).toContain('--mp-font-size-body: 17px')
    expect(styles).toContain('--mp-font-size-supporting: 15px')
    expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?--mp-font-size-supporting: 16px/)
  })

  it('does not introduce literal readable text below the desktop floor', () => {
    const undersizedDeclarations = cssFiles(stylesRoot).flatMap((path) => {
      const styles = readFileSync(path, 'utf8')
      return [...styles.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px\s*;/g)]
        .filter((match) => Number(match[1]) > 0 && Number(match[1]) < 15)
        .map((match) => `${path}:${match[0]}`)
    })

    expect(undersizedDeclarations).toEqual([])
  })
})
