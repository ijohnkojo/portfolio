import { describe, expect, it } from 'vitest'

import { complete, type CompletionEntry } from './completion'

const TREE: Record<string, CompletionEntry[]> = {
  '/': [
    { name: 'home', isDir: true },
    { name: 'projects', isDir: true },
    { name: 'papers', isDir: true },
    { name: 'apps', isDir: true },
  ],
  '/projects': [
    { name: 'project-one', isDir: true },
    { name: 'project-two', isDir: true },
  ],
  '/home': [
    { name: 'about.md', isDir: false },
    { name: '.history', isDir: false },
  ],
  '/apps': [
    { name: 'about', isDir: false },
    { name: 'sysinfo', isDir: false },
    { name: 'terminal', isDir: false },
    { name: 'viewer', isDir: false },
  ],
  '/papers': [{ name: 'paper-one', isDir: true }],
}

const COMMANDS = ['cat', 'cd', 'clear', 'echo', 'help', 'kill', 'ls', 'open', 'ps', 'pwd', 'reset']

function run(buffer: string, over: { cwd?: string; cursor?: number } = {}) {
  return complete({
    buffer,
    cursor: over.cursor ?? buffer.length,
    cwd: over.cwd ?? '/',
    commands: COMMANDS,
    listDir: (path) => TREE[path] ?? [],
  })
}

describe('command completion', () => {
  it('completes a unique command and adds a space', () => {
    expect(run('op').buffer).toBe('open ')
  })

  it('extends to the common prefix when several match', () => {
    // cat, cd, clear → common prefix "c"; nothing to add, so it lists.
    const result = run('c')
    expect(result.buffer).toBe('c')
    expect(result.suggestions).toEqual(['cat', 'cd', 'clear'])
  })

  it('advances to the longest common prefix where there is one', () => {
    // ps, pwd → "p" extends to nothing; but "p" + s/w differ, so list.
    expect(run('p').suggestions).toEqual(['ps', 'pwd'])
  })

  it('lists everything for an empty line', () => {
    expect(run('').suggestions).toEqual([...COMMANDS].sort())
  })

  it('leaves an unmatched prefix alone', () => {
    expect(run('zzz')).toEqual({ buffer: 'zzz', cursor: 3, suggestions: [] })
  })
})

describe('path completion', () => {
  it('completes a directory and appends a slash so you can keep going', () => {
    expect(run('ls /pro').buffer).toBe('ls /projects/')
  })

  it('completes a file and appends a space', () => {
    expect(run('cat /home/ab').buffer).toBe('cat /home/about.md ')
  })

  it('advances to the shared prefix when a directory listing has one', () => {
    // project-one and project-two share "project-", so there is progress to make.
    expect(run('ls /projects/').buffer).toBe('ls /projects/project-')
  })

  it('lists when the candidates share nothing further', () => {
    expect(run('ls /').suggestions).toEqual(['apps/', 'home/', 'papers/', 'projects/'])
  })

  it('extends to the common prefix among siblings', () => {
    const result = run('ls /projects/project-')
    expect(result.suggestions).toEqual(['project-one/', 'project-two/'])
    expect(result.buffer).toBe('ls /projects/project-')
  })

  it('resolves relative to the cwd', () => {
    expect(run('cat ab', { cwd: '/home' }).buffer).toBe('cat about.md ')
  })

  it('walks up with ..', () => {
    expect(run('ls ../pap', { cwd: '/home' }).buffer).toBe('ls ../papers/')
  })

  it('completes app nodes without a trailing slash', () => {
    expect(run('open /apps/sys').buffer).toBe('open /apps/sysinfo ')
  })

  // Dotfiles stay out of the way until you ask for one, as in a real shell.
  it('hides dotfiles, so /home completes straight past .history', () => {
    expect(run('cat /home/').buffer).toBe('cat /home/about.md ')
  })

  it('offers them once the prefix starts with a dot', () => {
    expect(run('cat /home/.').buffer).toBe('cat /home/.history ')
  })

  it('returns nothing for a directory that does not exist', () => {
    expect(run('ls /nope/th')).toMatchObject({ buffer: 'ls /nope/th', suggestions: [] })
  })
})

describe('cursor handling', () => {
  it('splices mid-line instead of truncating the rest', () => {
    const buffer = 'cat /home/ab | something'
    const result = complete({
      buffer,
      cursor: 12, // just after "ab"
      cwd: '/',
      commands: COMMANDS,
      listDir: (path) => TREE[path] ?? [],
    })

    expect(result.buffer).toBe('cat /home/about.md  | something')
    expect(result.cursor).toBe(19)
  })

  it('completes the token the cursor is in, not the last one on the line', () => {
    const buffer = 'cd /pro /papers'
    const result = complete({
      buffer,
      cursor: 7,
      cwd: '/',
      commands: COMMANDS,
      listDir: (path) => TREE[path] ?? [],
    })

    expect(result.buffer).toBe('cd /projects/ /papers')
  })

  it('treats a trailing space as the start of a new token', () => {
    expect(run('ls ').suggestions).toEqual(['apps/', 'home/', 'papers/', 'projects/'])
  })
})
