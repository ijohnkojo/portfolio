'use client'

/**
 * The home page's knowledge graph — the one client component on the site.
 *
 * It receives the graph as plain data from the server (`lib/graph/load.ts`),
 * the same way `/os` receives its filesystem, and holds only interaction
 * state. Everything with a rule in it — what lights up, where a key goes, how
 * connections group — is a pure function in `lib/graph/interact.ts`, tested in
 * bare node (AGENTS.md invariant 2).
 */
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react'

import {
  connections,
  highlight,
  indexGraph,
  joinedIn,
  nextNode,
  timelineYears,
  visibleAt,
  type NavMove,
} from '@/lib/graph/interact'
import { DESKTOP } from '@/lib/graph/layout'
import type { GraphData } from '@/lib/graph/model'

import { GraphCanvas } from './GraphCanvas'
import { Inspector } from './Inspector'
import { NodeLayer } from './NodeLayer'
import { Timeline } from './Timeline'

const MOVES: Record<string, NavMove> = {
  ArrowRight: 'next',
  ArrowLeft: 'previous',
  ArrowUp: 'outward',
  ArrowDown: 'inward',
  Home: 'centre',
}

/** How long Replay holds each year. */
const REPLAY_STEP_MS = 900

const NOTHING = { nodes: new Set<string>(), edges: new Set<string>() }

/** False on the server and during hydration, true after — without an effect. */
const noSubscription = () => () => {}
function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}

export function KnowledgeGraph({ graph }: { graph: GraphData }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** The node holding the graph's one tab stop. */
  const [focused, setFocused] = useState('me')
  const [focusWithin, setFocusWithin] = useState(false)

  const index = useMemo(() => indexGraph(graph), [graph])
  const years = useMemo(() => timelineYears(graph), [graph])
  const lastYear = years.length > 0 ? years[years.length - 1] : null

  // The timeline starts at the last year — the whole graph, as the server
  // rendered it. `entering` is set when the year moves forward, so what joins
  // fades in; moving back just removes nodes.
  const [time, setTime] = useState({ year: lastYear, entering: false })
  const [playing, setPlaying] = useState(false)
  const hydrated = useHydrated()

  const visible = useMemo(
    () => (time.year === null ? new Set(graph.nodes.map((n) => n.id)) : visibleAt(graph, time.year).nodes),
    [graph, time.year]
  )
  const entering = useMemo(
    () => (time.entering && time.year !== null ? joinedIn(graph, time.year) : NOTHING),
    [graph, time]
  )
  const controls = useRef(new Map<string, HTMLElement>())

  function goTo(year: number) {
    setTime((t) => ({ year, entering: t.year !== null && year > t.year }))
  }

  // Replay: hold each year, step to the next, stop after the last.
  useEffect(() => {
    if (!playing || time.year === null) return
    const timer = setTimeout(() => {
      const next = years[years.indexOf(time.year!) + 1]
      if (next === undefined) setPlaying(false)
      else setTime({ year: next, entering: true })
    }, REPLAY_STEP_MS)
    return () => clearTimeout(timer)
  }, [playing, time.year, years])

  const instructionsId = useId()
  const titleId = useId()

  // Hover wins, then keyboard focus, then the selection — so pointing at
  // something always shows it, and letting go returns to what was chosen.
  //
  // A node the timeline has hidden cannot be hovered, hold the tab stop or be
  // selected; each falls back as if it had been let go. The selection comes
  // back if the year moves forward again.
  const shownHover = hovered !== null && visible.has(hovered) ? hovered : null
  const shownSelected = selected !== null && visible.has(selected) ? selected : null
  const tabStop = visible.has(focused) ? focused : 'me'
  const active = shownHover ?? (focusWithin ? tabStop : null) ?? shownSelected
  const lit = active ? highlight(index, active) : null
  const selectedNode = shownSelected ? (index.byId.get(shownSelected) ?? null) : null

  function moveFocus(id: string) {
    setFocused(id)
    controls.current.get(id)?.focus()
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      setSelected(null)
      return
    }
    const move = MOVES[event.key]
    if (!move) return
    event.preventDefault()
    moveFocus(nextNode(index, tabStop, move, visible))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div className="min-w-0">
        <div
          className="relative w-full"
          style={{ aspectRatio: `${DESKTOP.width} / ${DESKTOP.height}` }}
          onFocus={() => setFocusWithin(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
          }}
        >
          <GraphCanvas
            graph={graph}
            geometry={DESKTOP}
            lit={lit}
            selected={shownSelected}
            visible={visible}
            entering={entering}
          />
          <NodeLayer
            graph={graph}
            geometry={DESKTOP}
            lit={lit}
            selected={shownSelected}
            focused={tabStop}
            visible={visible}
            entering={entering.nodes}
            describedBy={instructionsId}
            register={(id, el) => {
              if (el) controls.current.set(id, el)
              else controls.current.delete(id)
            }}
            onHover={setHovered}
            onSelect={(id) => {
              setSelected((current) => (current === id ? null : id))
              setFocused(id)
            }}
            onFocusNode={setFocused}
            onKeyDown={onKeyDown}
          />
          <p id={instructionsId} className="sr-only">
            Arrow keys move between nodes: left and right around a ring, up and down between rings. Home
            returns to the centre. Enter selects a node; Escape clears the selection.
          </p>
        </div>

        {time.year !== null && years.length > 1 && (
          <Timeline
            years={years}
            year={time.year}
            shown={visible.size}
            total={graph.nodes.length}
            playing={playing}
            ready={hydrated}
            onYear={(year) => {
              setPlaying(false)
              goTo(year)
            }}
            onReplay={() => {
              // The first year fades in too, so a replay visibly starts over.
              setTime({ year: years[0], entering: true })
              setPlaying(true)
            }}
            onStop={() => setPlaying(false)}
          />
        )}
      </div>

      <Inspector
        node={selectedNode}
        groups={shownSelected ? connections(index, shownSelected, visible) : []}
        titleId={titleId}
        onSelect={(id) => {
          setSelected(id)
          setFocused(id)
        }}
        onClear={() => setSelected(null)}
      />
    </div>
  )
}
