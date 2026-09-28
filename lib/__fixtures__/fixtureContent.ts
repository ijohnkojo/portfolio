import path from 'node:path'

import { vi } from 'vitest'

/**
 * A second, independent copy of `lib/content.ts`, bound to the fixture tree in
 * `lib/__fixtures__/content/` — one published entry and one draft (D-038).
 *
 * `lib/content.ts` computes its directory from `process.cwd()` at import, on
 * purpose (it keeps Turbopack's file tracing scoped). So a fresh import with
 * `cwd` pointed here reads the fixtures, while the copy every other test
 * imported normally keeps reading `content/`.
 */
export async function loadFixtureContent(): Promise<typeof import('@/lib/content')> {
  const root = path.join(process.cwd(), 'lib', '__fixtures__')
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
  try {
    vi.resetModules()
    return await import('@/lib/content')
  } finally {
    cwd.mockRestore()
  }
}
