import { describe, expect, it } from 'vitest'

import { findHandlerFor } from './handlers'

/**
 * The mime→app mapping is tested against a fixture rather than the real
 * registry, because the registry imports `next/dynamic` and these tests run in
 * bare node. The real manifests are exercised end-to-end by verify-viewer.
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
