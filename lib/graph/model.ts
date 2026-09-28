/**
 * The knowledge graph — built from content, validated, laid out. Pure: no DOM,
 * no React, no disk (AGENTS.md invariant 2). `load.ts` does the reading.
 *
 * Two inputs, both from `content/` (D-039):
 *
 * - **entries**, whose optional frontmatter fields `orgs`, `fields`, `tools`
 *   and `related` are typed references into the graph;
 * - **the spec**, `content/home/graph.json`: every node that is not an entry,
 *   the hand-set angles, and the few entry-level settings that are layout
 *   rather than facts about the work.
 *
 * A reference to something that does not exist fails the build, naming the
 * file; a reference to a draft is dropped, because drafts are hidden, not
 * broken (D-040).
 */
import type { Collection } from '@/lib/content'

import { circularMean, roundAngle, widestGapMidpoint, type Ring } from './layout'

export type NodeKind = 'me' | 'org' | 'field' | 'entry' | 'tool'

export interface GraphNode {
  /** `me`, or kind-prefixed: `org:iris-hep`, `entry:papers/hq`, `tool:python`. */
  id: string
  kind: NodeKind
  ring: Ring
  label: string
  /** Degrees clockwise from 12 o'clock — hand-set, or derived (D-041). */
  angle: number
  /** The year the node joins the timeline; null means always there. */
  year: number | null
  href?: string
  summary?: string
  collection?: Collection
  date?: string
  tags?: string[]
  /** Clicking the node follows this instead of selecting it (the OS). */
  opens?: { href: string; label: string }
}

export interface GraphEdge {
  /** `a|b`, with the two node ids sorted — so each pair has one edge. */
  id: string
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** The timeline's span; null when nothing in the graph is dated. */
  years: { first: number; last: number } | null
}

/** What the graph needs from an entry — `Entry` from lib/content satisfies it. */
export interface GraphEntry {
  collection: Collection
  slug: string
  title: string
  summary: string
  date: string
  tags: string[]
  draft: boolean
  href: string
  frontmatter: Record<string, unknown>
  sourcePath: string
}

export interface BuildOptions {
  /** The centre node: the site's owner. */
  centre: { label: string; href: string }
  /** The spec's path, for error messages. */
  specPath: string
}

/* -------------------------------------------------------------------------- */
/* The spec — content/home/graph.json                                         */
/* -------------------------------------------------------------------------- */

type SpecKind = 'org' | 'field' | 'tool'

interface SpecNode {
  id: string
  kind: SpecKind
  label: string
  angle?: number
  since?: number
  href?: string
  summary?: string
}

interface SpecEntry {
  angle?: number
  opens?: { href: string; label: string }
}

interface Spec {
  nodes: SpecNode[]
  links: Array<[string, string]>
  entries: Record<string, SpecEntry>
}

const SPEC_KINDS: readonly SpecKind[] = ['org', 'field', 'tool']
const RING_OF: Record<NodeKind, Ring> = { me: 0, org: 1, field: 1, entry: 2, tool: 3 }
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/
const HREF = /^(\/|https:\/\/)/

/** The frontmatter fields that reference spec nodes, and the kind each must be. */
const REFERENCE_FIELDS = { orgs: 'org', fields: 'field', tools: 'tool' } as const

function fail(where: string, message: string): never {
  throw new Error(`${where}: ${message}`)
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function onlyKeys(value: Record<string, unknown>, allowed: string[], where: string, what: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) fail(where, `${what} has unknown key '${key}' (allowed: ${allowed.join(', ')})`)
  }
}

function checkAngle(value: unknown, where: string, what: string): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 360) {
    fail(where, `${what}: angle must be a number from 0 up to 360, got ${JSON.stringify(value)}`)
  }
  return value
}

function checkHref(value: unknown, where: string, what: string): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || !HREF.test(value)) {
    fail(where, `${what}: href must start with / or https://, got ${JSON.stringify(value)}`)
  }
  return value
}

function checkText(value: unknown, where: string, what: string, required: boolean): string | undefined {
  if (value === undefined && !required) return undefined
  if (typeof value !== 'string' || value.trim() === '') fail(where, `${what} must be a non-empty string`)
  return value
}

