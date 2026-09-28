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
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'

import {
  allWork,
  connections,
  highlight,
  indexGraph,
  joinedIn,
  kindLabel,
  nextNode,
  timelineYears,
  visibleAt,
  type NavMove,
} from '@/lib/graph/interact'
import { cropStage, DESKTOP, phoneLabelSides } from '@/lib/graph/layout'
import type { GraphData } from '@/lib/graph/model'

import { GraphCanvas } from './GraphCanvas'
import { Inspector } from './Inspector'
import { InspectorSheet } from './InspectorSheet'
import { GRAPH_COLUMNS } from './columns'
import { NodeLayer } from './NodeLayer'
import { Timeline } from './Timeline'

const MOVES: Record<string, NavMove> = {
  ArrowRight: 'next',
  ArrowLeft: 'previous',
  ArrowUp: 'outward',
  ArrowDown: 'inward',
  Home: 'centre',
}

/**
 * What a click may land on without clearing the selection: anything that does
 * something itself, and the inspector, which is about the selection.
 */
const KEEPS_SELECTION = 'a, button, input, select, textarea, label, summary, [data-graph-inspector]'

/** How long Replay holds each year. */
const REPLAY_STEP_MS = 900

const NOTHING = { nodes: new Set<string>(), edges: new Set<string>() }

/** False on the server and during hydration, true after — without an effect. */
const noSubscription = () => () => {}
function useHydrated() {
  return useSyncExternalStore(noSubscription, () => true, () => false)
}

/**
 * Below `md`, the phone layout (D-050). Only behaviour reads this — which
 * inspector opens — never the drawing's layout, which switches in CSS, so the
 * server render and the first paint are right on every screen.
 */
const PHONE = '(max-width: 767.98px)'
function subscribePhone(onChange: () => void) {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
function useIsPhone() {
  return useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE).matches, () => false)
}

/**
 * The drawing's box: square on a phone, cropped around the outer ring, and the
 * desktop frame's shape from `md` up. The stage inside it is always the full
 * desktop frame, so every coordinate stays the same; on a phone it is simply
 * larger than its box and offset to centre the rings (`cropStage`).
 */
const STAGE = cropStage(DESKTOP)
const BOX_STYLE = {
  '--frame-aspect': `${DESKTOP.width} / ${DESKTOP.height}`,
  '--stage-w': `${STAGE.width}%`,
  '--stage-h': `${STAGE.height}%`,
  '--stage-left': `${STAGE.left}%`,
  '--stage-top': `${STAGE.top}%`,
} as CSSProperties

export function KnowledgeGraph({ graph }: { graph: GraphData }) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  /** The node holding the graph's one tab stop. */
  const [focused, setFocused] = useState('me')
  const [focusWithin, setFocusWithin] = useState(false)

  const index = useMemo(() => indexGraph(graph), [graph])
  const years = useMemo(() => timelineYears(graph), [graph])
  const phoneSides = useMemo(() => phoneLabelSides(graph.nodes), [graph])
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

  // A click on blank space — anywhere on the page that is not a control or
  // the inspector — clears the selection, like the inspector's ×. Listening
  // only while something is selected keeps the page free of it otherwise.
  // A click that ends a text selection is left alone.
  useEffect(() => {
    if (selected === null) return
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return
      if (!(event.target instanceof Element) || event.target.closest(KEEPS_SELECTION)) return
      if (window.getSelection()?.isCollapsed === false) return
      setSelected(null)
    }
    document.addEventListener('click', onClick)
    return () => document.removeEventListener('click', onClick)
  }, [selected])

  const instructionsId = useId()
  const titleId = useId()
  const sheetTitleId = useId()
  const phone = useIsPhone()

  // Hover wins, then keyboard focus, then the selection — so pointing at
  // something always shows it, and letting go returns to what was chosen. With
  // nothing chosen the whole graph stays at full strength, and the inspector
  // shows the centre (D-049).
  //
  // A node the timeline has hidden cannot be hovered, hold the tab stop or be
  // selected; each falls back as if it had been let go. The selection comes
  // back if the year moves forward again.
  const shownHover = hovered !== null && visible.has(hovered) ? hovered : null
  const shownSelected = selected !== null && visible.has(selected) ? selected : null
  const tabStop = visible.has(focused) ? focused : 'me'
  const active = shownHover ?? (focusWithin ? tabStop : null) ?? shownSelected
  const lit = active ? highlight(index, active) : null
  const inspected = index.byId.get(shownSelected ?? 'me')!
  const centre = index.byId.get('me')!

  // What a screen reader hears when the graph changes without focus moving:
  // the selection, and each year of a replay. The slider announces its own
  // value, so scrubbing by hand says nothing here — it would be said twice.
  const announcement = playing
    ? `${time.year}: ${visible.size} of ${graph.nodes.length} nodes`
    : shownSelected
      ? `Selected ${inspected.title ?? inspected.label}, ${kindLabel(inspected)}`
      : ''

  const selectNode = (id: string) => {
    setSelected(id)
    setFocused(id)
  }

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
    <div className={GRAPH_COLUMNS}>
      <div className="min-w-0">
        <div
          className="relative aspect-square w-full max-md:overflow-hidden md:aspect-(--frame-aspect)"
          style={BOX_STYLE}
          onFocus={() => setFocusWithin(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false)
          }}
        >
          <div className="absolute top-(--stage-top) left-(--stage-left) h-(--stage-h) w-(--stage-w) md:inset-0 md:h-full md:w-full">
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
            phoneSides={phoneSides}
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
          </div>
          <p id={instructionsId} className="sr-only">
            Arrow keys move between nodes: left and right around a ring, up and down between rings. Home
            returns to the centre. Enter selects a node; Escape clears the selection.
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
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

      {/*
        Beside the graph on a desktop; under it on a phone, where it always
        shows the centre and a selection opens the sheet instead (D-050).
      */}
      {phone ? (
        <Inspector
          node={centre}
          selection={false}
          groups={connections(index, 'me', visible)}
          work={allWork(index, visible)}
          titleId={titleId}
          onSelect={selectNode}
          onClear={() => setSelected(null)}
        />
      ) : (
        <Inspector
          node={inspected}
          selection={shownSelected !== null}
          groups={connections(index, inspected.id, visible)}
          work={inspected.kind === 'me' ? allWork(index, visible) : null}
          titleId={titleId}
          onSelect={selectNode}
          onClear={() => setSelected(null)}
        />
      )}

      <InspectorSheet
        open={phone && shownSelected !== null}
        label={inspected.title ?? inspected.label}
        onClose={() => setSelected(null)}
      >
        <Inspector
          node={inspected}
          selection
          sheet
          groups={connections(index, inspected.id, visible)}
          work={inspected.kind === 'me' ? allWork(index, visible) : null}
          titleId={sheetTitleId}
          onSelect={selectNode}
          onClear={() => setSelected(null)}
        />
      </InspectorSheet>
    </div>
  )
}
