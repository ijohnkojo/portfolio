/**
 * What opening a node *means*.
 *
 * Three surfaces want this answer — the shell's `open`, the desktop, and the
 * file manager. They have to agree about applications and files, and they
 * genuinely disagree about directories: the shell errors, the desktop opens
 * Files, Files descends. So the resolution lives here and the opinion about
 * folders stays with each caller — `launchFor` returns null for a directory
 * rather than pretending there is one right answer.
 *
 * Pure, and deliberately separate from `index.tsx` for the same reason
 * `handlers.ts` is: that module imports `next/dynamic` and so cannot be loaded
 * in a node test. The mime resolver arrives as an argument rather than an
 * import, which is what lets `commands/` use this without dragging the registry
 * into a module that has to keep running in bare node.
 *
 * This is the answer to [D-015](../docs/decisions.md)'s revisit trigger: the
 * constraint was never the number of consumers, so a kernel-level table would
 * put app knowledge in the kernel to serve callers that do not need it.
 */
import { basename, type KernelAPI, type VFSNode } from '@/os/kernel'

export type Launch =
  /** An application node. One window per app — focus it if it is already open. */
  | { kind: 'app'; appId: string }
  /** A file, handed to whatever declared its mime type. A second copy is fine. */
  | { kind: 'file'; appId: string; path: string }
  /** Nothing in the registry claims this type. */
  | { kind: 'unhandled'; mime: string }

/**
 * Text this OS can edit in place.
 *
 * Two conditions, and the second is the one that bites: the mime has to be text
 * *and* the bytes have to be in the filesystem. An asset-backed node lives in
 * `/public` ([D-012](../docs/decisions.md)) and there is nothing here to edit.
 */
const EDITABLE_MIMES = ['text/markdown', 'text/plain', 'application/json']

export function isEditable(node: VFSNode): boolean {
  return node.type === 'file' && EDITABLE_MIMES.includes(node.mime) && node.content !== undefined
}

/** Null for a directory: the caller decides what descending means. */
export function launchFor(
  path: string,
  node: VFSNode,
  resolve: (mime: string) => string | null
): Launch | null {
  if (node.type === 'dir') return null
  if (node.type === 'app') return { kind: 'app', appId: node.appId }

  const appId = resolve(node.mime)
  return appId ? { kind: 'file', appId, path } : { kind: 'unhandled', mime: node.mime }
}

/**
 * Carry it out, returning the pid — of the new window, or of the instance that
 * was focused instead. Null when nothing could be opened.
 *
 * `nameFor` supplies an application's window title, injected for the same
 * reason the mime resolver is: the display name lives on the manifest, and this
 * module does not import the registry.
 *
 * The shell's `open` deliberately does *not* use this. It has to distinguish
 * "started as pid 2" from "already running as pid 2" in its output, and that
 * reporting is shell business — it shares the resolution above, not this.
 */
export function performLaunch(
  kernel: KernelAPI,
  launch: Launch,
  nameFor: (appId: string) => string
): number | null {
  if (launch.kind === 'unhandled') return null

  if (launch.kind === 'file') {
    return kernel.proc.spawn(launch.appId, [launch.path], basename(launch.path))
  }

  // Topmost instance, not the lowest pid — the one last looked at.
  const running = kernel.proc
    .list()
    .filter((process) => process.appId === launch.appId)
    .sort((a, b) => b.zIndex - a.zIndex)[0]

  if (running) {
    kernel.proc.focus(running.pid)
    return running.pid
  }

  return kernel.proc.spawn(launch.appId, [], nameFor(launch.appId))
}
