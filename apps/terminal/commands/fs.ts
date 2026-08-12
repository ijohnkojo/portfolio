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
  readInput,
  readOrFail,
  statOrFail,
  takeFlag,
  takeNumberFlag,
  toLines,
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
  usage: 'cat [path...]',
  summary: 'print file contents',
  description:
    'Prints files exactly as they are stored, frontmatter included — cat shows what is in the file. Use stat to read the metadata on its own. Given no path it prints its standard input instead, which is what makes it useful at the end of a pipeline.',
  examples: ['cat /home/about.md', 'cat /papers/paper-one/index.mdx'],
  run: (ctx, args) => ({ output: readInput(ctx, 'cat', args) }),
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
    'Searches the text of every file beneath a directory and prints each matching line as path:line: text. -i ignores case. Files stored as external assets are skipped, since their bytes are not in the filesystem. Given no path it filters its standard input instead, printing the matching lines with no prefix — there is no file to name.',
  examples: ['grep kernel /home', 'grep -i placeholder /papers', 'ps | grep viewer'],
  run: (ctx, args) => {
    const { present: ignoreCase, rest } = takeFlag(args, '-i')
    const [pattern, where] = operands(rest)
    if (!pattern) fail('grep', 'missing pattern')

    // A pattern that isn't valid regex is treated as literal text rather than
    // crashing the shell — `grep [` should search for a bracket.
    let matcher: RegExp
    try {
      matcher = new RegExp(pattern, ignoreCase ? 'i' : '')
    } catch {
      const literal = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      matcher = new RegExp(literal, ignoreCase ? 'i' : '')
    }

    if (where === undefined && ctx.stdin) {
      return { output: ctx.stdin.filter((line) => matcher.test(line)) }
    }

    const root = resolvePath(ctx.cwd, where ?? '.')
    statOrFail(ctx, 'grep', root)

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

      const lines = toLines(content)
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

  if (paths.length === 0) {
    const lines = readInput(ctx, command, rest)
    return { output: fromEnd ? lines.slice(-count) : lines.slice(0, count) }
  }

  const output: string[] = []
  for (const arg of paths) {
    const path = resolvePath(ctx.cwd, arg)
    const lines = toLines(readOrFail(ctx, command, path))

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
  usage: 'head [-n count] [path...]',
  summary: 'print the first lines of a file',
  description:
    'Prints the first lines of each file, ten by default. Given no path it slices its standard input instead, which is how to look at the front of a long pipeline.',
  examples: ['head /home/about.md', 'grep -i kernel / | head -n 3'],
  run: (ctx, args) => lineSlice('head', ctx, args, false),
}

export const tail: Command = {
  name: 'tail',
  usage: 'tail [-n count] [path...]',
  summary: 'print the last lines of a file',
  description:
    'Prints the last lines of each file, ten by default. Given no path it slices its standard input instead.',
  examples: ['tail /home/.history', 'tail -n 3 /home/about.md'],
  run: (ctx, args) => lineSlice('tail', ctx, args, true),
}

export const wc: Command = {
  name: 'wc',
  usage: 'wc [path...]',
  summary: 'count lines, words, and characters',
  description:
    'Counts lines, words, and characters in each file. Several files also get a total row. Given no path it counts its standard input instead, and names nothing — there is no file to name.',
  examples: ['wc /home/about.md', 'grep -i physics / | wc'],
  run: (ctx, args) => {
    const paths = operands(args)
    if (paths.length === 0 && !ctx.stdin) fail('wc', 'missing operand')

    let totals = { lines: 0, words: 0, chars: 0 }
    const rows: Array<[number, number, number, string]> = []

    const count = (content: string, name: string) => {
      const lines = toLines(content).length
      const words = content.split(/\s+/).filter(Boolean).length
      const chars = content.length

      rows.push([lines, words, chars, name])
      totals = {
        lines: totals.lines + lines,
        words: totals.words + words,
        chars: totals.chars + chars,
      }
    }

    if (paths.length === 0) {
      count(ctx.stdin!.join('\n'), '')
    } else {
      for (const arg of paths) {
        const path = resolvePath(ctx.cwd, arg)
        count(readOrFail(ctx, 'wc', path), basename(path))
      }
    }

    if (rows.length > 1) rows.push([totals.lines, totals.words, totals.chars, 'total'])

    const width = Math.max(...rows.flatMap((r) => r.slice(0, 3).map((n) => String(n).length)))
    return {
      output: rows.map(([lines, words, chars, name]) =>
        `${String(lines).padStart(width)} ${String(words).padStart(width)} ${String(chars).padStart(width)}  ${name}`.trimEnd()
      ),
    }
  },
}

export const sort: Command = {
  name: 'sort',
  usage: 'sort [-r] [path...]',
  summary: 'sort lines',
  description:
    'Sorts lines alphabetically, reading its standard input when given no path. -r reverses the order. It exists for pipelines: sorting a file in place is not something this shell can do.',
  examples: ['sort /home/notes.md', 'ls /papers | sort -r'],
  run: (ctx, args) => {
    const { present: reverse, rest } = takeFlag(args, '-r')
    const lines = [...readInput(ctx, 'sort', rest)].sort((a, b) => a.localeCompare(b))
    return { output: reverse ? lines.reverse() : lines }
  },
}

export const uniq: Command = {
  name: 'uniq',
  usage: 'uniq [-c] [path...]',
  summary: 'collapse repeated adjacent lines',
  description:
    'Collapses a run of identical adjacent lines into one, reading its standard input when given no path. -c prefixes each with how many times it occurred. Adjacent is the real behaviour, and the reason sort comes first: sort | uniq is what removes duplicates.',
  examples: ['uniq /home/notes.md', 'sort /home/notes.md | uniq -c'],
  run: (ctx, args) => {
    const { present: withCounts, rest } = takeFlag(args, '-c')

    const runs: Array<[line: string, count: number]> = []
    for (const line of readInput(ctx, 'uniq', rest)) {
      const previous = runs[runs.length - 1]
      if (previous && previous[0] === line) previous[1]++
      else runs.push([line, 1])
    }

    if (!withCounts) return { output: runs.map(([line]) => line) }

    const width = Math.max(1, ...runs.map(([, count]) => String(count).length))
    return {
      output: runs.map(([line, count]) => `${String(count).padStart(width)} ${line}`),
    }
  },
}
