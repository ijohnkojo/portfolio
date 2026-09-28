import Link from 'next/link'

/**
 * Chrome for the site. `/os` sits outside this route group deliberately — the
 * OS is full-viewport and brings its own furniture.
 *
 * The width is set per region rather than once for the page: the header and
 * footer keep the reading width everywhere, pages in `(reading)/` get the same
 * column, and the home page sets its own so the graph can be wider than the
 * text around it (D-043). Everything is centred, so the wider graph still
 * lines up with the header above it.
 */
export default function SiteLayout({ children }: LayoutProps<'/'>) {
  return (
    <div className="flex min-h-dvh w-full flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center gap-6 px-6 py-8 font-mono text-sm">
        {/*
          `home`, not a brand: the site is the person's work, and the page
          heading already says whose. `personal-os` is the OS project's title
          now, not the site's (D-037).
        */}
        <Link href="/" className="font-medium tracking-tight">
          home
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
        </nav>
      </header>

      <main className="flex-1 py-8">{children}</main>

      <footer className="mx-auto w-full max-w-3xl px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-neutral-200 py-8 font-mono text-xs text-neutral-500 dark:border-neutral-800">
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
        </div>
      </footer>
    </div>
  )
}
