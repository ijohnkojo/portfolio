import { describe, expect, it } from 'vitest'

import { buildGraph, type GraphEntry } from './model'

/* Fixtures: plain objects, no disk. Every validation rule gets a case. */

const SPEC_PATH = 'content/home/graph.json'
const options = { centre: { label: 'Me', href: '/about' }, specPath: SPEC_PATH }

function entry(slug: string, over: Partial<GraphEntry> & { fm?: Record<string, unknown> } = {}): GraphEntry {
  const collection = over.collection ?? 'projects'
  return {
    collection,
    slug,
    title: over.title ?? slug,
    summary: 'A summary.',
    date: over.date ?? '2025-06-01',
    tags: [],
    draft: over.draft ?? false,
    href: `/${collection}/${slug}`,
    frontmatter: over.fm ?? {},
    sourcePath: `content/${collection}/${slug}/index.mdx`,
  }
}

function spec(over: Record<string, unknown> = {}) {
  return {
    nodes: [
      { id: 'lab', kind: 'org', label: 'The Lab', angle: 30 },
      { id: 'physics', kind: 'field', label: 'Physics', angle: 200 },
      { id: 'python', kind: 'tool', label: 'Python', angle: 90 },
      { id: 'rust', kind: 'tool', label: 'Rust', angle: 270 },
    ],
    ...over,
  }
}

const ids = (g: ReturnType<typeof buildGraph>) => g.nodes.map((n) => n.id)
const edgeIds = (g: ReturnType<typeof buildGraph>) => g.edges.map((e) => e.id)

describe('buildGraph — nodes and edges', () => {
  const g = buildGraph(
    spec(),
    [
      entry('alpha', { fm: { orgs: ['lab'], fields: ['physics'], tools: ['python'], related: ['beta'] } }),
      entry('beta', { collection: 'papers', date: '2024-02-02', fm: { tools: ['python'], related: ['alpha'] } }),
    ],
    options
  )

  it('puts me at the centre, linked to every inner-ring node', () => {
    const me = g.nodes.find((n) => n.id === 'me')!
    expect(me).toMatchObject({ kind: 'me', ring: 0, label: 'Me', href: '/about', year: null })
    expect(edgeIds(g)).toContain('field:physics|me')
    expect(edgeIds(g)).toContain('me|org:lab')
  })

  it('gives the centre a summary only when one is passed', () => {
    expect(g.nodes.find((n) => n.id === 'me')).not.toHaveProperty('summary')
    const withSummary = buildGraph(spec(), [], { ...options, centre: { ...options.centre, summary: 'Hello.' } })
    expect(withSummary.nodes.find((n) => n.id === 'me')?.summary).toBe('Hello.')
  })

  it('namespaces ids by kind and assigns rings by kind', () => {
    const ring = Object.fromEntries(g.nodes.map((n) => [n.id, n.ring]))
    expect(ring).toMatchObject({ 'org:lab': 1, 'field:physics': 1, 'entry:projects/alpha': 2, 'tool:python': 3 })
  })

  it('links an entry to what its frontmatter references', () => {
    expect(edgeIds(g)).toEqual(
      expect.arrayContaining([
        'entry:projects/alpha|org:lab',
        'entry:projects/alpha|field:physics',
        'entry:projects/alpha|tool:python',
      ])
    )
  })

  it('keeps one edge per pair, however many times it is declared', () => {
    const related = edgeIds(g).filter((id) => id === 'entry:papers/beta|entry:projects/alpha')
    expect(related).toHaveLength(1)
  })

  it('hides a tool nothing published uses', () => {
    expect(ids(g)).not.toContain('tool:rust')
  })

  it('carries what the inspector shows', () => {
    expect(g.nodes.find((n) => n.id === 'entry:papers/beta')).toMatchObject({
      label: 'beta',
      href: '/papers/beta',
      collection: 'papers',
      date: '2024-02-02',
      summary: 'A summary.',
    })
  })

  it('is plain data that survives JSON, which is how it reaches the client', () => {
    expect(JSON.parse(JSON.stringify(g))).toEqual(g)
  })
})

describe('buildGraph — drafts', () => {
  const g = buildGraph(
    spec(),
    [
      entry('shown', { fm: { tools: ['python'], related: ['hidden'] } }),
      entry('hidden', { draft: true, fm: { tools: ['rust'] } }),
    ],
    options
  )

  it('are not nodes', () => {
    expect(ids(g)).not.toContain('entry:projects/hidden')
  })

  it('drop the edges that point at them rather than failing', () => {
    expect(edgeIds(g).some((id) => id.includes('hidden'))).toBe(false)
  })

  it('do not keep a tool alive on their own', () => {
    expect(ids(g)).not.toContain('tool:rust')
  })

  it('are still validated, so a typo is caught before publishing', () => {
    expect(() =>
      buildGraph(spec(), [entry('wip', { draft: true, fm: { tools: ['pythn'] } })], options)
    ).toThrow("content/projects/wip/index.mdx: 'tools' references unknown node 'pythn'")
  })
})

