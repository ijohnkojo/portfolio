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

import { SCHEMA_VERSION, createLocalStorageAdapter } from '@/kernel'
import { findHandlerFor, type AppProps } from '@/registry'
import { HISTORY_PATH, parseHistory, serializeHistory } from './history'
import { createLineState, handleInput, type LineState } from './lineEditor'
import { cellAt, renderSequence } from './render'
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

/** `reset` discards the saved session. Reload is the simplest clean boot. */
async function onReset() {
  await createLocalStorageAdapter().clear()
  window.location.reload()
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

    // History is a file in the VFS, so it persists through the write overlay
    // like any other write (D-020) and `cat /home/.history` works.
    let line: LineState = createLineState(parseHistory(kernel.fs.read(HISTORY_PATH)))
    let cwd = '/'

    // Batched: writing on every committed line would churn the overlay and the
    // debounced session save sitting behind it.
    let historyTimer: ReturnType<typeof setTimeout> | undefined
    const flushHistory = () => {
      historyTimer = undefined
      try {
        kernel.fs.write(HISTORY_PATH, serializeHistory(line.history))
      } catch {
        // A read-only or missing /home is not worth killing the shell over.
      }
    }
    const scheduleHistoryFlush = () => {
      if (historyTimer) clearTimeout(historyTimer)
      historyTimer = setTimeout(flushHistory, 250)
    }
    // Rows between the line's first row and the cursor, as of the last paint.
    // The repaint needs it to walk back up over a wrapped line.
    let rowOffset = 0

    /** Repaint the prompt line in place, then park the cursor. */
    const render = () => {
      const { sequence, rowOffset: next } = renderSequence({
        promptText: promptFor(cwd),
        promptWidth: cwd.length + 3, // `<cwd> $ ` minus the ANSI, which is zero-width
        buffer: line.buffer,
        cursor: line.cursor,
        cols: term.cols,
        previousRowOffset: rowOffset,
      })
      rowOffset = next
      term.write(sequence)
    }

    /**
     * Move past the whole line and start a fresh row. The cursor may be sitting
     * on an earlier row of a wrapped line, so step down to its last row first —
     * otherwise output would overwrite the tail of what the user typed.
     */
    const endLine = (trailer = '') => {
      const endRow = cellAt(cwd.length + 3 + line.buffer.length, term.cols).row
      if (endRow > rowOffset) term.write(`\x1b[${endRow - rowOffset}B`)
      rowOffset = 0
      term.write(`\r${trailer}\r\n`)
    }

    const submit = (input: string) => {
      endLine()

      const result = runCommand(input, { kernel, cwd, pid, resolveHandler: findHandlerFor })
      cwd = result.cwd

      if (result.clear) {
        term.clear()
      } else {
        for (const output of result.output) term.writeln(output)
      }

      if (result.reset) {
        onReset()
        return
      }

      scheduleHistoryFlush()
      render()
    }

    // Two keys must escape xterm rather than reach the line editor.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true

      // Ctrl/Cmd+C with a selection means copy, not cancel.
      if ((event.ctrlKey || event.metaKey) && event.key === 'c' && term.hasSelection()) {
        return false
      }

      // Alt+Shift+Arrow is the window-snapping chord; let it bubble to the WM.
      if (event.altKey && event.shiftKey && event.key.startsWith('Arrow')) {
        return false
      }

      return true
    })

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
            endLine('^C')
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

    // The session autosave can only persist a history write that already
    // happened, so this has to flush before it does.
    const onPageHide = () => {
      if (historyTimer) {
        clearTimeout(historyTimer)
        flushHistory()
      }
    }
    window.addEventListener('pagehide', onPageHide)

    term.writeln(`${DIM}personal-os — kernel schema v${SCHEMA_VERSION}${RESET}`)
    term.writeln(`${DIM}type 'help' for commands${RESET}`)
    term.writeln('')
    render()
    term.focus()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('pagehide', onPageHide)
      disposeData.dispose()
      if (historyTimer) {
        clearTimeout(historyTimer)
        flushHistory()
      }
      term.dispose()
    }
  }, [pid, kernel])

  return <div ref={hostRef} className="h-full w-full overflow-hidden p-2" />
}
