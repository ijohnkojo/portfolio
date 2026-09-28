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
import { useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { connections, highlight, indexGraph, nextNode, type NavMove } from '@/lib/graph/interact'
import { DESKTOP } from '@/lib/graph/layout'
import type { GraphData } from '@/lib/graph/model'

import { GraphCanvas } from './GraphCanvas'
import { Inspector } from './Inspector'
import { NodeLayer } from './NodeLayer'

const MOVES: Record<string, NavMove> = {
  ArrowRight: 'next',
  ArrowLeft: 'previous',
  ArrowUp: 'outward',
  ArrowDown: 'inward',
  Home: 'centre',
}

export function KnowledgeGraph({ graph }: { graph: GraphData }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** The node holding the graph's one tab stop. */
  const [focused, setFocused] = useState('me')
  const [focusWithin, setFocusWithin] = useState(false)

  const index = useMemo(() => indexGraph(graph), [graph])
  // Every node, until the timeline (Phase 4) narrows it.
  const visible = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph])
  const controls = useRef(new Map<string, HTMLElement>())

  const instructionsId = useId()
  const titleId = useId()

  // Hover wins, then keyboard focus, then the selection — so pointing at
  // something always shows it, and letting go returns to what was chosen.
  const active = hovered ?? (focusWithin ? focused : null) ?? selected
  const lit = active ? highlight(index, active) : null
  const selectedNode = selected ? (index.byId.get(selected) ?? null) : null

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
    moveFocus(nextNode(index, focused, move, visible))
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
      <div
        className="relative w-full"
        style={{ aspectRatio: `${DESKTOP.width} / ${DESKTOP.height}` }}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
        }}
      >
        <GraphCanvas graph={graph} geometry={DESKTOP} lit={lit} selected={selected} visible={visible} />
        <NodeLayer
          graph={graph}
          geometry={DESKTOP}
          lit={lit}
          selected={selected}
          focused={focused}
          visible={visible}
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

      <Inspector
        node={selectedNode}
        groups={selected ? connections(index, selected, visible) : []}
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
