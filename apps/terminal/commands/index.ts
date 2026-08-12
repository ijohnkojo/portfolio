/**
 * The command table.
 *
 * Every command is a plain function over the syscall boundary and a working
 * directory — no xterm, no React, no DOM. That is what makes the whole shell
 * testable in a bare node environment, and it is the same mechanism/policy
 * split the kernel uses one level up.
 *
 * Path handling reuses `resolvePath`/`resolve` from kernel/vfs.ts. Those were
 * written for exactly this; a second implementation here would drift.
 */
import * as fs from './fs'
import * as proc from './proc'
import * as system from './system'
import type { Command } from './types'

// `help` and `man` read the finished table, so they are built with a getter
// rather than being listed alongside the commands they describe.
const { help, man } = system.createDocCommands(() => commands)

const table: Command[] = [
  // filesystem
  fs.ls,
  fs.cd,
  fs.pwd,
  fs.cat,
  fs.stat,
  fs.tree,
  fs.head,
  fs.tail,
  fs.wc,
  // search
  fs.find,
  fs.grep,
  fs.tags,
  // processes
  proc.open,
  proc.ps,
  proc.kill,
  proc.exit,
  // system
  system.echo,
  system.date,
  system.history,
  system.tile,
  system.clear,
  system.reset,
  help,
  man,
]

export const commands: Record<string, Command> = Object.fromEntries(
  table.map((command) => [command.name, command])
)

export { CommandError } from './types'
export type { Command, CommandResult, ShellContext } from './types'
