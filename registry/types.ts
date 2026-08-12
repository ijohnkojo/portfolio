import type { ComponentType } from 'react'
import type { AppIdentity, KernelAPI } from '@/kernel'

/** Props every app receives. The kernel handle is already scoped to its manifest. */
export interface AppProps {
  pid: number
  args: string[]
  kernel: KernelAPI
}

/**
 * Design doc §3. Extends the kernel's AppIdentity so the syscall boundary only
 * ever sees `{ id, permissions }` and stays free of React types.
 */
export interface AppManifest extends AppIdentity {
  name: string
  icon: string
  component: ComponentType<AppProps>
  /**
   * Mime types this app can open, e.g. `['text/markdown', 'image/*']`.
   * `findHandlerFor` uses these to resolve `open <file>` to an app, so a new
   * file type is a manifest edit rather than a change to the shell.
   */
  handles?: readonly string[]
}
