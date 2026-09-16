import type { MetadataRoute } from 'next'

import { listAllPublished } from '@/lib/content'
import { SITE_URL } from '@/lib/site'

/**
 * Built from the same `content/` read as everything else, so a writeup cannot
 * be published and left out of the sitemap — or listed here while still a
 * draft. `listAllPublished()` already filters drafts, which is the whole
 * guarantee.
 *
 * `/os` is included deliberately: it is a real route with a real URL, even
 * though what it renders is an application rather than prose.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = ['', '/about', '/projects', '/papers', '/presentations', '/os'].map(
    (route) => ({
      url: `${SITE_URL}${route}`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: route === '' ? 1 : 0.8,
    })
  )

  const entries = listAllPublished().map((entry) => ({
    url: `${SITE_URL}${entry.href}`,
    lastModified: new Date(`${entry.date}T00:00:00Z`),
    changeFrequency: 'yearly' as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...entries]
}
