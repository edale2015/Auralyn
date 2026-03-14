import { Component, type ReactNode } from "react"

type Props = { children: ReactNode; fallback?: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return this.props.fallback ?? (
        <div className="p-8 text-center text-muted-foreground">
          <p className="text-sm font-medium text-red-600 mb-2">Something went wrong</p>
          <p className="text-xs">{this.state.error.message}</p>
          <button
            className="mt-4 text-xs underline"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
