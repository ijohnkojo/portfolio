import type { Metadata } from 'next'

import { EntryList } from '@/components/entry'
import { listEntries } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Papers',
  description: 'Things written.',
}

export default function PapersPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Papers</h1>
      <EntryList entries={listEntries('papers')} />
    </div>
  )
}
