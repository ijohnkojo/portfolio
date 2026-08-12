import { beforeEach, describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  appNode,
  createKernelAPI,
  dir,
  file,
  processStore,
  vfsStore,
} from '@/kernel'
import { runCommand } from '../shell'
import { commands } from './index'
import type { ShellContext } from './types'

/**
 * A richer fixture than the dispatch tests use: nested content, real frontmatter
 * metadata, a dotfile, and an asset-backed node — everything the search
 * commands have to cope with.
 */
function seed(): ShellContext {
  vfsStore.setState({
    overlay: {},
    root: dir('/', {
      home: dir('home', {
        'about.md': file('about.md', 'mechanism, not policy\nsecond line here'),
        '.history': file('.history', 'ls\ncd /papers\ngrep kernel'),
      }),
      papers: dir('papers', {
        'paper-one': dir('paper-one', {
          'index.mdx': {
            ...file('index.mdx', '# Paper One\nabout the kernel\nand detectors'),
            meta: {
              title: 'Paper One',
              date: '2026-08-01',
              tags: ['physics', 'placeholder'],
              draft: false,
            },
          },
          'figure.txt': {
            type: 'file' as const,
            name: 'figure.txt',
            mime: 'text/plain',
            src: '/content/papers/paper-one/figure.txt',
          },
        }),
        'paper-two': dir('paper-two', {
          'index.mdx': {
            ...file('index.mdx', '# Paper Two\nKERNEL in caps'),
            meta: { title: 'Paper Two', date: '2026-07-01', tags: ['physics'], draft: true },
          },
        }),
      }),
      apps: dir('apps', { viewer: appNode('viewer', 'viewer') }),
    }),
  })

  processStore.getState().reset()
  const pid = processStore.getState().spawn('terminal', { title: 'Terminal' })

  return {
    kernel: createKernelAPI({ id: 'terminal', permissions: ALL_PERMISSIONS }),
    cwd: '/',
    pid,
  }
}

let ctx: ShellContext
beforeEach(() => {
  ctx = seed()
})

const run = (line: string, over?: Partial<ShellContext>) =>
  runCommand(line, { ...ctx, ...over })

describe('grep', () => {
  it('finds matches across nested files, prefixed with path and line', () => {
    const out = run('grep kernel').output
    expect(out).toContain('/papers/paper-one/index.mdx:2: about the kernel')
  })

  it('is case-sensitive by default and case-insensitive with -i', () => {
    expect(run('grep KERNEL').output).toHaveLength(1)
    expect(run('grep -i kernel').output.length).toBeGreaterThan(1)
  })

  it('searches only beneath the given path', () => {
    const scoped = run('grep kernel /home').output
    expect(scoped.every((line) => line.startsWith('/home/'))).toBe(true)
    expect(run('grep kernel').output.some((l) => l.startsWith('/papers/'))).toBe(true)
    expect(run('grep policy /home').output[0]).toContain('/home/about.md:1:')
  })

  // Unlike `ls`, grep does look inside dotfiles — which is what makes history
  // searchable with `grep <term> /home/.history`.
  it('searches hidden files', () => {
    expect(run('grep kernel /home').output[0]).toContain('/home/.history')
  })

  it('reports nothing rather than failing when there are no matches', () => {
    expect(run('grep zzzz').output).toEqual([])
  })

  it('needs a pattern', () => {
    expect(run('grep').output[0]).toBe('grep: missing pattern')
  })

  // An unbalanced bracket should search for a bracket, not crash the shell.
  it('treats an invalid regex as literal text', () => {
    expect(() => run('grep [')).not.toThrow()
    expect(run('grep [').output).toEqual([])
  })

  it('skips asset-backed files, whose bytes are not in the filesystem', () => {
    const out = run('grep -i . /papers').output.join('\n')
    expect(out).not.toContain('figure.txt')
  })

  it('searches a single file when pointed at one', () => {
    expect(run('grep line /home/about.md').output).toHaveLength(1)
  })

  it('truncates rather than flooding the screen', () => {
    ctx.kernel.fs.write('/home/big.md', Array.from({ length: 300 }, () => 'match').join('\n'))
    const out = run('grep match /home').output

    expect(out.length).toBeLessThanOrEqual(201)
    expect(out[out.length - 1]).toContain('stopped at 200 matches')
  })
})

