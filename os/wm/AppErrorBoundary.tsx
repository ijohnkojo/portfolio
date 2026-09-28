'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  appId: string
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Crash containment, not security (design doc §5: "sandboxing theater").
 * It is all our own code, so the only thing worth isolating is a thrown render
 * — one broken app must not take down the session.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[kernel] app '${this.props.appId}' crashed`, error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="h-full overflow-auto bg-red-950/40 p-4 font-mono text-xs text-red-200">
        <p className="mb-2 font-semibold">
          {this.props.appId}: segmentation fault
        </p>
        <pre className="whitespace-pre-wrap break-words opacity-80">
          {error.message}
        </pre>
        <button
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded border border-red-400/40 px-2 py-1 hover:bg-red-400/10"
        >
          restart
        </button>
      </div>
    )
  }
}
