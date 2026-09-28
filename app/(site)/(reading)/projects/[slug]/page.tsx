import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EntryArticle } from '@/components/entry'
import { getEntry, listEntries } from '@/lib/content'

/** Turns every published project into a static route at build time. */
export function generateStaticParams() {
  return listEntries('projects').map((entry) => ({ slug: entry.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/projects/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const entry = getEntry('projects', slug)
  if (!entry) return {}

  return {
    title: entry.title,
    description: entry.summary,
    openGraph: {
      title: entry.title,
      description: entry.summary,
      type: 'article',
      publishedTime: entry.date,
    },
  }
}

export default async function ProjectPage({ params }: PageProps<'/projects/[slug]'>) {
  const { slug } = await params
  const entry = getEntry('projects', slug)
  if (!entry) notFound()

  return <EntryArticle entry={entry} />
}
