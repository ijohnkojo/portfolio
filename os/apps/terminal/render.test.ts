import { describe, expect, it } from 'vitest'

import { cellAt, renderSequence } from './render'

const PROMPT = '/ $ '
const base = {
  promptText: PROMPT,
  promptWidth: PROMPT.length, // 4
  previousRowOffset: 0,
  cols: 20,
}

const render = (over: Partial<typeof base> & { buffer: string; cursor: number }) =>
  renderSequence({ ...base, ...over })

describe('cellAt', () => {
  it('starts at the origin', () => {
    expect(cellAt(0, 20)).toEqual({ row: 0, col: 0 })
  })

  it('advances within a row', () => {
    expect(cellAt(5, 20)).toEqual({ row: 0, col: 5 })
  })

  /**
   * The case the old implementation got wrong. After exactly `cols` characters
   * the cursor is still on row 0 — terminals defer the wrap until the next
   * character arrives.
   */
  it('defers the wrap at an exact row boundary', () => {
    expect(cellAt(20, 20)).toEqual({ row: 0, col: 20 })
    expect(cellAt(21, 20)).toEqual({ row: 1, col: 1 })
    expect(cellAt(40, 20)).toEqual({ row: 1, col: 20 })
    expect(cellAt(41, 20)).toEqual({ row: 2, col: 1 })
  })

  it('survives a degenerate width', () => {
    expect(() => cellAt(5, 0)).not.toThrow()
  })
})

describe('renderSequence', () => {
  it('erases to the end of the display, not the end of the row', () => {
    const { sequence } = render({ buffer: 'ls', cursor: 2 })
    // 0J is the whole point: 2K would leave wrapped rows behind.
    expect(sequence).toContain('\x1b[0J')
    expect(sequence).not.toContain('\x1b[2K')
  })

  it('rewrites the prompt and the buffer', () => {
    const { sequence } = render({ buffer: 'ls', cursor: 2 })
    expect(sequence).toContain(`${PROMPT}ls`)
  })

  it('walks up to the first row before erasing', () => {
    const { sequence } = render({ buffer: '', cursor: 0, previousRowOffset: 3 })
    expect(sequence.indexOf('\x1b[3A')).toBeLessThan(sequence.indexOf('\x1b[0J'))
  })

  it('does not emit a cursor-up when already on the first row', () => {
    const { sequence } = render({ buffer: 'ls', cursor: 2, previousRowOffset: 0 })
    expect(sequence).not.toMatch(/\x1b\[\d+A\r/)
  })

  it('reports the row the cursor ended on, for the next repaint', () => {
    // prompt 4 + 30 chars = 34 → row 1 at cols 20
    expect(render({ buffer: 'x'.repeat(30), cursor: 30 }).rowOffset).toBe(1)
    expect(render({ buffer: 'x'.repeat(30), cursor: 0 }).rowOffset).toBe(0)
    expect(render({ buffer: 'ls', cursor: 2 }).rowOffset).toBe(0)
  })

  it('moves the cursor up when it sits on an earlier row than the line end', () => {
    // end at 4+50=54 → row 2; cursor at 4+0=4 → row 0. Two rows up.
    const { sequence } = render({ buffer: 'x'.repeat(50), cursor: 0 })
    expect(sequence).toContain('\x1b[2A')
    expect(sequence).toMatch(/\x1b\[5G$/) // column 4 (0-based) → 5 (1-based)
  })

  it('places the cursor with an absolute column, never a relative back-step', () => {
    const { sequence } = render({ buffer: 'hello', cursor: 2 })
    expect(sequence).toMatch(/\x1b\[7G$/) // 4 + 2 = 6 → 1-based 7
    expect(sequence).not.toContain('D') // no \x1b[nD, which cannot wrap rows
  })

  it('handles a cursor at the very end', () => {
    const { sequence, rowOffset } = render({ buffer: 'hello', cursor: 5 })
    expect(rowOffset).toBe(0)
    expect(sequence).toMatch(/\x1b\[10G$/) // 4 + 5 = 9 → 1-based 10
  })

  /** Exact multiples are where terminals disagree; clamp rather than overflow. */
  it('clamps the column at an exact row boundary instead of running past it', () => {
    const buffer = 'x'.repeat(16) // 4 + 16 = 20 = cols
    const { sequence, rowOffset } = render({ buffer, cursor: 16 })
    expect(rowOffset).toBe(0)
    expect(sequence).toMatch(/\x1b\[20G$/) // clamped to the last column
  })

  it('keeps the cursor and the end on the same row for a full three-row line', () => {
    const buffer = 'x'.repeat(56) // 4 + 56 = 60 = 3 rows exactly
    const { rowOffset } = render({ buffer, cursor: 56 })
    expect(rowOffset).toBe(2)
  })

  it('produces a stable offset that can be fed back in', () => {
    const first = render({ buffer: 'x'.repeat(40), cursor: 40 })
    const second = renderSequence({
      ...base,
      buffer: 'x'.repeat(40),
      cursor: 40,
      previousRowOffset: first.rowOffset,
    })
    expect(second.sequence).toContain(`\x1b[${first.rowOffset}A`)
    expect(second.rowOffset).toBe(first.rowOffset)
  })

  it('tolerates a zero-width terminal during layout', () => {
    expect(() => render({ buffer: 'ls', cursor: 1, cols: 0 })).not.toThrow()
  })
})
