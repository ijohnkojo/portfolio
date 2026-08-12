/**
 * Builds the escape sequence that repaints the prompt line.
 *
 * Pure, because this is the fiddliest code in the terminal and eyeballing it is
 * how the previous version shipped a bug: it repainted with `\r\x1b[2K`, which
 * returns to the start of the *current row* and clears only that row. A line
 * longer than the terminal width wraps, so the continuation rows survived every
 * repaint and the prompt duplicated on screen.
 *
 * The fix is the standard readline dance: walk up to the line's first row,
 * erase to the end of the *display*, rewrite, then place the cursor by absolute
 * row and column — `\x1b[nD` will not wrap backwards across a row boundary.
 */

const CSI = '\x1b['

export interface RenderInput {
  /** Prompt as written, ANSI included. */
  promptText: string
  /** Visible width of the prompt — escape codes occupy no cells. */
  promptWidth: number
  buffer: string
  cursor: number
  cols: number
  /** Rows between the line's first row and the cursor, as of the last paint. */
  previousRowOffset: number
}

export interface RenderOutput {
  sequence: string
  /** Feed back in as `previousRowOffset` on the next call. */
  rowOffset: number
}

/**
 * Where the cursor sits after `index` cells have been written.
 *
 * The subtlety is *deferred wrap*: after writing exactly `cols` characters the
 * cursor stays on the last column of that row rather than moving to column 0 of
 * the next one. It only wraps when another character arrives. Treating that
 * position as "row + 1, column 0" is what makes exact-multiple widths go wrong.
 */
export function cellAt(index: number, cols: number): { row: number; col: number } {
  if (index <= 0) return { row: 0, col: 0 }
  const safe = Math.max(1, cols)
  return { row: Math.floor((index - 1) / safe), col: ((index - 1) % safe) + 1 }
}

export function renderSequence(input: RenderInput): RenderOutput {
  const { promptText, promptWidth, buffer, cursor, previousRowOffset } = input
  const cols = Math.max(1, input.cols)

  let sequence = ''

  // Back to the first row of the line, then erase everything from there down.
  if (previousRowOffset > 0) sequence += `${CSI}${previousRowOffset}A`
  sequence += `\r${CSI}0J`
  sequence += promptText + buffer

  const end = cellAt(promptWidth + buffer.length, cols)
  const target = cellAt(promptWidth + cursor, cols)

  const rowsUp = end.row - target.row
  if (rowsUp > 0) sequence += `${CSI}${rowsUp}A`
  else if (rowsUp < 0) sequence += `${CSI}${-rowsUp}B`

  // Columns are 1-based. A deferred-wrap column of exactly `cols` clamps to the
  // last cell, which is where the cursor visually sits in that state.
  sequence += `${CSI}${Math.min(target.col + 1, cols)}G`

  return { sequence, rowOffset: target.row }
}
