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
import { runCommand, tokenize } from './shell'
import type { ShellContext } from './commands'

const TERMINAL_PID = 1

function seed(): ShellContext {
  vfsStore.setState({
    overlay: {},
    root: dir('/', {
      home: dir('home', { 'about.md': file('about.md', 'line one\nline two') }),
      projects: dir('projects', {
        'project-one': dir('project-one', {
          'index.mdx': file('index.mdx', '# One'),
        }),
        'project-two': dir('project-two', {}),
      }),
      papers: dir('papers', {
        'paper-one': dir('paper-one', {
          'index.mdx': file('index.mdx', '# Paper'),
          'figure.txt': {
            type: 'file',
            name: 'figure.txt',
            mime: 'text/plain',
            src: '/content/papers/paper-one/figure.txt',
          },
        }),
      }),
      apps: dir('apps', {
        about: appNode('about', 'about'),
        sysinfo: appNode('sysinfo', 'sysinfo'),
      }),
    }),
  })

  processStore.getState().reset()
  const pid = processStore.getState().spawn('terminal', { title: 'Terminal' })
  expect(pid).toBe(TERMINAL_PID)

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

const run = (line: string, override?: Partial<ShellContext>) =>
  runCommand(line, { ...ctx, ...override })

describe('tokenize', () => {
  it('splits on whitespace and collapses runs', () => {
    expect(tokenize('  ls   /projects  ')).toEqual(['ls', '/projects'])
  })

  it('keeps quoted spans together', () => {
    expect(tokenize('cat "a file.md"')).toEqual(['cat', 'a file.md'])
    expect(tokenize("cat 'a file.md'")).toEqual(['cat', 'a file.md'])
  })

  it('treats an empty quoted string as a real argument', () => {
    expect(tokenize('echo ""')).toEqual(['echo', ''])
  })

  it('returns nothing for a blank line', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('dispatch', () => {
  it('does nothing for a blank line', () => {
    expect(run('')).toEqual({ output: [], cwd: '/', clear: false })
  })

  it('reports an unknown command without throwing', () => {
    expect(run('frobnicate').output[0]).toMatch(/frobnicate: command not found/)
  })
})

describe('ls', () => {
  it('marks directories, apps, and files distinctly', () => {
    expect(run('ls /apps').output).toEqual(['about*', 'sysinfo*'])
    expect(run('ls /').output).toEqual(['apps/', 'home/', 'papers/', 'projects/'])
    expect(run('ls /home').output).toEqual(['about.md'])
  })

  it('lists the cwd when given no argument', () => {
    expect(run('ls', { cwd: '/home' }).output).toEqual(['about.md'])
  })

  it('prints an empty directory as nothing', () => {
    expect(run('ls /projects/project-two').output).toEqual([])
  })

  it('names the file when pointed at one', () => {
    expect(run('ls /home/about.md').output).toEqual(['about.md'])
  })

  it('errors on a missing path', () => {
    expect(run('ls /nope').output[0]).toBe('ls: /nope: No such file or directory')
  })
})

describe('cd / pwd', () => {
  it('changes directory absolutely and relatively', () => {
    expect(run('cd /projects').cwd).toBe('/projects')
    expect(run('cd project-one', { cwd: '/projects' }).cwd).toBe('/projects/project-one')
  })

  it('walks up with .. and stops at the root', () => {
    expect(run('cd ..', { cwd: '/projects/project-one' }).cwd).toBe('/projects')
    expect(run('cd ../../..', { cwd: '/projects' }).cwd).toBe('/')
  })

  it('goes home on a bare cd', () => {
    expect(run('cd', { cwd: '/projects' }).cwd).toBe('/')
  })

  it('refuses to cd into a file, leaving cwd untouched', () => {
    const result = run('cd /home/about.md', { cwd: '/projects' })
    expect(result.output[0]).toBe('cd: /home/about.md: Not a directory')
    expect(result.cwd).toBe('/projects')
  })

  it('errors on a missing directory', () => {
    expect(run('cd /nope').output[0]).toBe('cd: /nope: No such file or directory')
  })

  it('pwd prints the cwd it was given', () => {
    expect(run('pwd', { cwd: '/papers' }).output).toEqual(['/papers'])
  })
})

describe('cat', () => {
  it('prints file contents one line per row', () => {
    expect(run('cat /home/about.md').output).toEqual(['line one', 'line two'])
  })

  it('resolves relative to the cwd and concatenates several files', () => {
    const out = run('cat about.md about.md', { cwd: '/home' }).output
    expect(out).toEqual(['line one', 'line two', 'line one', 'line two'])
  })

  it('errors without operands, on a directory, and on an app', () => {
    expect(run('cat').output[0]).toBe('cat: missing operand')
    expect(run('cat /home').output[0]).toBe('cat: /home: Is a directory')
    expect(run('cat /apps/about').output[0]).toBe('cat: /apps/about: Is an application')
  })

  it('explains an asset-backed node instead of printing nothing', () => {
    const out = run('cat /papers/paper-one/figure.txt').output[0]
    expect(out).toMatch(/binary or external file/)
    expect(out).toContain('/content/papers/paper-one/figure.txt')
  })

  it('errors on a missing file', () => {
    expect(run('cat /nope.md').output[0]).toBe('cat: /nope.md: No such file or directory')
  })
})

describe('open', () => {
  it('spawns the app behind an app node', () => {
    const out = run('open /apps/sysinfo').output[0]
    expect(out).toMatch(/sysinfo: started as pid 2/)
    expect(processStore.getState().processes[2].appId).toBe('sysinfo')
  })

  it('focuses an already-running app instead of spawning a second copy', () => {
    run('open /apps/sysinfo')
    const out = run('open /apps/sysinfo').output[0]

    expect(out).toMatch(/already running as pid 2/)
    expect(Object.keys(processStore.getState().processes)).toHaveLength(2)
    expect(processStore.getState().focusedPid).toBe(2)
  })

  it('hands a file to the app that declared its mime type', () => {
    const resolveHandler = (mime: string) => (mime === 'text/markdown' ? 'viewer' : null)
    const out = run('open /home/about.md', { resolveHandler }).output[0]

    expect(out).toBe('viewer: opened /home/about.md as pid 2')
    expect(processStore.getState().processes[2]).toMatchObject({
      appId: 'viewer',
      // The path arrives in args, and the title is the bare filename.
      args: ['/home/about.md'],
      title: 'about.md',
    })
  })

  it('opens a second copy for a second file, unlike an app node', () => {
    const resolveHandler = () => 'viewer'
    run('open /home/about.md', { resolveHandler })
    run('open /projects/project-one/index.mdx', { resolveHandler })

    const viewers = Object.values(processStore.getState().processes).filter(
      (p) => p.appId === 'viewer'
    )
    expect(viewers).toHaveLength(2)
    expect(viewers.map((v) => v.args[0])).toEqual([
      '/home/about.md',
      '/projects/project-one/index.mdx',
    ])
  })

  // Degrades rather than breaks when nothing claims the type.
  it('names the missing handler when no app declares the mime', () => {
    const out = run('open /home/about.md', { resolveHandler: () => null }).output[0]
    expect(out).toBe("open: no application registered for text/markdown — try 'cat'")
  })

  it('names the missing handler when no resolver is injected at all', () => {
    const out = run('open /home/about.md').output[0]
    expect(out).toBe("open: no application registered for text/markdown — try 'cat'")
  })

  it('errors on a directory and on no operand', () => {
    expect(run('open /home').output[0]).toBe('open: /home: Is a directory')
    expect(run('open').output[0]).toBe('open: missing operand')
  })
})

describe('ps / kill', () => {
  it('lists processes in a padded table and marks the calling terminal', () => {
    run('open /apps/sysinfo')
    const out = run('ps').output

    expect(out[0]).toMatch(/^PID\s+APP\s+STATE\s+TITLE$/)
    expect(out[1]).toMatch(/^1\s+terminal\s+normal\s+Terminal \(this terminal\)$/)
    expect(out[2]).toMatch(/^2\s+sysinfo\s+normal/)
  })

  it('kills a pid', () => {
    run('open /apps/sysinfo')
    expect(run('kill 2').output).toEqual(['killed 2'])
    expect(processStore.getState().processes[2]).toBeUndefined()
  })

  it('lets the terminal kill itself without announcing it to a dead screen', () => {
    expect(run('kill 1').output).toEqual([])
    expect(processStore.getState().processes[1]).toBeUndefined()
  })

  it('rejects a non-numeric or unknown pid', () => {
    expect(run('kill abc').output[0]).toBe('kill: abc: arguments must be process ids')
    expect(run('kill 99').output[0]).toBe('kill: (99): No such process')
    expect(run('kill').output[0]).toBe('kill: missing operand')
  })
})

describe('echo / clear / help', () => {
  it('echoes joined arguments', () => {
    expect(run('echo hello  world').output).toEqual(['hello world'])
    expect(run('echo "a b"').output).toEqual(['a b'])
  })

  it('clear asks the host to wipe the screen and prints nothing', () => {
    const result = run('clear')
    expect(result.clear).toBe(true)
    expect(result.output).toEqual([])
  })

  it('help is generated from the table, so it cannot drift', () => {
    const out = run('help').output.join('\n')
    for (const name of ['ls', 'cd', 'pwd', 'cat', 'open', 'ps', 'kill', 'echo', 'clear', 'help']) {
      expect(out).toContain(name)
    }
  })
})

describe('permissions', () => {
  it('surfaces a denied syscall as an error line rather than crashing the shell', () => {
    const restricted = {
      ...ctx,
      kernel: createKernelAPI({ id: 'terminal', permissions: ['fs.read'] }),
    }
    const result = runCommand('open /apps/sysinfo', restricted)

    expect(result.output[0]).toMatch(/internal error: EPERM/)
    expect(result.cwd).toBe('/')
  })
})