describe('buildGraph — timeline years', () => {
  const g = buildGraph(
    spec({ nodes: [...spec().nodes, { id: 'uni', kind: 'org', label: 'Uni', angle: 300, since: 2020 }] }),
    [
      entry('old', { date: '2023-05-05', fm: { tools: ['python'], orgs: ['lab'] } }),
      entry('new', { date: '2026-01-01', fm: { tools: ['python'] } }),
    ],
    options
  )
  const year = (id: string) => g.nodes.find((n) => n.id === id)!.year

  it('dates an entry by its date', () => {
    expect(year('entry:projects/new')).toBe(2026)
  })

  it('dates a node by `since`, else by its earliest published entry, else never', () => {
    expect(year('org:uni')).toBe(2020)
    expect(year('tool:python')).toBe(2023)
    expect(year('org:lab')).toBe(2023)
    expect(year('field:physics')).toBeNull()
    expect(year('me')).toBeNull()
  })

  it('spans the timeline from the first dated node to the last', () => {
    expect(g.years).toEqual({ first: 2020, last: 2026 })
  })

  it('has no timeline when nothing is dated', () => {
    expect(buildGraph({ nodes: [] }, [], options).years).toBeNull()
  })
})

describe('buildGraph — angles', () => {
  it('keeps hand-set angles exactly', () => {
    const g = buildGraph(
      spec({ entries: { 'projects/a': { angle: 123.4 } } }),
      [entry('a', { fm: { tools: ['python'] } })],
      options
    )
    expect(g.nodes.find((n) => n.id === 'entry:projects/a')!.angle).toBe(123.4)
    expect(g.nodes.find((n) => n.id === 'tool:python')!.angle).toBe(90)
  })

  it('derives a missing entry angle from its inner-ring neighbours', () => {
    const g = buildGraph(
      spec({ nodes: [{ id: 'a', kind: 'org', label: 'A', angle: 350 }, { id: 'b', kind: 'org', label: 'B', angle: 10 }] }),
      [entry('both', { fm: { orgs: ['a', 'b'] } })],
      options
    )
    expect(g.nodes.find((n) => n.id === 'entry:projects/both')!.angle).toBe(0)
  })

  it('derives a missing tool angle from the entries that use it', () => {
    const g = buildGraph(
      { nodes: [{ id: 't', kind: 'tool', label: 'T' }], entries: { 'projects/x': { angle: 140 } } },
      [entry('x', { fm: { tools: ['t'] } })],
      options
    )
    expect(g.nodes.find((n) => n.id === 'tool:t')!.angle).toBe(140)
  })

  it('falls back to the widest empty arc, deterministically', () => {
    const build = () =>
      buildGraph(
        { nodes: [{ id: 'x', kind: 'field', label: 'X', angle: 0 }, { id: 'y', kind: 'field', label: 'Y' }] },
        [],
        options
      )
    expect(build().nodes.find((n) => n.id === 'field:y')!.angle).toBe(180)
    expect(build()).toEqual(build())
  })
})

describe('buildGraph — short labels', () => {
  it('shows a shorter label on the graph and keeps the full title', () => {
    const g = buildGraph(
      spec({ entries: { 'projects/long': { label: 'Short' } } }),
      [entry('long', { title: 'A very long title — with a subtitle' })],
      options
    )
    expect(g.nodes.find((n) => n.id === 'entry:projects/long')).toMatchObject({
      label: 'Short',
      title: 'A very long title — with a subtitle',
    })
  })

  it('rejects an empty one', () => {
    expect(() => buildGraph(spec({ entries: { 'projects/a': { label: ' ' } } }), [entry('a')], options)).toThrow(
      "entries['projects/a'].label must be a non-empty string"
    )
  })
})

describe('buildGraph — opens', () => {
  it('gives an entry a link to follow instead of an inspector', () => {
    const g = buildGraph(
      spec({ entries: { 'projects/os': { opens: { href: '/os', label: 'Launch the OS' } } } }),
      [entry('os')],
      options
    )
    expect(g.nodes.find((n) => n.id === 'entry:projects/os')!.opens).toEqual({ href: '/os', label: 'Launch the OS' })
  })
})

