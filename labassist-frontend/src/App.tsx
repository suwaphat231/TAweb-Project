import { Component, type ReactNode, type ErrorInfo } from 'react'
import { ToastProvider } from './components/ui/Toast'
import { AppRouter } from './router'

interface State { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(e: Error): State { return { error: e } }
  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('React ErrorBoundary caught:', e, info)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#DC2626', background: '#FEF2F2', minHeight: '100vh' }}>
          <h2 style={{ marginBottom: 12 }}>Runtime Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>
            {this.state.error.message}{'\n\n'}{this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppRouter />
      </ToastProvider>
    </ErrorBoundary>
  )
}
