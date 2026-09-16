/**
 * System, session, and self-documenting commands.
 */
import { TILE_MODES, isTileMode } from '@/wm/tiling'
import { HISTORY_PATH, parseHistory } from '../history'
import { fail, operands, readOrFail, toLines, type Command } from './types'

export const echo: Command = {
  name: 'echo',
  usage: 'echo [args...]',
  summary: 'print arguments',
  description: 'Prints its arguments, separated by single spaces.',
  examples: ['echo hello world'],
  run: (_ctx, args) => ({ output: [args.join(' ')] }),
}

export const date: Command = {
  name: 'date',
  usage: 'date',
  summary: 'print the current date and time',
  description: 'Prints the current date and time, as the browser reports it.',
  run: () => ({
    output: [
      new Date().toLocaleString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
    ],
  }),
}

export const history: Command = {
  name: 'history',
  usage: 'history',
  summary: 'list previous commands',
  description: `Lists the commands this shell remembers, numbered oldest first. History is a real file at ${HISTORY_PATH}, so cat and grep reach it too, and it survives a reload.`,
  examples: ['history', 'grep cd /home/.history'],
  run: (ctx) => {
    const entries = parseHistory(ctx.kernel.fs.read(HISTORY_PATH))
    if (entries.length === 0) return { output: ['no history yet'] }

    const width = String(entries.length).length
    return {
      output: entries.map((line, i) => `${String(i + 1).padStart(width)}  ${line}`),
    }
  },
}

export const tile: Command = {
  name: 'tile',
  usage: 'tile [grid|columns|rows|cascade]',
  summary: 'arrange all windows',
  description:
    'Asks the window manager to arrange every open window. cascade returns them to an overlapping layout. Alt+Shift+T cycles the same layouts from the keyboard.',
  examples: ['tile', 'tile columns', 'tile cascade'],
  run: (ctx, args) => {
    const mode = args[0] ?? 'grid'
    if (!isTileMode(mode)) {
      fail('tile', `${mode}: unknown layout — try ${TILE_MODES.join(', ')}`)
    }

    // The window manager subscribes and decides. This command cannot move a
    // window itself, and does not know how big the desktop is.
    ctx.kernel.events.emit('wm:tile', { mode })
    return { output: [`tiling: ${mode}`] }
  },
}

export const clear: Command = {
  name: 'clear',
  usage: 'clear',
  summary: 'clear the screen',
  description: 'Clears the terminal. Ctrl+L does the same without losing the line you are typing.',
  run: () => ({ clear: true }),
}

/**
 * The bio lives at a path rather than in this file, so the shell, `cat`, `grep`
 * and the web route at /about are all reading the same bytes — D-010's rule
 * (one read on disk, two surfaces) applied to a single file instead of a
 * collection.
 *
 * `whoami` earns a command of its own where `now` does not: typing it into a
 * terminal is a reflex, so it is the one piece of prose here a visitor will
 * find without being told. `cat /home/now.md` is the discoverable form of the
 * other, and a second command would be a synonym for it.
 */
export const WHOAMI_PATH = '/home/whoami.md'
export const NOW_PATH = '/home/now.md'

export const whoami: Command = {
  name: 'whoami',
  usage: 'whoami',
  summary: 'print the bio',
  description: `Prints ${WHOAMI_PATH}. It is a real file, so cat, grep, wc and open reach it too, and the same text is served at /about on the web. See also ${NOW_PATH}, which is shorter and changes more often.`,
  examples: ['whoami', `cat ${NOW_PATH}`],
  run: (ctx) => ({ output: toLines(readOrFail(ctx, 'whoami', WHOAMI_PATH)) }),
}

export const reset: Command = {
  name: 'reset',
  usage: 'reset',
  summary: 'discard the saved session and reload',
  description:
    'Forgets the saved session — open windows and anything written to the filesystem, including history — and reloads into a fresh boot. The way out of a session you no longer want.',
  run: () => ({ output: ['clearing saved session…'], reset: true }),
}

/** Built here rather than in `index.ts` so both can see the assembled table. */
export function createDocCommands(table: () => Record<string, Command>) {
  const help: Command = {
    name: 'help',
    usage: 'help',
    summary: 'list available commands',
    description: 'Lists every command with a one-line summary. Use man for the long form.',
    examples: ['help', 'man grep'],
    run: () => {
      const entries = Object.values(table()).sort((a, b) => a.name.localeCompare(b.name))
      const width = Math.max(...entries.map((c) => c.usage.length))

      return {
        output: [
          'Commands:',
          ...entries.map((c) => `  ${c.usage.padEnd(width)}  ${c.summary}`),
          '',
          "'man <command>' for detail. Pipe with |, redirect with > or >>.",
        ],
      }
    },
  }

  const man: Command = {
    name: 'man',
    usage: 'man <command>',
    summary: 'show the manual for a command',
    description:
      'Prints the usage, description, and examples for a command. The text lives on the command itself, so it cannot drift out of step with what the command does.',
    examples: ['man grep', 'man tile'],
    run: (_ctx, args) => {
      const name = operands(args)[0]
      if (!name) fail('man', 'what manual page do you want?')

      const command = table()[name]
      if (!command) fail('man', `no manual entry for ${name}`)

      const output = [
        `NAME`,
        `    ${command.name} — ${command.summary}`,
        '',
        `SYNOPSIS`,
        `    ${command.usage}`,
        '',
        `DESCRIPTION`,
        ...wrap(command.description, 68).map((line) => `    ${line}`),
      ]

      if (command.examples?.length) {
        output.push('', 'EXAMPLES', ...command.examples.map((e) => `    ${e}`))
      }
      return { output }
    },
  }

  return { help, man }
}

/** Wrap prose to a width, so a manual page reads as a page. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of text.split(/\s+/)) {
    if (current === '') current = word
    else if (current.length + 1 + word.length <= width) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current !== '') lines.push(current)
  return lines
}
