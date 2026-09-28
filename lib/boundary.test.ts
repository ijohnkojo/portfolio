/**
 * The site and the OS are separate projects in one repo (D-037). The
 * dependency runs one way: the OS reads the site's content, and the site never
 * imports the OS. Nothing breaks visibly when that is violated — the build
 * still passes — so it is asserted here rather than trusted to review.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const SKIP = new Set(['node_modules', '.next', '.git', 'public'])
const SOURCE = /\.(ts|tsx|mts|mjs)$/

function walk(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(full))
    else if (SOURCE.test(e.name)) out.push(full)
  }
  return out
}

/** Every module specifier in a file: static imports, re-exports, and `import()`. */
function specifiers(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8')
  const found: string[] = []
  const patterns = [/\bfrom\s+['"]([^'"]+)['"]/g, /\bimport\s*\(\s*['"]([^'"]+)['"]/g, /^\s*import\s+['"]([^'"]+)['"]/gm]
  for (const re of patterns) for (const m of text.matchAll(re)) found.push(m[1])
  return found
}

/** Resolve a specifier to a repo-relative path, or null for a package. */
function target(file: string, spec: string): string | null {
  if (spec.startsWith('@/')) return spec.slice(2)
  if (spec.startsWith('.')) return path.relative(ROOT, path.resolve(path.dirname(file), spec))
  return null
}

const rel = (file: string) => path.relative(ROOT, file)
const isOS = (p: string) => p === 'os' || p.startsWith('os/') || p.startsWith('app/os/')

const files = walk(ROOT)

describe('the OS boundary', () => {
  it('finds the files it is meant to police', () => {
    // A walk that silently found nothing would make both checks below vacuous.
    expect(files.some((f) => rel(f).startsWith('os/kernel/'))).toBe(true)
    expect(files.some((f) => rel(f).startsWith('app/(site)/'))).toBe(true)
  })

  it('nothing outside os/ and app/os/ imports the OS', () => {
    const offenders: string[] = []
    for (const file of files) {
      if (isOS(rel(file))) continue
      for (const spec of specifiers(file)) {
        const t = target(file, spec)
        if (t !== null && isOS(t)) offenders.push(`${rel(file)} imports ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })

  /**
   * The OS may read the site — but only through these, so the coupling stays
   * countable. `lib/content` is how it reads content/; `components/mdx` is the
   * shared prose styling the viewer renders with (D-018); the fixture loader is
   * for the OS's tests only (D-038). Adding to this list is a decision, not a
   * fix.
   */
  const OS_MAY_IMPORT = new Set([
    'lib/content',
    'lib/memo',
    'components/mdx',
    'lib/__fixtures__/fixtureContent',
  ])

  it('the OS reaches into the site only through an explicit allowlist', () => {
    const offenders: string[] = []
    for (const file of files) {
      if (!isOS(rel(file))) continue
      for (const spec of specifiers(file)) {
        const t = target(file, spec)
        if (t === null || isOS(t)) continue
        if (!OS_MAY_IMPORT.has(t)) offenders.push(`${rel(file)} imports ${spec}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
