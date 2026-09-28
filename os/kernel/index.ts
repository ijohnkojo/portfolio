/**
 * Kernel barrel. Everything under /kernel is plain TypeScript with no React
 * import — the state graph is serializable and framework-agnostic on its own
 * (design doc §2). React bindings live in /hooks.
 */
export * from './vfs'
export * from './process'
export * from './events'
export * from './api'
export * from './persistence'
