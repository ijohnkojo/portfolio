import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EntryArticle } from '@/components/entry'
import { getEntry, listEntries } from '@/lib/content'

/** Turns every published presentation into a static route at build time. */
export function generateStaticParams() {
  return listEntries('presentations').map((entry) => ({ slug: entry.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/presentations/[slug]'>): Promise<Metadata> {
  const { slug } = await params
  const entry = getEntry('presentations', slug)
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

export default async function PresentationPage({ params }: PageProps<'/presentations/[slug]'>) {
  const { slug } = await params
  const entry = getEntry('presentations', slug)
  if (!entry) notFound()

  return <EntryArticle entry={entry} />
}
