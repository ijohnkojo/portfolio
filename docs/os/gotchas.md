> **Frozen 2026-09-27.** The OS is now a separate project in
> [`os/`](../../os/), kept as it was while the site is rebuilt around a
> knowledge graph ([D-037](../decisions.md)). This document describes the OS as
> of the freeze and is not maintained until OS work resumes. Paths written
> before the move omit the `os/` prefix: `kernel/` is now `os/kernel/`, and
> `app/os/OsShell.tsx` is `os/OsShell.tsx`. Open work is in
> [backlog.md](backlog.md).

## Will the product be performance nominal on web?
Yes, with the stack as described — but “light” isn’t automatic, it’s a function of a few specific choices. Here’s what actually determines it:
What keeps it light (already in your plan)
Next.js SSG for content routes means papers/projects load fast and don’t touch the OS runtime at all
Lazy-loading apps through the registry means the initial bundle is just kernel + WM + taskbar, not every app you’ll ever build
xterm.js is genuinely performant — it’s what VS Code’s web terminal uses, handles scrollback fine
A DOM-based WM (not canvas) is lighter for windows/text/UI; browsers are very good at compositing absolutely-positioned divs with transform
Where it actually gets heavy — the real risks
Dragging a window by re-rendering React state on every mousemove instead of using transform: translate() + committing to state only on drag-end. This is the #1 cause of janky window dragging in these projects.
Zustand selectors that aren’t scoped — if every window subscribes to the whole process table instead of just its own entry, every window re-renders on every window’s move/resize
Event bus listeners that never get cleaned up on unmount (classic leak — kills a session that’s been open a while)
A canvas game running its own requestAnimationFrame loop while the WM is also re-rendering that window’s chrome on every frame — keep the canvas’s internal loop isolated from React’s render cycle
Too many windows open with complex DOM apps inside (e.g. a PDF viewer per window) — each one is a live component tree, not a frozen screenshot
The one habit that prevents most of this Treat window position/size as a ref during drag, and only sync to Zustand state on mouse-up. Live drag = local/imperative, persisted position = state. This single pattern is what separates a smooth WM from a laggy one.
None of this requires exotic tooling — it’s standard React performance hygiene applied to a slightly unusual layout problem. At your content scale (portfolio, not thousands of files/windows), you have real headroom even if you get some of this wrong on the first pass.
