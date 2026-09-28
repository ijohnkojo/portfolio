import type { Metadata } from 'next'

import { buildVFSTree } from '@/os/vfsTree'
import { OsShell } from '@/os/OsShell'

export const metadata: Metadata = {
  title: 'personal-os',
  description: 'A mock operating system, client-rendered on top of a small kernel.',
}

/**
 * Server component: builds the VFS from disk at build time and hands it to the
 * client shell. Drafts are included — hidden from the web, not from the OS.
 */
export default function OsPage() {
  return <OsShell tree={buildVFSTree()} />
}
