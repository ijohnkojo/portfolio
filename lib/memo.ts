/**
 * Read once per process in production, fresh every time in development — so
 * editing a writeup shows up without restarting the dev server.
 */
export function memo<T>(fn: () => T): () => T {
  if (process.env.NODE_ENV === 'development') return fn
  let value: T
  let filled = false
  return () => {
    if (!filled) {
      value = fn()
      filled = true
    }
    return value
  }
}
