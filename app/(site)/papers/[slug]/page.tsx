import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EntryArticle } from '@/components/entry'
import { getEntry, listEntries } from '@/lib/content'

/** Turns every published paper into a static route at build time. */
export function generateStaticParams() {
  return listEntries('papers').map((entry) => ({ slug: entry.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/papers/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const entry = getEntry('papers', slug)
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

export default async function PaperPage({ params }: PageProps<'/papers/[slug]'>) {
  const { slug } = await params
  const entry = getEntry('papers', slug)
  if (!entry) notFound()

  return <EntryArticle entry={entry} />
}
