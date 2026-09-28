import { describe, expect, it } from 'vitest'

import { createLineState, handleInput, MAX_HISTORY, type LineState } from './lineEditor'

const KEY = {
  enter: '\r',
  backspace: '\x7f',
  del: '\x1b[3~',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
  ctrlA: '\x01',
  ctrlC: '\x03',
  ctrlD: '\x04',
  ctrlE: '\x05',
  ctrlL: '\x0c',
  ctrlU: '\x15',
}

/** Feed a sequence of chunks, returning the final state and all effects. */
function feed(state: LineState, ...chunks: string[]) {
  let current = state
  const effects = []
  for (const chunk of chunks) {
    const [next, produced] = handleInput(current, chunk)
    current = next
    effects.push(...produced)
  }
  return { state: current, effects }
}

const typed = (text: string) => feed(createLineState(), ...text.split('')).state

describe('typing', () => {
  it('appends printable characters and advances the cursor', () => {
    const state = typed('ls /projects')
    expect(state.buffer).toBe('ls /projects')
    expect(state.cursor).toBe(12)
  })

  it('accepts a multi-character chunk as a paste', () => {
    const { state } = feed(createLineState(), 'ls /projects')
    expect(state.buffer).toBe('ls /projects')
    expect(state.cursor).toBe(12)
  })

  it('inserts at the cursor rather than at the end', () => {
    const { state } = feed(typed('ls'), KEY.left, 'X')
    expect(state.buffer).toBe('lXs')
    expect(state.cursor).toBe(2)
  })

  it('swallows unknown escape sequences instead of printing stray bytes', () => {
    const { state, effects } = feed(typed('ls'), '\x1b[5~')
    expect(state.buffer).toBe('ls')
    expect(effects).toEqual([])
  })
})

describe('cursor movement', () => {
  it('clamps at both ends', () => {
    const atStart = feed(typed('ab'), KEY.left, KEY.left, KEY.left).state
    expect(atStart.cursor).toBe(0)

    const atEnd = feed(atStart, KEY.right, KEY.right, KEY.right).state
    expect(atEnd.cursor).toBe(2)
  })

  it('jumps to the ends with Ctrl+A / Ctrl+E', () => {
    expect(feed(typed('hello'), KEY.ctrlA).state.cursor).toBe(0)
    expect(feed(typed('hello'), KEY.ctrlA, KEY.ctrlE).state.cursor).toBe(5)
  })
})

describe('deletion', () => {
  it('backspaces the character before the cursor', () => {
    const { state } = feed(typed('lss'), KEY.backspace)
    expect(state.buffer).toBe('ls')
    expect(state.cursor).toBe(2)
  })

  it('backspaces mid-line', () => {
    const { state } = feed(typed('abc'), KEY.left, KEY.backspace)
    expect(state.buffer).toBe('ac')
    expect(state.cursor).toBe(1)
  })

  it('does nothing at column 0, and emits no repaint', () => {
    const { state, effects } = feed(createLineState(), KEY.backspace)
    expect(state.buffer).toBe('')
    expect(effects).toEqual([])
  })

  it('delete removes the character under the cursor, not before it', () => {
    const { state } = feed(typed('abc'), KEY.ctrlA, KEY.del)
    expect(state.buffer).toBe('bc')
    expect(state.cursor).toBe(0)
  })

  it('Ctrl+U clears the line', () => {
    const { state } = feed(typed('a long line'), KEY.ctrlU)
    expect(state.buffer).toBe('')
    expect(state.cursor).toBe(0)
  })
})

describe('submit', () => {
  it('emits the line and resets the buffer', () => {
    const { state, effects } = feed(typed('ls'), KEY.enter)
    expect(effects).toContainEqual({ type: 'submit', line: 'ls' })
    expect(state.buffer).toBe('')
    expect(state.cursor).toBe(0)
  })

  it('submits an empty line too, so Enter still moves the prompt down', () => {
    const { effects } = feed(createLineState(), KEY.enter)
    expect(effects).toContainEqual({ type: 'submit', line: '' })
  })

  it('splits a pasted multi-line chunk into one submit per line', () => {
    const { effects } = feed(createLineState(), 'ls\ncd /projects\n')
    const submitted = effects.filter((e) => e.type === 'submit').map((e) => e.line)
    expect(submitted).toEqual(['ls', 'cd /projects'])
  })
})

describe('control keys', () => {
  it('Ctrl+C abandons the line', () => {
    const { state, effects } = feed(typed('half typed'), KEY.ctrlC)
    expect(effects).toContainEqual({ type: 'cancel' })
    expect(state.buffer).toBe('')
  })

  it('Ctrl+L asks for a clear but keeps the line', () => {
    const { state, effects } = feed(typed('ls'), KEY.ctrlL)
    expect(effects).toContainEqual({ type: 'clear' })
    expect(state.buffer).toBe('ls')
  })

  it('Ctrl+D is EOF only on an empty line', () => {
    expect(feed(createLineState(), KEY.ctrlD).effects).toContainEqual({ type: 'eof' })
    expect(feed(typed('ls'), KEY.ctrlD).effects).toEqual([])
  })
})

describe('history', () => {
  const withHistory = () =>
    feed(createLineState(), 'one', KEY.enter, 'two', KEY.enter).state

  it('records committed lines, newest last', () => {
    expect(withHistory().history).toEqual(['one', 'two'])
  })

  it('does not record blanks or immediate duplicates', () => {
    const state = feed(
      createLineState(),
      KEY.enter,
      'ls',
      KEY.enter,
      'ls',
      KEY.enter
    ).state
    expect(state.history).toEqual(['ls'])
  })

  it('walks back through entries and stops at the oldest', () => {
    const up1 = feed(withHistory(), KEY.up).state
    expect(up1.buffer).toBe('two')

    const up2 = feed(up1, KEY.up).state
    expect(up2.buffer).toBe('one')

    const up3 = feed(up2, KEY.up).state
    expect(up3.buffer).toBe('one')
  })

  it('puts the cursor at the end of a recalled line', () => {
    expect(feed(withHistory(), KEY.up).state.cursor).toBe(3)
  })

  it('restores the in-progress line when walking back past the newest', () => {
    const drafted = feed(withHistory(), 'half').state
    const recalled = feed(drafted, KEY.up).state
    expect(recalled.buffer).toBe('two')

    const returned = feed(recalled, KEY.down).state
    expect(returned.buffer).toBe('half')
    expect(returned.cursor).toBe(4)
  })

  it('does nothing on down when not walking', () => {
    const state = feed(withHistory(), KEY.down).state
    expect(state.buffer).toBe('')
  })

  it('is a no-op on up when there is no history', () => {
    expect(feed(createLineState(), KEY.up).state.buffer).toBe('')
  })

  it('caps at MAX_HISTORY, dropping the oldest', () => {
    let state = createLineState()
    for (let i = 0; i < MAX_HISTORY + 10; i++) {
      state = feed(state, `cmd${i}`, KEY.enter).state
    }
    expect(state.history).toHaveLength(MAX_HISTORY)
    expect(state.history[0]).toBe(`cmd10`)
  })
})
