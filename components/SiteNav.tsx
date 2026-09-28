'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { NAV, navState } from '@/lib/nav'

/**
 * The header's links, with the one for the current page lit — `home` on the
 * home page, `projects` on a project, and so on. A client component only
 * because it reads the path; the rule is `navState` in lib/nav.ts. The exact
 * page gets `aria-current="page"`, a page inside a section `aria-current="true"`.
 */
export function SiteNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Site" className="flex items-center gap-4">
      {NAV.map(({ href, label }, i) => {
        const state = navState(pathname, href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={state === 'page' ? 'page' : state === 'section' ? 'true' : undefined}
            className={[
              i === 0 ? 'mr-2' : '',
              state
                ? 'font-medium text-neutral-950 dark:text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-950 dark:hover:text-neutral-50',
            ].join(' ')}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
