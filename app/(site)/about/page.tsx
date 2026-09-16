import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { HomeArticle } from '@/components/entry'
import { getHomeFile } from '@/lib/content'

const SOURCE = 'whoami.md'

export const metadata: Metadata = {
  title: 'About',
  description:
    'Michael Noamesi — physics and computer science at Gettysburg College, working where experimental particle physics meets the software that carries it.',
}

/**
 * The crawlable half of the bio. The shell's `whoami` prints the same file;
 * neither is the source of truth, `content/home/whoami.md` is.
 */
export default function AboutPage() {
  const file = getHomeFile(SOURCE)
  if (!file) notFound()

  return <HomeArticle file={file} />
}