function parseSpec(raw: unknown, where: string): Spec {
  if (!isObject(raw)) fail(where, 'must be a JSON object')
  onlyKeys(raw, ['$comment', 'nodes', 'links', 'entries'], where, 'the file')
  if (!Array.isArray(raw.nodes)) fail(where, "'nodes' must be an array")

  const nodes: SpecNode[] = []
  const seen = new Set<string>()
  raw.nodes.forEach((n, i) => {
    const what = `nodes[${i}]`
    if (!isObject(n)) fail(where, `${what} must be an object`)
    onlyKeys(n, ['id', 'kind', 'label', 'angle', 'since', 'href', 'summary'], where, what)
    if (typeof n.id !== 'string' || !ID.test(n.id)) fail(where, `${what}: id must be lowercase kebab-case, got ${JSON.stringify(n.id)}`)
    const named = `node '${n.id}'`
    if (seen.has(n.id)) fail(where, `duplicate node id '${n.id}'`)
    seen.add(n.id)
    if (!SPEC_KINDS.includes(n.kind as SpecKind)) fail(where, `${named}: kind must be one of ${SPEC_KINDS.join(', ')}, got ${JSON.stringify(n.kind)}`)
    if (n.since !== undefined && (!Number.isInteger(n.since) || (n.since as number) < 1900 || (n.since as number) > 2100)) {
      fail(where, `${named}: since must be a year, got ${JSON.stringify(n.since)}`)
    }
    nodes.push({
      id: n.id,
      kind: n.kind as SpecKind,
      label: checkText(n.label, where, `${named}: label`, true)!,
      angle: checkAngle(n.angle, where, named),
      since: n.since as number | undefined,
      href: checkHref(n.href, where, named),
      summary: checkText(n.summary, where, `${named}: summary`, false),
    })
  })

  const links: Array<[string, string]> = []
  if (raw.links !== undefined) {
    if (!Array.isArray(raw.links)) fail(where, "'links' must be an array of [id, id] pairs")
    raw.links.forEach((l, i) => {
      if (!Array.isArray(l) || l.length !== 2 || !l.every((x) => typeof x === 'string')) {
        fail(where, `links[${i}] must be a pair of node ids`)
      }
      const [a, b] = l as [string, string]
      for (const id of [a, b]) if (!seen.has(id)) fail(where, `links[${i}] references unknown node '${id}'`)
      if (a === b) fail(where, `links[${i}] links '${a}' to itself`)
      links.push([a, b])
    })
  }

  const entries: Record<string, SpecEntry> = {}
  if (raw.entries !== undefined) {
    if (!isObject(raw.entries)) fail(where, "'entries' must be an object keyed by collection/slug")
    for (const [key, value] of Object.entries(raw.entries)) {
      const what = `entries['${key}']`
      if (!isObject(value)) fail(where, `${what} must be an object`)
      onlyKeys(value, ['angle', 'opens'], where, what)
      let opens: SpecEntry['opens']
      if (value.opens !== undefined) {
        if (!isObject(value.opens)) fail(where, `${what}.opens must be { href, label }`)
        onlyKeys(value.opens, ['href', 'label'], where, `${what}.opens`)
        opens = {
          href: checkHref(value.opens.href ?? '', where, `${what}.opens`)!,
          label: checkText(value.opens.label, where, `${what}.opens.label`, true)!,
        }
      }
      entries[key] = { angle: checkAngle(value.angle, where, what), opens }
    }
  }

  return { nodes, links, entries }
}

/* -------------------------------------------------------------------------- */
/* Entry references — frontmatter                                             */
/* -------------------------------------------------------------------------- */

function readIdList(entry: GraphEntry, field: string): string[] {
  const value = entry.frontmatter[field]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.trim() !== '')) {
    fail(entry.sourcePath, `'${field}' must be a list of ids, like [a, b]`)
  }
  return value as string[]
}

const keyOf = (e: { collection: string; slug: string }) => `${e.collection}/${e.slug}`
const entryNodeId = (e: { collection: string; slug: string }) => `entry:${keyOf(e)}`
const specNodeId = (n: { kind: string; id: string }) => `${n.kind}:${n.id}`

/**
 * Resolve every entry's references — drafts included, so a typo is caught
 * before the draft is published rather than on the day it is.
 */
function resolveReferences(entries: GraphEntry[], specById: Map<string, SpecNode>) {
  const byKey = new Map(entries.map((e) => [keyOf(e), e]))
  const bySlug = new Map<string, GraphEntry[]>()
  for (const e of entries) bySlug.set(e.slug, [...(bySlug.get(e.slug) ?? []), e])

  const refs = new Map<string, { nodes: string[]; related: GraphEntry[] }>()

  for (const entry of entries) {
    const nodes: string[] = []
    for (const [field, kind] of Object.entries(REFERENCE_FIELDS)) {
      for (const id of readIdList(entry, field)) {
        const node = specById.get(id)
        if (!node) fail(entry.sourcePath, `'${field}' references unknown node '${id}' — add it to content/home/graph.json`)
        if (node.kind !== kind) fail(entry.sourcePath, `'${field}' lists '${id}', which is a ${node.kind}, not a ${kind}`)
        nodes.push(specNodeId(node))
      }
    }

    const related: GraphEntry[] = []
    for (const ref of readIdList(entry, 'related')) {
      let target: GraphEntry | undefined
      if (ref.includes('/')) {
        target = byKey.get(ref)
      } else {
        const matches = bySlug.get(ref) ?? []
        if (matches.length > 1) {
          fail(entry.sourcePath, `'related' entry '${ref}' is ambiguous — it matches ${matches.map(keyOf).join(' and ')}; write collection/slug`)
        }
        target = matches[0]
      }
      if (!target) fail(entry.sourcePath, `'related' references unknown entry '${ref}'`)
      if (target === entry) fail(entry.sourcePath, `'related' lists the entry itself`)
      related.push(target)
    }

    refs.set(keyOf(entry), { nodes, related })
  }

  return { refs, byKey }
}