describe('find', () => {
  it('matches names anywhere, case-insensitively', () => {
    expect(run('find PAPER-ONE').output).toContain('/papers/paper-one/')
  })

  it('marks directories with a trailing slash', () => {
    const out = run('find paper').output
    expect(out).toContain('/papers/paper-one/')
    expect(out).toContain('/papers/paper-two/')
  })

  it('searches from a given path', () => {
    expect(run('find index /papers/paper-two').output).toEqual([
      '/papers/paper-two/index.mdx',
    ])
  })

  it('lists everything when given no pattern', () => {
    expect(run('find').output.length).toBeGreaterThan(5)
  })

  it('finds dotfiles, unlike ls', () => {
    expect(run('find history').output).toContain('/home/.history')
  })

  it('returns nothing for no match', () => {
    expect(run('find zzzz').output).toEqual([])
  })
})

describe('stat', () => {
  it('surfaces the frontmatter a content node carries', () => {
    const out = run('stat /papers/paper-one/index.mdx').output.join('\n')

    expect(out).toContain('title')
    expect(out).toContain('Paper One')
    expect(out).toContain('physics, placeholder')
    expect(out).toContain('2026-08-01')
  })

  it('reports size for inline files and src for asset-backed ones', () => {
    expect(run('stat /home/about.md').output.join('\n')).toContain('bytes')

    const asset = run('stat /papers/paper-one/figure.txt').output.join('\n')
    expect(asset).toContain('/content/papers/paper-one/figure.txt')
    expect(asset).not.toContain('bytes')
  })

  it('describes directories and apps too', () => {
    expect(run('stat /papers').output.join('\n')).toMatch(/type\s+dir/)
    expect(run('stat /apps/viewer').output.join('\n')).toMatch(/app\s+viewer/)
  })

  it('separates several nodes with a blank line', () => {
    expect(run('stat /home /papers').output).toContain('')
  })

  it('errors on a missing path and with no operand', () => {
    expect(run('stat /nope').output[0]).toBe('stat: /nope: No such file or directory')
    expect(run('stat').output[0]).toBe('stat: missing operand')
  })
})

describe('tags', () => {
  it('counts every tag in the filesystem', () => {
    const out = run('tags').output.join('\n')
    expect(out).toMatch(/physics\s+2/)
    expect(out).toMatch(/placeholder\s+1/)
  })

  it('lists the entries carrying one tag', () => {
    expect(run('tags placeholder').output).toEqual(['/papers/paper-one/index.mdx'])
  })

  it('is case-insensitive', () => {
    expect(run('tags PHYSICS').output).toHaveLength(2)
  })

  it('says so for an unknown tag', () => {
    expect(run('tags nope').output[0]).toContain('no entries carry this tag')
  })
})

describe('tree', () => {
  it('renders nested structure', () => {
    const out = run('tree /papers').output.join('\n')
    expect(out).toContain('paper-one/')
    expect(out).toContain('index.mdx')
    expect(out).toContain('├─')
  })

  it('closes the last child of each level with └, not ├', () => {
    const lines = run('tree /papers').output
    // paper-two is the last entry under /papers.
    expect(lines.find((l) => l.includes('paper-two/'))).toContain('└─')
    expect(lines.find((l) => l.includes('paper-one/'))).toContain('├─')
  })

  it('stops drawing the spine down a branch that has finished', () => {
    const lines = run('tree /papers').output
    // paper-two is last, so its child is indented with spaces, not │.
    const child = lines[lines.indexOf(lines.find((l) => l.includes('paper-two/'))!) + 1]
    expect(child).toMatch(/^ {3}└─/)
  })

  it('summarises what it found', () => {
    expect(run('tree /papers').output.at(-1)).toMatch(/\d+ directories, \d+ files/)
  })

  it('limits depth with -L', () => {
    const shallow = run('tree -L 1 /papers').output.join('\n')
    expect(shallow).toContain('paper-one/')
    expect(shallow).not.toContain('index.mdx')
  })

  it('hides dotfiles unless -a', () => {
    expect(run('tree /home').output.join('\n')).not.toContain('.history')
    expect(run('tree -a /home').output.join('\n')).toContain('.history')
  })
})

