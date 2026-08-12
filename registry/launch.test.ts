import { beforeEach, describe, expect, it } from 'vitest'

import {
  ALL_PERMISSIONS,
  appNode,
  createKernelAPI,
  dir,
  file,
  processStore,
  vfsStore,
  type VFSNode,
} from '@/kernel'
import { launchFor, performLaunch } from './launch'

/** Only the viewer claims anything, as in the real registry. */
const resolve = (mime: string) =>
  ['text/markdown', 'text/plain'].includes(mime) ? 'viewer' : null

const nameFor = (appId: string) => ({ terminal: 'Terminal', sysinfo: 'System Info' })[appId] ?? appId

const node = (path: string): VFSNode => vfsStore.getState().read(path)!

beforeEach(() => {
  vfsStore.setState({
    overlay: {},
    root: dir('/', {
      home: dir('home', {
        'about.md': file('about.md', 'x'),
        'mystery.bin': { type: 'file', name: 'mystery.bin', mime: 'application/octet-stream' },
      }),
      apps: dir('apps', { sysinfo: appNode('sysinfo', 'sysinfo') }),
    }),
  })
  processStore.getState().reset()
})

describe('launchFor', () => {
  it('resolves an application node to its app', () => {
    expect(launchFor('/apps/sysinfo', node('/apps/sysinfo'), resolve)).toEqual({
      kind: 'app',
      appId: 'sysinfo',
    })
  })

  it('hands a file to whatever declared its mime type, with the path', () => {
    expect(launchFor('/home/about.md', node('/home/about.md'), resolve)).toEqual({
      kind: 'file',
      appId: 'viewer',
      path: '/home/about.md',
    })
  })

  it('names the unclaimed type rather than guessing', () => {
    expect(launchFor('/home/mystery.bin', node('/home/mystery.bin'), resolve)).toEqual({
      kind: 'unhandled',
      mime: 'application/octet-stream',
    })
  })

  // The whole reason this module exists: three callers, three opinions about
  // what descending into a directory means.
  it('returns null for a directory, leaving the decision to the caller', () => {
    expect(launchFor('/home', node('/home'), resolve)).toBeNull()
  })
})

describe('performLaunch', () => {
  const kernel = () => createKernelAPI({ id: 'desktop', permissions: ALL_PERMISSIONS })

  it('spawns an app under its manifest name', () => {
    const pid = performLaunch(kernel(), { kind: 'app', appId: 'sysinfo' }, nameFor)

    expect(processStore.getState().processes[pid!]).toMatchObject({
      appId: 'sysinfo',
      title: 'System Info',
    })
  })

  it('focuses a running app instead of spawning a second copy', () => {
    const first = performLaunch(kernel(), { kind: 'app', appId: 'sysinfo' }, nameFor)
    const again = performLaunch(kernel(), { kind: 'app', appId: 'sysinfo' }, nameFor)

    expect(again).toBe(first)
    expect(Object.keys(processStore.getState().processes)).toHaveLength(1)
    expect(processStore.getState().focusedPid).toBe(first)
  })

  // Same rule the shell's `open` follows: the one last looked at, not the
  // lowest pid.
  it('focuses the topmost instance when several are open', () => {
    const first = processStore.getState().spawn('sysinfo')
    processStore.getState().spawn('sysinfo')
    processStore.getState().focus(first)

    expect(performLaunch(kernel(), { kind: 'app', appId: 'sysinfo' }, nameFor)).toBe(first)
  })

  it('opens a second window per file, unlike an app', () => {
    performLaunch(kernel(), { kind: 'file', appId: 'viewer', path: '/home/about.md' }, nameFor)
    performLaunch(kernel(), { kind: 'file', appId: 'viewer', path: '/home/other.md' }, nameFor)

    const viewers = Object.values(processStore.getState().processes)
    expect(viewers).toHaveLength(2)
    expect(viewers.map((p) => p.title)).toEqual(['about.md', 'other.md'])
    expect(viewers[0].args).toEqual(['/home/about.md'])
  })

  it('does nothing for an unhandled type', () => {
    expect(performLaunch(kernel(), { kind: 'unhandled', mime: 'x/y' }, nameFor)).toBeNull()
    expect(processStore.getState().processes).toEqual({})
  })
})
