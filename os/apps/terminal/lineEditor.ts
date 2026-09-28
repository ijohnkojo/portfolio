/**
 * The line editor: a pure state machine over keystrokes.
 *
 * Separated from xterm so the fiddly parts — inserting mid-line, backspace at
 * column 0, arrow-key escape sequences, walking off either end of the history —
 * are tested directly instead of poked at through a rendered terminal.
 *
 * xterm hands us decoded input strings via `onData`, including CSI sequences
 * for the arrow keys. This module turns those into a buffer and a cursor, and
 * says what the caller should do about it.
 */

export interface LineState {
  /** The line being edited. */
  buffer: string
  /** Insertion point, 0..buffer.length. */
  cursor: number
  /** Newest last. Only committed lines land here. */
  history: string[]
  /**
   * Where we are while walking history. `history.length` means "not walking" —
   * the live buffer. Anything lower is an index into `history`.
   */
  historyIndex: number
  /** Stashed live buffer, so walking history and coming back doesn't lose it. */
  draft: string
}

export type LineEffect =
  /** Repaint the prompt line. */
  | { type: 'render' }
  /** The user pressed Enter; `line` is what to run (may be empty). */
  | { type: 'submit'; line: string }
  /** Ctrl+C — abandon the line. */
  | { type: 'cancel' }
  /** Ctrl+L — clear the screen, keep the line. */
  | { type: 'clear' }
  /** Ctrl+D on an empty line — EOF. */
  | { type: 'eof' }
  /**
   * Tab. The line editor cannot complete on its own — that needs the
   * filesystem, which it deliberately knows nothing about — so it asks the
   * host and applies the answer through `setLine` (D-022).
   */
  | { type: 'complete' }

export const MAX_HISTORY = 100

export function createLineState(history: string[] = []): LineState {
  return { buffer: '', cursor: 0, history, historyIndex: history.length, draft: '' }
}

const KEY = {
  enter: '\r',
  backspace: '\x7f',
  ctrlC: '\x03',
  ctrlD: '\x04',
  ctrlA: '\x01',
  ctrlE: '\x05',
  ctrlU: '\x15',
  ctrlL: '\x0c',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  home: '\x1b[H',
  end: '\x1b[F',
  delete: '\x1b[3~',
  tab: '\t',
} as const

function withHistoryEntry(state: LineState, line: string): string[] {
  const trimmed = line.trim()
  // Skip blanks and immediate duplicates — the two things nobody wants to
  // arrow back through.
  if (trimmed === '' || state.history[state.history.length - 1] === trimmed) {
    return state.history
  }
  return [...state.history, trimmed].slice(-MAX_HISTORY)
}

/**
 * Replace the line outright, as tab completion does. History is untouched: a
 * completion is not a committed command.
 */
export function setLine(state: LineState, buffer: string, cursor: number): LineState {
  return {
    ...state,
    buffer,
    cursor: Math.max(0, Math.min(cursor, buffer.length)),
    historyIndex: state.history.length,
    draft: '',
  }
}

/** Move through history. `delta` is -1 for older, +1 for newer. */
function walkHistory(state: LineState, delta: number): LineState {
  const next = state.historyIndex + delta

  // Already at the oldest entry, or no history at all: stay put.
  if (next < 0) return state

  // Walked back past the newest entry — restore the stashed live buffer.
  if (next >= state.history.length) {
    return {
      ...state,
      historyIndex: state.history.length,
      buffer: state.draft,
      cursor: state.draft.length,
    }
  }

  const buffer = state.history[next]
  return {
    ...state,
    // Stash the live buffer on the way out, not on every step.
    draft: state.historyIndex === state.history.length ? state.buffer : state.draft,
    historyIndex: next,
    buffer,
    cursor: buffer.length,
  }
}

/**
 * Apply one chunk of input. Returns the next state and what the host should do.
 *
 * A chunk can contain several characters — a paste, or a key that decodes to an
 * escape sequence — so this recurses over what it doesn't consume whole.
 */
export function handleInput(state: LineState, data: string): [LineState, LineEffect[]] {
  if (data === '') return [state, []]

  switch (data) {
    case KEY.enter: {
      const line = state.buffer
      return [
        {
          ...state,
          buffer: '',
          cursor: 0,
          draft: '',
          history: withHistoryEntry(state, line),
          historyIndex: withHistoryEntry(state, line).length,
        },
        [{ type: 'submit', line }],
      ]
    }

    case KEY.ctrlC:
      return [
        { ...state, buffer: '', cursor: 0, draft: '', historyIndex: state.history.length },
        [{ type: 'cancel' }],
      ]

    case KEY.ctrlD:
      if (state.buffer === '') return [state, [{ type: 'eof' }]]
      return [state, []]

    case KEY.ctrlL:
      return [state, [{ type: 'clear' }]]

    case KEY.tab:
      return [state, [{ type: 'complete' }]]

    case KEY.ctrlU:
      return [{ ...state, buffer: '', cursor: 0 }, [{ type: 'render' }]]

    case KEY.ctrlA:
    case KEY.home:
      return [{ ...state, cursor: 0 }, [{ type: 'render' }]]

    case KEY.ctrlE:
    case KEY.end:
      return [{ ...state, cursor: state.buffer.length }, [{ type: 'render' }]]

    case KEY.left:
      return [{ ...state, cursor: Math.max(0, state.cursor - 1) }, [{ type: 'render' }]]

    case KEY.right:
      return [
        { ...state, cursor: Math.min(state.buffer.length, state.cursor + 1) },
        [{ type: 'render' }],
      ]

    case KEY.up:
      return [walkHistory(state, -1), [{ type: 'render' }]]

    case KEY.down:
      return [walkHistory(state, +1), [{ type: 'render' }]]

    case KEY.backspace: {
      if (state.cursor === 0) return [state, []]
      return [
        {
          ...state,
          buffer: state.buffer.slice(0, state.cursor - 1) + state.buffer.slice(state.cursor),
          cursor: state.cursor - 1,
        },
        [{ type: 'render' }],
      ]
    }

    case KEY.delete: {
      if (state.cursor >= state.buffer.length) return [state, []]
      return [
        {
          ...state,
          buffer: state.buffer.slice(0, state.cursor) + state.buffer.slice(state.cursor + 1),
        },
        [{ type: 'render' }],
      ]
    }
  }

  // Unrecognised control or escape sequence: swallow it rather than printing
  // stray bytes into the buffer.
  if (data.startsWith('\x1b') || data.charCodeAt(0) < 0x20) return [state, []]

  // A paste can carry newlines; split so each line submits in turn.
  if (data.includes('\r') || data.includes('\n')) {
    const parts = data.split(/\r\n|\r|\n/)
    let current = state
    const effects: LineEffect[] = []
    parts.forEach((part, i) => {
      const [afterText, textEffects] = handleInput(current, part)
      current = afterText
      effects.push(...textEffects)
      if (i < parts.length - 1) {
        const [afterEnter, enterEffects] = handleInput(current, KEY.enter)
        current = afterEnter
        effects.push(...enterEffects)
      }
    })
    return [current, effects]
  }

  return [
    {
      ...state,
      buffer: state.buffer.slice(0, state.cursor) + data + state.buffer.slice(state.cursor),
      cursor: state.cursor + data.length,
    },
    [{ type: 'render' }],
  ]
}
