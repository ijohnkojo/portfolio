import type { Metadata } from 'next'

import { EntryList } from '@/components/entry'
import { listEntries } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Presentations',
  description: 'Talks and posters.',
}

export default function PresentationsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Presentations</h1>
      <EntryList entries={listEntries('presentations')} />
    </div>
  )
}
