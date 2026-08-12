import type { Metadata } from 'next'

import { OsShell } from './OsShell'

export const metadata: Metadata = {
  title: 'personal-os',
  description: 'A mock operating system, client-rendered on top of a small kernel.',
}

export default function OsPage() {
  return <OsShell />
}
