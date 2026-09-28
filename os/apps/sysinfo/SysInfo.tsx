'use client'

/**
 * A second app, mostly so the registry's code splitting is observable: its
 * chunk should appear in the network tab on first spawn, not on page load.
 *
 * It also doubles as the system's own `neofetch` — a live view of what the
 * kernel is holding.
 */
import { SCHEMA_VERSION, type VFSNode } from '@/os/kernel'
import { usePids } from '@/os/hooks/kernel'
import type { AppProps } from '@/os/registry'

function countNodes(node: VFSNode): number {
  if (node.type !== 'dir') return 1
  return 1 + Object.values(node.children).reduce((n, c) => n + countNodes(c), 0)
}

export default function SysInfo({ pid, kernel }: AppProps) {
  const pids = usePids()
  const root = kernel.fs.stat('/')

  const rows: Array<[string, string]> = [
    ['schema', `v${SCHEMA_VERSION}`],
    ['pid', String(pid)],
    ['processes', String(pids.length)],
    ['vfs nodes', root ? String(countNodes(root)) : '—'],
    ['/projects', `${kernel.fs.list('/projects').length} entries`],
    ['/papers', `${kernel.fs.list('/papers').length} entries`],
    ['/apps', `${kernel.fs.list('/apps').length} registered`],
  ]

  return (
    <div className="p-5 font-mono text-[13px]">
      <table className="border-separate border-spacing-x-4 border-spacing-y-1">
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td className="text-neutral-500">{label}</td>
              <td className="text-neutral-200">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