describe('head / tail', () => {
  beforeEach(() => {
    ctx.kernel.fs.write('/home/long.md', Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n'))
  })

  it('default to ten lines', () => {
    expect(run('head /home/long.md').output).toHaveLength(10)
    expect(run('head /home/long.md').output[0]).toBe('line 1')
    expect(run('tail /home/long.md').output[9]).toBe('line 30')
  })

  it('respect -n', () => {
    expect(run('head -n 3 /home/long.md').output).toEqual(['line 1', 'line 2', 'line 3'])
    expect(run('tail -n 2 /home/long.md').output).toEqual(['line 29', 'line 30'])
  })

  it('return the whole file when it is shorter than the count', () => {
    expect(run('head -n 99 /home/about.md').output).toHaveLength(2)
  })

  it('add headers only when given several files', () => {
    expect(run('head /home/about.md').output.join('\n')).not.toContain('==>')
    expect(run('head /home/about.md /home/long.md').output.join('\n')).toContain('==> about.md <==')
  })

  it('need an operand', () => {
    expect(run('head').output[0]).toBe('head: missing operand')
  })
})

describe('wc', () => {
  it('counts lines, words, and characters', () => {
    const out = run('wc /home/about.md').output[0]
    expect(out).toMatch(/^\s*2\s+6\s+38\s+about\.md$/)
  })

  it('adds a total row for several files', () => {
    const out = run('wc /home/about.md /papers/paper-one/index.mdx').output
    expect(out).toHaveLength(3)
    expect(out[2]).toContain('total')
  })

  it('refuses a directory', () => {
    expect(run('wc /home').output[0]).toBe('wc: /home: Is a directory')
  })
})

describe('history', () => {
  it('numbers the entries from the history file', () => {
    expect(run('history').output).toEqual(['1  ls', '2  cd /papers', '3  grep kernel'])
  })

  it('says so when there is none', () => {
    vfsStore.setState({ root: dir('/', { home: dir('home', {}) }), overlay: {} })
    expect(run('history').output).toEqual(['no history yet'])
  })
})

describe('exit', () => {
  it('closes this terminal', () => {
    run('exit')
    expect(processStore.getState().processes[ctx.pid]).toBeUndefined()
  })
})

describe('man', () => {
  it('prints usage, description, and examples', () => {
    const out = run('man grep').output.join('\n')
    expect(out).toContain('NAME')
    expect(out).toContain('SYNOPSIS')
    expect(out).toContain('grep [-i] <pattern> [path]')
    expect(out).toContain('EXAMPLES')
  })

  it('wraps the description rather than printing one long line', () => {
    for (const line of run('man grep').output) {
      expect(line.length).toBeLessThanOrEqual(76)
    }
  })

  it('errors for an unknown command and with no argument', () => {
    expect(run('man frobnicate').output[0]).toBe('man: no manual entry for frobnicate')
    expect(run('man').output[0]).toContain('what manual page')
  })

  /**
   * The point of putting the text on the command: a new command cannot ship
   * without documentation, because this fails.
   */
  it('has an entry for every command in the table', () => {
    for (const [name, command] of Object.entries(commands)) {
      expect(command.description, `${name} has no description`).toBeTruthy()
      expect(command.description.length, `${name}'s description is too thin`).toBeGreaterThan(20)
      expect(run(`man ${name}`).output[0]).toBe('NAME')
    }
  })

  it('is itself documented, and help points at it', () => {
    expect(run('man man').output.join('\n')).toContain('manual')
    expect(run('help').output.join('\n')).toContain('man <command>')
  })
})
