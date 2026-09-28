import { describe, expect, it } from 'vitest'

import { HISTORY_PATH, parseHistory, serializeHistory } from './history'
import { MAX_HISTORY } from './lineEditor'

describe('parseHistory', () => {
  it('reads one command per line, oldest first', () => {
    expect(parseHistory('ls\ncd /projects\n')).toEqual(['ls', 'cd /projects'])
  })

  it('treats a missing or empty file as no history', () => {
    expect(parseHistory(null)).toEqual([])
    expect(parseHistory('')).toEqual([])
    expect(parseHistory('\n\n')).toEqual([])
  })

  // A truncated or hand-edited file should mean fewer entries, never an error.
  it('drops blank and whitespace-only lines rather than throwing', () => {
    expect(parseHistory('ls\n\n   \ncd /\n')).toEqual(['ls', 'cd /'])
  })

  it('keeps only the newest MAX_HISTORY entries', () => {
    const many = Array.from({ length: MAX_HISTORY + 10 }, (_, i) => `cmd${i}`).join('\n')
    const parsed = parseHistory(many)

    expect(parsed).toHaveLength(MAX_HISTORY)
    expect(parsed[parsed.length - 1]).toBe(`cmd${MAX_HISTORY + 9}`)
  })
})

describe('serializeHistory', () => {
  it('round-trips through parse', () => {
    const entries = ['ls', 'cd /papers', 'cat index.mdx']
    expect(parseHistory(serializeHistory(entries))).toEqual(entries)
  })

  it('ends with a newline, so the file is well formed', () => {
    expect(serializeHistory(['ls'])).toBe('ls\n')
  })

  it('caps what it writes, not just what it reads', () => {
    const entries = Array.from({ length: MAX_HISTORY + 5 }, (_, i) => `cmd${i}`)
    expect(serializeHistory(entries).trim().split('\n')).toHaveLength(MAX_HISTORY)
  })
})

describe('HISTORY_PATH', () => {
  // Dotfile in /home so `ls` hides it by default but `cat` still reaches it.
  it('is a dotfile under /home', () => {
    expect(HISTORY_PATH).toBe('/home/.history')
  })
})
