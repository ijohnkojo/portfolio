/**
 * The client component imports `model.ts`, `layout.ts` and `interact.ts`, so
 * they must stay pure: no disk (which would break the client bundle), no
 * React or DOM (which would break these tests running in bare node), and no
 * reaching into the OS. AGENTS.md invariant 2. `load.ts` is the one impure
 * module, and nothing on the client may import it.
 *
 * Type-only imports are allowed — they are erased before anything runs.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const DIR = path.join(process.cwd(), 'lib', 'graph')
const PURE = ['model.ts', 'layout.ts', 'interact.ts']
const FORBIDDEN = [/^node:/, /^(fs|path)$/, /^react(-dom)?(\/|$)/, /^next(\/|$)/, /^@\/lib\/content$/, /^@\/os\//, /^@\/components\//, /\.\/load$/]

function runtimeImports(file: string): string[] {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8')
  return [...text.matchAll(/^import\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])
}

describe('lib/graph purity', () => {
  it.each(PURE)('%s imports nothing impure', (file) => {
    const bad = runtimeImports(file).filter((spec) => FORBIDDEN.some((re) => re.test(spec)))
    expect(bad).toEqual([])
  })

  it('catches what it is meant to catch', () => {
    // Guards the guard: the regex must see an ordinary import.
    expect(runtimeImports('interact.ts')).toContain('./layout')
  })
})
