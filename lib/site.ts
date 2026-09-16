/**
 * Site-wide constants. One place, because the URL appears in `metadataBase`,
 * the sitemap, and robots.txt, and three copies would drift.
 *
 * `.dev` is on the HSTS preload list — the whole TLD is HTTPS-only, with no
 * insecure fallback for a browser to follow. An `http://` URL here is not
 * redirected, it simply fails, so the scheme is not a detail.
 */
export const SITE_URL = 'https://ijohnkojo.dev'

export const SITE_NAME = 'Michael Noamesi'

/**
 * PLACEHOLDER — rewrite. This is the meta description: it is what shows under
 * the link in a search result, so it is worth one honest sentence in your own
 * words rather than this one.
 */
export const SITE_DESCRIPTION =
  'Michael Noamesi — physics and computer science at Gettysburg College.'