/* -------------------------------------------------------------------------- */
/* Build                                                                      */
/* -------------------------------------------------------------------------- */

const yearOf = (date: string) => Number.parseInt(date.slice(0, 4), 10)

export function buildGraph(rawSpec: unknown, entries: GraphEntry[], options: BuildOptions): GraphData {
  const spec = parseSpec(rawSpec, options.specPath)
  const specById = new Map(spec.nodes.map((n) => [n.id, n]))
  const { refs, byKey } = resolveReferences(entries, specById)

  for (const key of Object.keys(spec.entries)) {
    if (!byKey.has(key)) {
      fail(options.specPath, `entries['${key}'] names no entry — expected collection/slug of a directory under content/`)
    }
  }

  const published = entries.filter((e) => !e.draft)

  /* ---- edges ---- */
  const edges = new Map<string, GraphEdge>()
  const addEdge = (a: string, b: string) => {
    const [source, target] = [a, b].sort()
    const id = `${source}|${target}`
    if (!edges.has(id)) edges.set(id, { id, source, target })
  }

  for (const n of spec.nodes) if (RING_OF[n.kind] === 1) addEdge('me', specNodeId(n))
  for (const e of published) {
    const r = refs.get(keyOf(e))!
    for (const id of r.nodes) addEdge(entryNodeId(e), id)
    for (const t of r.related) if (!t.draft) addEdge(entryNodeId(e), entryNodeId(t))
  }
  for (const [a, b] of spec.links) addEdge(specNodeId(specById.get(a)!), specNodeId(specById.get(b)!))

  const adjacent = new Map<string, string[]>()
  for (const { source, target } of edges.values()) {
    adjacent.set(source, [...(adjacent.get(source) ?? []), target])
    adjacent.set(target, [...(adjacent.get(target) ?? []), source])
  }

  /* ---- nodes ---- */
  const nodes: GraphNode[] = [
    { id: 'me', kind: 'me', ring: 0, label: options.centre.label, angle: 0, year: null, href: options.centre.href },
  ]

  for (const e of published) {
    const setting = spec.entries[keyOf(e)]
    nodes.push({
      id: entryNodeId(e),
      kind: 'entry',
      ring: 2,
      label: e.title,
      angle: setting?.angle ?? NaN,
      year: yearOf(e.date),
      href: e.href,
      summary: e.summary,
      collection: e.collection,
      date: e.date,
      tags: e.tags,
      ...(setting?.opens ? { opens: setting.opens } : {}),
    })
  }

  const entryYear = new Map(published.map((e) => [entryNodeId(e), yearOf(e.date)]))
  for (const n of spec.nodes) {
    const id = specNodeId(n)
    const ring = RING_OF[n.kind]
    // An outer-ring node nothing published uses would dangle; hide it. The
    // inner ring always connects to the centre, so it always shows.
    if (ring === 3 && !adjacent.has(id)) continue

    const years = (adjacent.get(id) ?? []).map((a) => entryYear.get(a)).filter((y) => y !== undefined)
    nodes.push({
      id,
      kind: n.kind,
      ring,
      label: n.label,
      angle: n.angle ?? NaN,
      year: n.since ?? (years.length > 0 ? Math.min(...years) : null),
      ...(n.href ? { href: n.href } : {}),
      ...(n.summary ? { summary: n.summary } : {}),
    })
  }

  resolveAngles(nodes, adjacent)

  const dated = nodes.map((n) => n.year).filter((y): y is number => y !== null)
  return {
    nodes: nodes.sort((a, b) => a.ring - b.ring || a.angle - b.angle || a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) => a.id.localeCompare(b.id)),
    years: dated.length > 0 ? { first: Math.min(...dated), last: Math.max(...dated) } : null,
  }
}

/**
 * Fill in every angle that was not hand-set, ring by ring from the inside out,
 * so each ring can lean on the one inside it. A node goes to the circular mean
 * of its neighbours on the next ring in (the outer ring leans on entries, the
 * middle on organisations and fields); failing that, into the widest empty arc
 * of its own ring. Deterministic: fallbacks are placed in id order (D-041).
 */
function resolveAngles(nodes: GraphNode[], adjacent: Map<string, string[]>) {
  const byId = new Map(nodes.map((n) => [n.id, n]))

  for (const ring of [1, 2, 3] as const) {
    const onRing = nodes.filter((n) => n.ring === ring)
    const taken = onRing.filter((n) => !Number.isNaN(n.angle)).map((n) => n.angle)
    const pending = onRing.filter((n) => Number.isNaN(n.angle)).sort((a, b) => a.id.localeCompare(b.id))

    for (const node of pending) {
      const inward = (adjacent.get(node.id) ?? [])
        .map((id) => byId.get(id)!)
        .filter((n) => n.ring === ring - 1 && !Number.isNaN(n.angle))
        .map((n) => n.angle)
      const mean = ring === 1 ? null : circularMean(inward)
      node.angle = roundAngle(mean ?? widestGapMidpoint(taken))
      taken.push(node.angle)
    }
  }
}