describe('buildGraph — validation fails the build, naming the file', () => {
  const fails = (s: unknown, entries: GraphEntry[], message: string) =>
    expect(() => buildGraph(s, entries, options)).toThrow(message)

  describe('in frontmatter', () => {
    it('an unknown id', () => fails(spec(), [entry('a', { fm: { orgs: ['nope'] } })], "content/projects/a/index.mdx: 'orgs' references unknown node 'nope'"))
    it('the right id in the wrong field', () => fails(spec(), [entry('a', { fm: { orgs: ['python'] } })], "'orgs' lists 'python', which is a tool, not a org"))
    it('a field that is not a list', () => fails(spec(), [entry('a', { fm: { tools: 'python' } })], "content/projects/a/index.mdx: 'tools' must be a list of ids"))
    it('a related entry that does not exist', () => fails(spec(), [entry('a', { fm: { related: ['ghost'] } })], "'related' references unknown entry 'ghost'"))
    it('an entry related to itself', () => fails(spec(), [entry('a', { fm: { related: ['a'] } })], "'related' lists the entry itself"))

    it('a bare slug that matches two collections', () =>
      fails(
        spec(),
        [entry('a', { fm: { related: ['twin'] } }), entry('twin'), entry('twin', { collection: 'papers' })],
        "'related' entry 'twin' is ambiguous — it matches projects/twin and papers/twin"
      ))

    it('— but collection/slug resolves the ambiguity', () => {
      const g = buildGraph(
        spec(),
        [entry('a', { fm: { related: ['papers/twin'] } }), entry('twin'), entry('twin', { collection: 'papers' })],
        options
      )
      expect(edgeIds(g)).toContain('entry:papers/twin|entry:projects/a')
    })
  })

  describe('in graph.json', () => {
    it('not an object', () => fails([], [], `${SPEC_PATH}: must be a JSON object`))
    it('no nodes array', () => fails({}, [], "'nodes' must be an array"))
    it('an unknown top-level key', () => fails({ nodes: [], node: [] }, [], "the file has unknown key 'node'"))
    it('an unknown node key', () => fails({ nodes: [{ id: 'a', kind: 'org', label: 'A', angel: 3 }] }, [], "nodes[0] has unknown key 'angel'"))
    it('a bad id', () => fails({ nodes: [{ id: 'Bad Id', kind: 'org', label: 'A' }] }, [], 'id must be lowercase kebab-case'))
    it('a duplicate id', () => fails({ nodes: [{ id: 'a', kind: 'org', label: 'A' }, { id: 'a', kind: 'tool', label: 'A' }] }, [], "duplicate node id 'a'"))
    it('an unknown kind', () => fails({ nodes: [{ id: 'a', kind: 'person', label: 'A' }] }, [], "node 'a': kind must be one of org, field, tool"))
    it('a missing label', () => fails({ nodes: [{ id: 'a', kind: 'org' }] }, [], "node 'a': label must be a non-empty string"))
    it('an angle out of range', () => fails({ nodes: [{ id: 'a', kind: 'org', label: 'A', angle: 360 }] }, [], 'angle must be a number from 0 up to 360'))
    it('a since that is not a year', () => fails({ nodes: [{ id: 'a', kind: 'org', label: 'A', since: '2024' }] }, [], "node 'a': since must be a year"))
    it('an href that is neither local nor https', () => fails({ nodes: [{ id: 'a', kind: 'org', label: 'A', href: 'http://x.org' }] }, [], 'href must start with / or https://'))
    it('a link to an unknown node', () => fails(spec({ links: [['lab', 'ghost']] }), [], "links[0] references unknown node 'ghost'"))
    it('a link from a node to itself', () => fails(spec({ links: [['lab', 'lab']] }), [], "links[0] links 'lab' to itself"))
    it('a malformed link', () => fails(spec({ links: [['lab']] }), [], 'links[0] must be a pair of node ids'))
    it('an entries key naming no entry', () => fails(spec({ entries: { 'projects/ghost': { angle: 1 } } }), [], `${SPEC_PATH}: entries['projects/ghost'] names no entry`))
    it('an opens with no label', () => fails(spec({ entries: { 'projects/a': { opens: { href: '/os' } } } }), [entry('a')], "entries['projects/a'].opens.label must be a non-empty string"))

    it('— but an entries key naming a draft is fine, and ignored', () => {
      const g = buildGraph(spec({ entries: { 'projects/wip': { angle: 5 } } }), [entry('wip', { draft: true })], options)
      expect(ids(g)).not.toContain('entry:projects/wip')
    })
  })
})
