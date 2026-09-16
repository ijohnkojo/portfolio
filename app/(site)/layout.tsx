import Link from 'next/link'

/**
 * Chrome for the crawlable half of the site. `/os` sits outside this route
 * group deliberately — the OS is full-viewport and brings its own furniture.
 */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-6">
      <header className="flex items-center gap-6 py-8 font-mono text-sm">
        <Link href="/" className="font-medium tracking-tight">
          personal-os
        </Link>
        <nav className="flex items-center gap-4 text-neutral-500">
          <Link href="/about" className="hover:text-current">
            about
          </Link>
          <Link href="/projects" className="hover:text-current">
            projects
          </Link>
          <Link href="/papers" className="hover:text-current">
            papers
          </Link>
          <Link href="/presentations" className="hover:text-current">
            talks
          </Link>
          <Link href="/os" className="hover:text-current">
            /os
          </Link>
        </nav>
      </header>

      <main className="flex-1 py-8">{children}</main>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-200 py-8 font-mono text-xs text-neutral-500 dark:border-neutral-800">
        <a
          href="mailto:ijohnkojo@gmail.com"
          className="underline underline-offset-2 hover:text-current"
        >
          ijohnkojo@gmail.com
        </a>
        <a
          href="https://github.com/ijohnkojo"
          target="_blank"
          rel="noreferrer noopener"
          className="underline underline-offset-2 hover:text-current"
        >
          github
        </a>
        <span className="text-neutral-400 dark:text-neutral-600">
          built as an operating system — the shell is at{' '}
          <Link href="/os" className="underline underline-offset-2">
            /os
          </Link>
        </span>
      </footer>
    </div>
  )
}
