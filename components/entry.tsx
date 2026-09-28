import Link from 'next/link'
import { MDXRemote } from 'next-mdx-remote/rsc'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'

import type { Entry, HomeFile } from '@/lib/content'
import { Prose, mdxComponents } from './mdx'

const mdxOptions = {
  mdxOptions: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [rehypeSlug],
  },
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * One entry, rendered as a document. Deliberately not styled like the OS — a
 * crawlable page should read as a paper, not as a screenshot of an app.
 */
export function EntryArticle({ entry }: { entry: Entry }) {
  return (
    <article>
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {entry.title}
        </h1>
        <p className="mt-3 max-w-[60ch] text-neutral-600 dark:text-neutral-400">
          {entry.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-neutral-500">
          <time dateTime={entry.date}>{formatDate(entry.date)}</time>
          {entry.tags.map((tag) => (
            <span key={tag}>
              #{tag}
            </span>
          ))}
        </div>
      </header>

      <Prose>
        <MDXRemote source={entry.body} components={mdxComponents} options={mdxOptions} />
      </Prose>

      <footer className="mt-16 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <p className="font-mono text-xs text-neutral-500">
          Also readable inside the OS at{' '}
          <Link href="/os" prefetch={false} className="underline underline-offset-2">
            {entry.vfsPath}
          </Link>
        </p>
      </footer>
    </article>
  )
}

/**
 * A loose `content/home` file rendered as a page — the web half of what
 * `whoami` prints in the shell.
 *
 * Unlike an entry it carries no frontmatter header, because its own first line
 * is already a heading; `[&>*:first-child]:mt-0` pulls that heading up to the
 * top of the page, since the MDX map spaces headings for the middle of a
 * document rather than the start of one.
 */
export function HomeArticle({ file }: { file: HomeFile }) {
  return (
    <article>
      <Prose>
        <div className="[&>*:first-child]:mt-0">
          <MDXRemote source={file.body} components={mdxComponents} options={mdxOptions} />
        </div>
      </Prose>

      <footer className="mt-16 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <p className="font-mono text-xs text-neutral-500">
          The same file inside the OS at{' '}
          <Link href="/os" prefetch={false} className="underline underline-offset-2">
            {file.vfsPath}
          </Link>
        </p>
      </footer>
    </article>
  )
}

/** Listing row. Used by the collection index pages and the landing page. */
export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <li>
      <Link href={entry.href} className="group block py-4">
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium tracking-tight group-hover:underline underline-offset-4">
            {entry.title}
          </h3>
          <time
            dateTime={entry.date}
            className="shrink-0 font-mono text-xs text-neutral-500"
          >
            {entry.date}
          </time>
        </div>
        <p className="mt-1 max-w-[60ch] text-sm text-neutral-600 dark:text-neutral-400">
          {entry.summary}
        </p>
      </Link>
    </li>
  )
}

export function EntryList({ entries }: { entries: Entry[] }) {
  if (entries.length === 0) {
    return (
      <p className="py-4 font-mono text-sm text-neutral-500">Nothing published yet.</p>
    )
  }

  return (
    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
      {entries.map((entry) => (
        <EntryCard key={entry.href} entry={entry} />
      ))}
    </ul>
  )
}
