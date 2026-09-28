import { describe, expect, it } from 'vitest'

import {
  findUnsupportedOperator,
  lastUnquotedPipe,
  parsePipeline,
  tokenize,
} from './pipeline'

/** Stages as plain token arrays — the wrapper object is noise in assertions. */
const stagesOf = (line: string) => parsePipeline(line).stages.map((stage) => stage.tokens)

/** The message, or the fact that there wasn't one. */
const errorFrom = (line: string) => {
  try {
    parsePipeline(line)
    return 'no error'
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

describe('tokenize', () => {
  it('splits on whitespace and collapses runs', () => {
    expect(tokenize('  ls   /projects  ')).toEqual(['ls', '/projects'])
  })

  it('keeps quoted spans together', () => {
    expect(tokenize('cat "a file.md"')).toEqual(['cat', 'a file.md'])
    expect(tokenize("cat 'a file.md'")).toEqual(['cat', 'a file.md'])
  })

  it('treats an empty quoted string as a real argument', () => {
    expect(tokenize('echo ""')).toEqual(['echo', ''])
  })

  it('returns nothing for a blank line', () => {
    expect(tokenize('   ')).toEqual([])
  })
})

describe('stages', () => {
  it('parses one command as a single stage', () => {
    expect(stagesOf('ls -a /home')).toEqual([['ls', '-a', '/home']])
  })

  it('parses two stages', () => {
    expect(stagesOf('ls /papers | wc')).toEqual([
      ['ls', '/papers'],
      ['wc'],
    ])
  })

  it('parses three stages', () => {
    expect(stagesOf('grep -i kernel / | sort | uniq -c')).toEqual([
      ['grep', '-i', 'kernel', '/'],
      ['sort'],
      ['uniq', '-c'],
    ])
  })

  it('does not need spaces around the pipe', () => {
    expect(stagesOf('ls|wc')).toEqual([['ls'], ['wc']])
  })

  it('has no stages for a blank line, which is not an error', () => {
    expect(parsePipeline('')).toEqual({ stages: [] })
    expect(parsePipeline('   ')).toEqual({ stages: [] })
  })

  // The reason the split tracks quote state rather than calling String.split.
  it('leaves a quoted operator as literal text', () => {
    expect(stagesOf('echo "a | b"')).toEqual([['echo', 'a | b']])
    expect(stagesOf("echo 'x > y'")).toEqual([['echo', 'x > y']])
  })
})

describe('redirection', () => {
  it('takes the trailing file as the target', () => {
    expect(parsePipeline('ls /papers > /home/out.txt')).toEqual({
      stages: [{ tokens: ['ls', '/papers'] }],
      redirect: { path: '/home/out.txt', append: false },
    })
  })

  it('distinguishes >> from >', () => {
    expect(parsePipeline('ls >> out.txt').redirect).toEqual({
      path: 'out.txt',
      append: true,
    })
  })

  it('works at the end of a pipeline', () => {
    const pipeline = parsePipeline('grep -i kernel / | wc > /home/count.txt')

    expect(pipeline.stages.map((s) => s.tokens)).toEqual([
      ['grep', '-i', 'kernel', '/'],
      ['wc'],
    ])
    expect(pipeline.redirect).toEqual({ path: '/home/count.txt', append: false })
  })

  it('needs no spaces', () => {
    expect(parsePipeline('ls>out.txt')).toEqual({
      stages: [{ tokens: ['ls'] }],
      redirect: { path: 'out.txt', append: false },
    })
  })

  it('accepts a target containing a quoted space', () => {
    expect(parsePipeline('ls > "/home/my notes.txt"').redirect).toEqual({
      path: '/home/my notes.txt',
      append: false,
    })
  })
})

describe('syntax errors', () => {
  it('names what is missing', () => {
    expect(errorFrom('ls |')).toBe("syntax error: expected a command after '|'")
    expect(errorFrom('ls | | wc')).toBe("syntax error: expected a command after '|'")
    expect(errorFrom('| ls')).toBe("syntax error: unexpected '|'")
    expect(errorFrom('ls >')).toBe("syntax error: expected a file after '>'")
    expect(errorFrom('ls >>')).toBe("syntax error: expected a file after '>>'")
    expect(errorFrom('ls > a b')).toBe("syntax error: '>' takes one file")
    expect(errorFrom('> out.txt')).toBe("syntax error: expected a command before '>'")
  })

  // Anything after a redirect is text that would never be read, so say so
  // rather than writing the file and silently dropping the rest.
  it('rejects a redirect that is not last', () => {
    expect(errorFrom('ls > out.txt | wc')).toBe("syntax error: '>' must come last")
    expect(errorFrom('ls > a > b')).toBe("syntax error: '>' must come last")
  })
})

describe('findUnsupportedOperator', () => {
  it('catches the operators this shell does not implement', () => {
    expect(findUnsupportedOperator('cat < in.txt')).toBe('<')
    expect(findUnsupportedOperator('ls && pwd')).toBe('&&')
    expect(findUnsupportedOperator('ls || pwd')).toBe('||')
    expect(findUnsupportedOperator('ls 2> err.txt')).toBe('2>')
  })

  it('passes over the three that are implemented', () => {
    expect(findUnsupportedOperator('ls | wc')).toBeNull()
    expect(findUnsupportedOperator('ls > out.txt')).toBeNull()
    expect(findUnsupportedOperator('ls >> out.txt')).toBeNull()
  })

  it('ignores operators inside quotes', () => {
    expect(findUnsupportedOperator('echo "a && b"')).toBeNull()
    expect(findUnsupportedOperator("echo 'x < y'")).toBeNull()
  })

  it('leaves ordinary lines alone', () => {
    expect(findUnsupportedOperator('ls -a /home')).toBeNull()
    expect(findUnsupportedOperator('')).toBeNull()
  })
})

describe('lastUnquotedPipe', () => {
  it('finds the last one, so completion knows a command is expected', () => {
    expect(lastUnquotedPipe('ls | wc | head')).toBe(8)
    expect(lastUnquotedPipe('ls -a /home')).toBe(-1)
  })

  it('ignores a quoted pipe', () => {
    expect(lastUnquotedPipe('echo "a | b"')).toBe(-1)
  })
})
