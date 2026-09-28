import { describe, expect, it } from 'vitest'

import { findHandlerFor } from './handlers'
import { listApps } from './index'

/**
 * The matching *rule* is tested against a fixture, so the cases stay legible
 * and do not shift when an app is added.
 *
 * The real manifests are checked separately at the bottom of this file — the
 * registry turns out to import cleanly in bare node, because `next/dynamic`'s
 * inner `import()` calls are lazy and never run here. That is what lets the
 * no-duplicate-claims guard cover the actual registry rather than a copy of it.
 */
const fixture = [
  { id: 'viewer', handles: ['text/markdown', 'text/plain', 'application/pdf', 'image/*'] },
  { id: 'terminal' },
]

const find = (mime: string) => findHandlerFor(mime, fixture)

describe('findHandlerFor', () => {
  it('matches an exact declaration', () => {
    expect(find('text/markdown')).toBe('viewer')
    expect(find('application/pdf')).toBe('viewer')
  })

  it('matches a type/* wildcard', () => {
    expect(find('image/png')).toBe('viewer')
    expect(find('image/svg+xml')).toBe('viewer')
  })

  it('returns null when nothing handles the type', () => {
    expect(find('application/zip')).toBeNull()
    expect(find('video/mp4')).toBeNull()
  })

  it('ignores apps that declare no handlers', () => {
    expect(findHandlerFor('text/markdown', [{ id: 'terminal' }])).toBeNull()
  })

  // An app should be able to claim one specific type without having to
  // out-rank a general handler registered before it.
  it('prefers an exact match over a wildcard, whatever the order', () => {
    const withSpecific = [
      { id: 'gallery', handles: ['image/*'] },
      { id: 'png-tool', handles: ['image/png'] },
    ]
    expect(findHandlerFor('image/png', withSpecific)).toBe('png-tool')
    expect(findHandlerFor('image/png', [...withSpecific].reverse())).toBe('png-tool')
    expect(findHandlerFor('image/gif', withSpecific)).toBe('gallery')
  })

  it('does not treat a wildcard prefix as a substring match', () => {
    const apps = [{ id: 'gallery', handles: ['image/*'] }]
    expect(findHandlerFor('notanimage/png', apps)).toBeNull()
  })
})

/**
 * The rule that keeps `open` predictable, enforced rather than remembered.
 *
 * `findHandlerFor` settles two *exact* claims on the same mime by registration
 * order — silently, and differently depending on where someone added a line. So
 * no two manifests may make one. It is why the editor declares no `handles` at
 * all (D-033): open and edit are different intents, and the editor is reached
 * explicitly instead.
 */
describe('the registry itself', () => {
  it('never lets two apps claim the same exact mime type', () => {
    const claims = new Map<string, string>()

    for (const app of listApps()) {
      for (const pattern of app.handles ?? []) {
        if (pattern.endsWith('/*')) continue

        const existing = claims.get(pattern)
        expect(existing, `${app.id} and ${existing} both claim ${pattern}`).toBeUndefined()
        claims.set(pattern, app.id)
      }
    }
  })
})
