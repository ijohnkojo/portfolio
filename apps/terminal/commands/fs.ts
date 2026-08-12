/**
 * Filesystem commands: walking, reading, and searching.
 *
 * The search commands exist because every content node carries its frontmatter
 * in `meta` — title, summary, date, tags — and until now nothing read it.
 */
import { basename, resolvePath, type VFSNode } from '@/kernel'
import {
  decorate,
  fail,
  operands,
  readOrFail,
  statOrFail,
  takeFlag,
  takeNumberFlag,
  type Command,
  type ShellContext,
} from './types'
import { walk } from './walk'

/** A flood of matches is less useful than an honest truncation. */
const MAX_MATCHES = 200

function target(ctx: ShellContext, args: string[], fallback = '.'): string {
  return resolvePath(ctx.cwd, operands(args)[0] ?? fallback)
}

export const ls: Command = {
  name: 'ls',
  usage: 'ls [-a] [path]',
  summary: 'list directory contents',
  description:
    'Lists the entries in a directory. Directories are shown with a trailing /, applications with a trailing *. Dot-prefixed entries are hidden unless -a is given.',
  examples: ['ls', 'ls /papers', 'ls -a /home'],
  run: (ctx, args) => {
    const { present: showAll, rest } = takeFlag(args, '-a')
    const path = target(ctx, rest)
    const node = statOrFail(ctx, 'ls', path)

    if (node.type !== 'dir') return { output: [decorate(node)] }

    const children = ctx.kernel.fs
      .list(path)
      .filter((child) => showAll || !child.name.startsWith('.'))

    return {
      output: [...children].sort((a, b) => a.name.localeCompare(b.name)).map(decorate),
    }
  },
}

export const cd: Command = {
  name: 'cd',
  usage: 'cd [path]',
  summary: 'change the working directory',
  description:
    'Changes the working directory. Relative paths resolve against the current one, and .. walks up. With no argument, returns to /.',
  examples: ['cd /projects', 'cd ..', 'cd'],
  run: (ctx, args) => {
    const path = resolvePath(ctx.cwd, args[0] ?? '/')
    const node = statOrFail(ctx, 'cd', path)
    if (node.type !== 'dir') fail('cd', `${path}: Not a directory`)
    return { cwd: path }
  },
}

export const pwd: Command = {
  name: 'pwd',
  usage: 'pwd',
  summary: 'print the working directory',
  description: 'Prints the absolute path of the current working directory.',
  run: (ctx) => ({ output: [ctx.cwd] }),
}

export const cat: Command = {
  name: 'cat',
  usage: 'cat <path...>',
  summary: 'print file contents',
  description:
    'Prints files exactly as they are stored, frontmatter included — cat shows what is in the file. Use stat to read the metadata on its own.',
  examples: ['cat /home/about.md', 'cat /papers/paper-one/index.mdx'],
  run: (ctx, args) => {
    if (args.length === 0) fail('cat', 'missing operand')

    const output: string[] = []
    for (const arg of args) {
      output.push(...readOrFail(ctx, 'cat', resolvePath(ctx.cwd, arg)).split('\n'))
    }
    return { output }
  },
}

