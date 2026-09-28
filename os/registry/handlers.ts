/**
 * Mime → app resolution. Pure, and deliberately separate from `index.tsx`,
 * which imports `next/dynamic` and so cannot be loaded in a node test.
 *
 * The data lives on the manifests; this is only the matching rule.
 */

export interface HandlerDeclaration {
  id: string
  handles?: readonly string[]
}

/**
 * Which app opens this mime type, if any.
 *
 * An exact declaration always beats a `type/*` wildcard regardless of
 * registration order, so an app can claim `image/png` specifically without
 * having to out-rank a general image viewer. Returns null when nothing handles
 * it, which lets `open` degrade to naming the missing handler.
 */
export function findHandlerFor(
  mime: string,
  apps: readonly HandlerDeclaration[]
): string | null {
  let wildcard: string | null = null

  for (const app of apps) {
    for (const pattern of app.handles ?? []) {
      if (pattern === mime) return app.id
      if (pattern.endsWith('/*') && mime.startsWith(pattern.slice(0, -1))) {
        wildcard ??= app.id
      }
    }
  }

  return wildcard
}
