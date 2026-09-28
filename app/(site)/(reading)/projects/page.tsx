import type { Metadata } from 'next'

import { EntryList } from '@/components/entry'
import { listEntries } from '@/lib/content'

export const metadata: Metadata = {
  title: 'Projects',
  description: 'Things built.',
}

export default function ProjectsPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Projects</h1>
      <EntryList entries={listEntries('projects')} />
    </div>
  )
}
