/**
 * The site's header links, and which one the current page belongs to. Pure,
 * so the rule is tested in bare node (AGENTS.md invariant 2); the header's
 * client component only reads the path and renders.
 */

export interface NavLink {
  href: string
  label: string
}

export const NAV: readonly NavLink[] = [
  { href: '/', label: 'home' },
  { href: '/about', label: 'about' },
  { href: '/projects', label: 'projects' },
  { href: '/papers', label: 'papers' },
  { href: '/presentations', label: 'talks' },
]

/**
 * Where `pathname` stands relative to a link: on its page exactly, inside its
 * section (a writeup under `/projects`), or elsewhere. Home is a page, never a
 * section — every path starts with `/`.
 */
export function navState(pathname: string, href: string): 'page' | 'section' | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === href) return 'page'
  if (href !== '/' && path.startsWith(`${href}/`)) return 'section'
  return null
}