export const stat: Command = {
  name: 'stat',
  usage: 'stat <path...>',
  summary: 'show metadata for a node',
  description:
    "Shows what the filesystem knows about a node: its type, mime type, size, and any metadata it carries. Content files carry their frontmatter here — title, summary, date, tags — which is how to read a writeup's details without opening it.",
  examples: ['stat /papers/paper-one/index.mdx', 'stat /apps/viewer'],
  run: (ctx, args) => {
    if (args.length === 0) fail('stat', 'missing operand')

    const output: string[] = []
    for (const arg of args) {
      const path = resolvePath(ctx.cwd, arg)
      const node = statOrFail(ctx, 'stat', path)

      const rows: Array<[string, string]> = [
        ['path', path],
        ['type', node.type],
      ]

      if (node.type === 'file') {
        rows.push(['mime', node.mime])
        if (node.content !== undefined) rows.push(['size', `${node.content.length} bytes`])
        if (node.src) rows.push(['src', node.src])
      }
      if (node.type === 'dir') {
        rows.push(['entries', String(ctx.kernel.fs.list(path).length)])
      }
      if (node.type === 'app') rows.push(['app', node.appId])

      for (const [key, value] of Object.entries(node.meta ?? {})) {
        rows.push([key, Array.isArray(value) ? value.join(', ') : String(value)])
      }

      const width = Math.max(...rows.map(([key]) => key.length))
      if (output.length > 0) output.push('')
      output.push(...rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`))
    }
    return { output }
  },
}

export const tree: Command = {
  name: 'tree',
  usage: 'tree [-a] [-L depth] [path]',
  summary: 'show a directory as a tree',
  description:
    'Prints a directory and everything under it, indented. -L limits how deep to go; -a includes dot-prefixed entries.',
  examples: ['tree', 'tree /papers', 'tree -L 1 /'],
  run: (ctx, args) => {
    const { present: showAll, rest: afterA } = takeFlag(args, '-a')
    const { value: maxDepth, rest } = takeNumberFlag(afterA, '-L', Infinity)

    const root = target(ctx, rest)
    const node = statOrFail(ctx, 'tree', root)
    if (node.type !== 'dir') return { output: [decorate(node)] }

    const entries = [...walk(ctx, root, { includeHidden: showAll, maxDepth: maxDepth - 1 })]
    const output = [root]

    for (const entry of entries) {
      // Stop drawing │ down a branch that has already ended, and close the last
      // child of each level with └ — otherwise every branch looks unfinished.
      const spine = entry.ancestorIsLast.map((last) => (last ? '   ' : '│  ')).join('')
      output.push(`${spine}${entry.isLast ? '└─ ' : '├─ '}${decorate(entry.node)}`)
    }

    const dirs = entries.filter((e) => e.node.type === 'dir').length
    output.push('', `${dirs} directories, ${entries.length - dirs} files`)
    return { output }
  },
}

export const find: Command = {
  name: 'find',
  usage: 'find [pattern] [path]',
  summary: 'find nodes by name',
  description:
    'Searches names beneath a directory, case-insensitively, matching anywhere in the name. With no pattern, lists everything.',
  examples: ['find paper', 'find index /projects', 'find'],
  run: (ctx, args) => {
    const [pattern = '', where] = operands(args)
    const root = resolvePath(ctx.cwd, where ?? '.')
    statOrFail(ctx, 'find', root)

    const needle = pattern.toLowerCase()
    const output = [...walk(ctx, root, { includeHidden: true })]
      .filter((entry) => entry.node.name.toLowerCase().includes(needle))
      .map((entry) => (entry.node.type === 'dir' ? `${entry.path}/` : entry.path))

    return { output }
  },
}

export const grep: Command = {
  name: 'grep',
  usage: 'grep [-i] <pattern> [path]',
  summary: 'search file contents',
  description:
    'Searches the text of every file beneath a directory and prints each matching line as path:line: text. -i ignores case. Files stored as external assets are skipped, since their bytes are not in the filesystem.',
  examples: ['grep kernel /home', 'grep -i placeholder /papers', 'grep syscall'],
  run: (ctx, args) => {
    const { present: ignoreCase, rest } = takeFlag(args, '-i')
    const [pattern, where] = operands(rest)
    if (!pattern) fail('grep', 'missing pattern')

    const root = resolvePath(ctx.cwd, where ?? '.')
    statOrFail(ctx, 'grep', root)

    // A pattern that isn't valid regex is treated as literal text rather than
    // crashing the shell — `grep [` should search for a bracket.
    let matcher: RegExp
    try {
      matcher = new RegExp(pattern, ignoreCase ? 'i' : '')
    } catch {
      const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      matcher = new RegExp(literal, ignoreCase ? 'i' : '')
    }

    const output: string[] = []
    let truncated = false

    const files: Array<{ path: string; node: VFSNode }> =
      ctx.kernel.fs.stat(root)?.type === 'dir'
        ? [...walk(ctx, root, { includeHidden: true })]
        : [{ path: root, node: ctx.kernel.fs.stat(root)! }]

    for (const { path, node } of files) {
      if (node.type !== 'file') continue

      // Asset-backed: the bytes live in /public, not here.
      const content = ctx.kernel.fs.read(path)
      if (content === null) continue

      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!matcher.test(lines[i])) continue
        if (output.length >= MAX_MATCHES) {
          truncated = true
          break
        }
        output.push(`${path}:${i + 1}: ${lines[i].trim()}`)
      }
      if (truncated) break
    }

    if (truncated) output.push(`… stopped at ${MAX_MATCHES} matches`)
    return { output }
  },
}

export const tags: Command = {
  name: 'tags',
  usage: 'tags [tag]',
  summary: 'list content tags',
  description:
    'With no argument, lists every tag found in the filesystem with a count. Given a tag, lists the entries carrying it. Tags come from the frontmatter of each writeup.',
  examples: ['tags', 'tags physics'],
  run: (ctx, args) => {
    const wanted = operands(args)[0]?.toLowerCase()

    const found = new Map<string, string[]>()
    for (const { path, node } of walk(ctx, '/', { includeHidden: true })) {
      const list = node.meta?.tags
      if (!Array.isArray(list)) continue

      for (const tag of list) {
        const key = String(tag).toLowerCase()
        found.set(key, [...(found.get(key) ?? []), path])
      }
    }

    if (wanted) {
      const paths = found.get(wanted)
      if (!paths) fail('tags', `${wanted}: no entries carry this tag`)
      return { output: paths }
    }

    if (found.size === 0) return { output: ['no tags found'] }

    const names = [...found.keys()].sort()
    const width = Math.max(...names.map((n) => n.length))
    return {
      output: names.map((name) => `${name.padEnd(width)}  ${found.get(name)!.length}`),
    }
  },
}

function lineSlice(command: Command['name'], ctx: ShellContext, args: string[], fromEnd: boolean) {
  const { value: count, rest } = takeNumberFlag(args, '-n', 10)
  const paths = operands(rest)
  if (paths.length === 0) fail(command, 'missing operand')

  const output: string[] = []
  for (const arg of paths) {
    const path = resolvePath(ctx.cwd, arg)
    const lines = readOrFail(ctx, command, path).split('\n')

    // Headers only when there is more than one file, as in the real thing.
    if (paths.length > 1) {
      if (output.length > 0) output.push('')
      output.push(`==> ${basename(path)} <==`)
    }
    output.push(...(fromEnd ? lines.slice(-count) : lines.slice(0, count)))
  }
  return { output }
}

export const head: Command = {
  name: 'head',
  usage: 'head [-n count] <path...>',
  summary: 'print the first lines of a file',
  description: 'Prints the first lines of each file, ten by default.',
  examples: ['head /home/about.md', 'head -n 3 /papers/paper-one/index.mdx'],
  run: (ctx, args) => lineSlice('head', ctx, args, false),
}

export const tail: Command = {
  name: 'tail',
  usage: 'tail [-n count] <path...>',
  summary: 'print the last lines of a file',
  description: 'Prints the last lines of each file, ten by default.',
  examples: ['tail /home/.history', 'tail -n 3 /home/about.md'],
  run: (ctx, args) => lineSlice('tail', ctx, args, true),
}

export const wc: Command = {
  name: 'wc',
  usage: 'wc <path...>',
  summary: 'count lines, words, and characters',
  description:
    'Counts lines, words, and characters in each file. Several files also get a total row.',
  examples: ['wc /home/about.md', 'wc /papers/paper-one/index.mdx /home/about.md'],
  run: (ctx, args) => {
    const paths = operands(args)
    if (paths.length === 0) fail('wc', 'missing operand')

    let totals = { lines: 0, words: 0, chars: 0 }
    const rows: Array<[number, number, number, string]> = []

    for (const arg of paths) {
      const path = resolvePath(ctx.cwd, arg)
      const content = readOrFail(ctx, 'wc', path)

      const lines = content.split('\n').length
      const words = content.split(/\s+/).filter(Boolean).length
      const chars = content.length

      rows.push([lines, words, chars, basename(path)])
      totals = {
        lines: totals.lines + lines,
        words: totals.words + words,
        chars: totals.chars + chars,
      }
    }

    if (rows.length > 1) rows.push([totals.lines, totals.words, totals.chars, 'total'])

    const width = Math.max(...rows.flatMap((r) => r.slice(0, 3).map((n) => String(n).length)))
    return {
      output: rows.map(
        ([lines, words, chars, name]) =>
          `${String(lines).padStart(width)} ${String(words).padStart(width)} ${String(chars).padStart(width)}  ${name}`
      ),
    }
  },
}
