'use client'

/**
 * The xterm host. Deliberately thin: it wires keystrokes into the line editor,
 * hands committed lines to the shell, and prints what comes back.
 *
 * All the logic worth testing lives in `lineEditor.ts` and `shell.ts`, neither
 * of which knows this file exists. xterm is a *device* attached to the shell,
 * not the shell itself — the same mechanism/policy split the kernel uses one
 * level up.
 *
 * Every piece of mutable state lives inside the mount effect rather than in
 * refs: xterm owns its DOM, so this component renders exactly once.
 */
import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'

import '@xterm/xterm/css/xterm.css'

import { SCHEMA_VERSION } from '@/kernel'
import type { AppProps } from '@/registry'
import { createLineState, handleInput, type LineState } from './lineEditor'
import { runCommand } from './shell'

const THEME = {
  background: '#0a0a0a',
  foreground: '#e5e5e5',
  cursor: '#e5e5e5',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#404040',
  black: '#171717',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#facc15',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#e5e5e5',
  brightBlack: '#525252',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde047',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa',
}

const CYAN = '\x1b[36m'
const DIM = '\x1b[90m'
const RESET = '\x1b[0m'

/** Minimal prompt: the path, then `$`. No invented user@host. */
function promptFor(cwd: string): string {
  return `${CYAN}${cwd}${RESET} $ `
}

export default function TerminalApp({ pid, kernel }: AppProps) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily:
        'var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: THEME,
      scrollback: 2000,
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(host)

    let line: LineState = createLineState()
    let cwd = '/'

    /** Repaint the prompt line in place, then park the cursor. */
    const render = () => {
      term.write(`\r\x1b[2K${promptFor(cwd)}${line.buffer}`)
      const back = line.buffer.length - line.cursor
      if (back > 0) term.write(`\x1b[${back}D`)
    }

    const submit = (input: string) => {
      term.write('\r\n')

      const result = runCommand(input, { kernel, cwd, pid })
      cwd = result.cwd

      if (result.clear) {
        term.clear()
      } else {
        for (const output of result.output) term.writeln(output)
      }
      render()
    }

    const disposeData = term.onData((data) => {
      const [next, effects] = handleInput(line, data)
      line = next

      for (const effect of effects) {
        switch (effect.type) {
          case 'render':
            render()
            break
          case 'submit':
            submit(effect.line)
            break
          case 'cancel':
            term.write('^C\r\n')
            render()
            break
          case 'clear':
            term.clear()
            render()
            break
          case 'eof':
            // Ctrl+D on an empty line closes the terminal, as a shell would.
            term.write('exit\r\n')
            kernel.proc.kill(pid)
            break
        }
      }
    })

    // The terminal reacts to its own box rather than subscribing to the process
    // table, so the WM stays unaware it exists. rAF-debounced because a resize
    // gesture fires this continuously, and skipped at 0x0 — which is exactly
    // what a minimized window is now that they stay mounted (D-013).
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (host.clientWidth === 0 || host.clientHeight === 0) return
        try {
          fitAddon.fit()
        } catch {
          // fit() throws if the renderer isn't ready yet; the next resize retries.
        }
      })
    })
    observer.observe(host)

    term.writeln(`${DIM}personal-os — kernel schema v${SCHEMA_VERSION}${RESET}`)
    term.writeln(`${DIM}type 'help' for commands${RESET}`)
    term.writeln('')
    render()
    term.focus()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      disposeData.dispose()
      term.dispose()
    }
  }, [pid, kernel])

  return <div ref={hostRef} className="h-full w-full overflow-hidden p-2" />
}
