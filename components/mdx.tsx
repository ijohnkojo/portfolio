import Link from 'next/link'
import type { ComponentPropsWithoutRef, ReactNode } from 'react'

/**
 * The shared MDX component map — a hand-rolled typographic treatment rather
 * than @tailwindcss/typography, because this is the reading surface of the
 * portfolio and every value in it should be a decision.
 *
 * This is also the seam where a writeup's own components get registered: add
 * them here and any .mdx file can use them by name.
 */

function Anchor({ href = '', ...props }: ComponentPropsWithoutRef<'a'>) {
  const internal = href.startsWith('/')
  const className =
    'underline decoration-neutral-400 underline-offset-[3px] hover:decoration-current dark:decoration-neutral-600'

  if (internal) return <Link href={href} className={className} {...props} />
  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noreferrer noopener"
      {...props}
    />
  )
}

export const mdxComponents = {
  a: Anchor,

  h1: (p: ComponentPropsWithoutRef<'h1'>) => (
    <h1 className="mt-12 mb-4 text-2xl font-semibold tracking-tight" {...p} />
  ),
  h2: (p: ComponentPropsWithoutRef<'h2'>) => (
    <h2
      className="mt-12 mb-3 scroll-mt-24 text-lg font-semibold tracking-tight"
      {...p}
    />
  ),
  h3: (p: ComponentPropsWithoutRef<'h3'>) => (
    <h3
      className="mt-8 mb-2 scroll-mt-24 text-base font-semibold tracking-tight"
      {...p}
    />
  ),

  p: (p: ComponentPropsWithoutRef<'p'>) => (
    <p className="my-4 leading-7 text-neutral-700 dark:text-neutral-300" {...p} />
  ),

  ul: (p: ComponentPropsWithoutRef<'ul'>) => (
    <ul
      className="my-4 list-disc space-y-1.5 pl-6 text-neutral-700 marker:text-neutral-400 dark:text-neutral-300"
      {...p}
    />
  ),
  ol: (p: ComponentPropsWithoutRef<'ol'>) => (
    <ol
      className="my-4 list-decimal space-y-1.5 pl-6 text-neutral-700 marker:text-neutral-400 dark:text-neutral-300"
      {...p}
    />
  ),
  li: (p: ComponentPropsWithoutRef<'li'>) => <li className="leading-7" {...p} />,

  blockquote: (p: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="my-6 border-l-2 border-neutral-300 pl-4 text-neutral-600 italic dark:border-neutral-700 dark:text-neutral-400"
      {...p}
    />
  ),

  // Inline code. Fenced blocks arrive as <pre><code>, styled on the <pre>.
  code: (p: ComponentPropsWithoutRef<'code'>) => (
    <code
      className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[0.85em] text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200"
      {...p}
    />
  ),
  pre: (p: ComponentPropsWithoutRef<'pre'>) => (
    <pre
      className="my-6 overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 font-mono text-[13px] leading-6 dark:border-neutral-800 dark:bg-neutral-900 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit"
      {...p}
    />
  ),

  // Wide tables scroll inside their own container instead of the page.
  table: (p: ComponentPropsWithoutRef<'table'>) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...p} />
    </div>
  ),
  th: (p: ComponentPropsWithoutRef<'th'>) => (
    <th
      className="border-b border-neutral-300 pr-4 pb-2 font-semibold dark:border-neutral-700"
      {...p}
    />
  ),
  td: (p: ComponentPropsWithoutRef<'td'>) => (
    <td
      className="border-b border-neutral-200 py-2 pr-4 align-top text-neutral-700 dark:border-neutral-800 dark:text-neutral-300"
      {...p}
    />
  ),

  hr: () => <hr className="my-10 border-neutral-200 dark:border-neutral-800" />,
}

/** Reading measure. Everything long-form goes inside this. */
export function Prose({ children }: { children: ReactNode }) {
  return <div className="max-w-[68ch]">{children}</div>
}
