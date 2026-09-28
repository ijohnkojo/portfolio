/**
 * Commands that change the filesystem.
 *
 * Everything else in the shell only reads. These are the first that write, and
 * they inherit the rule from `kernel/vfs.ts`: **you can only remove what you
 * added.** Published content — anything that came from `content/` at build time
 * — is read-only, and removing an *edit* to it reverts rather than deletes.
 */
import { basename, resolvePath } from '@/os/kernel'
import { fail, operands, readOrFail, statOrFail, takeFlag, type Command } from './types'

export const mkdir: Command = {
  name: 'mkdir',
  usage: 'mkdir [-p] <path...>',
  summary: 'create a directory',
  description:
    'Creates a directory. -p creates missing parents and does not complain if the directory already exists. Note that an empty directory does not survive a reload — directories are implied by the files inside them.',
  examples: ['mkdir /home/notes', 'mkdir -p /home/notes/drafts'],
  run: (ctx, args) => {
    const { present: parents, rest } = takeFlag(args, '-p')
    const paths = operands(rest)
    if (paths.length === 0) fail('mkdir', 'missing operand')

    for (const arg of paths) {
      const target = resolvePath(ctx.cwd, arg)
      const existing = ctx.kernel.fs.stat(target)

      if (existing) {
        if (parents && existing.type === 'dir') continue
        fail('mkdir', `${target}: File exists`)
      }
      if (!parents && !ctx.kernel.fs.stat(resolvePath(target, '..'))) {
        fail('mkdir', `${target}: No such file or directory`)
      }

      ctx.kernel.fs.mkdir(target, parents)
    }
    return { output: [] }
  },
}

export const touch: Command = {
  name: 'touch',
  usage: 'touch <path...>',
  summary: 'create an empty file',
  description:
    'Creates an empty file. An existing file is left exactly as it is — there is no modification time to bump.',
  examples: ['touch /home/notes/scratch.md'],
  run: (ctx, args) => {
    const paths = operands(args)
    if (paths.length === 0) fail('touch', 'missing operand')

    for (const arg of paths) {
      const target = resolvePath(ctx.cwd, arg)
      const existing = ctx.kernel.fs.stat(target)

      if (existing) {
        if (existing.type !== 'file') fail('touch', `${target}: Not a file`)
        continue
      }
      ctx.kernel.fs.write(target, '')
    }
    return { output: [] }
  },
}

export const rm: Command = {
  name: 'rm',
  usage: 'rm [-r] <path...>',
  summary: 'remove a file or directory',
  description:
    'Removes something you created. Published content is read-only and cannot be removed; if you have edited a published file, rm reverts it to the published version instead of deleting it. -r is required to remove a directory.',
  examples: ['rm /home/notes/scratch.md', 'rm -r /home/notes'],
  run: (ctx, args) => {
    const { present: recursive, rest } = takeFlag(args, '-r')
    const paths = operands(rest)
    if (paths.length === 0) fail('rm', 'missing operand')

    const output: string[] = []
    for (const arg of paths) {
      const target = resolvePath(ctx.cwd, arg)
      const node = statOrFail(ctx, 'rm', target)

      if (node.type === 'dir' && !recursive) {
        fail('rm', `${target}: Is a directory — use -r`)
      }

      try {
        ctx.kernel.fs.unlink(target)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Translate the kernel's errno-style message into something a reader
        // can act on, rather than surfacing EROFS raw.
        if (message.startsWith('EROFS')) {
          fail('rm', `${target}: read-only, part of the published content`)
        }
        fail('rm', `${target}: ${message}`)
      }

      // Reverting an edit is not a deletion, and saying so avoids confusion.
      if (ctx.kernel.fs.stat(target)) output.push(`${target}: reverted to the published version`)
    }
    return { output }
  },
}

/** `cp file dir` means `dir/basename(file)`, as it does anywhere else. */
function destinationFor(ctx: Parameters<Command['run']>[0], command: string, src: string, dst: string) {
  const node = ctx.kernel.fs.stat(dst)
  if (node?.type === 'dir') return resolvePath(dst, basename(src))
  if (node && node.type !== 'file') fail(command, `${dst}: Not a file`)
  return dst
}

export const cp: Command = {
  name: 'cp',
  usage: 'cp <source> <destination>',
  summary: 'copy a file',
  description:
    'Copies a file. If the destination is a directory, the copy keeps the source filename. Copying a published file is fine — the copy is yours, and only the copy can be removed.',
  examples: ['cp /home/about.md /home/about-backup.md', 'cp /home/readme.md /home/notes'],
  run: (ctx, args) => {
    const [from, to] = operands(args)
    if (!from || !to) fail('cp', 'missing operand')

    const source = resolvePath(ctx.cwd, from)
    const content = readOrFail(ctx, 'cp', source)
    const target = destinationFor(ctx, 'cp', source, resolvePath(ctx.cwd, to))

    ctx.kernel.fs.write(target, content)
    return { output: [] }
  },
}

export const mv: Command = {
  name: 'mv',
  usage: 'mv <source> <destination>',
  summary: 'move or rename a file',
  description:
    'Moves a file, which is a copy followed by a remove — so the same rule applies: a published file cannot be moved, because it cannot be removed. Copy it instead.',
  examples: ['mv /home/notes/a.md /home/notes/b.md'],
  run: (ctx, args) => {
    const [from, to] = operands(args)
    if (!from || !to) fail('mv', 'missing operand')

    const source = resolvePath(ctx.cwd, from)
    const content = readOrFail(ctx, 'mv', source)
    const target = destinationFor(ctx, 'mv', source, resolvePath(ctx.cwd, to))

    if (target === source) return { output: [] }

    // Write first: if the remove is going to be refused, better to have changed
    // nothing than to have copied and then failed.
    try {
      ctx.kernel.fs.unlink(source)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.startsWith('EROFS')) {
        fail('mv', `${source}: read-only, part of the published content — use cp`)
      }
      fail('mv', `${source}: ${message}`)
    }

    ctx.kernel.fs.write(target, content)
    return { output: [] }
  },
}
