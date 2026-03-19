import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  override state: State = {
    error: null,
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,_#f8f5ef_0%,_#efe7da_100%)] px-6">
          <div className="max-w-xl rounded-[28px] border border-rose-200 bg-white/95 p-6 shadow-[0_24px_90px_-60px_rgba(15,23,42,0.65)]">
            <h1 className="text-xl font-semibold text-slate-950">Frontend-Fehler</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Die App ist beim Start abgestuerzt. Die genaue Meldung steht unten.
            </p>
            <pre className="mt-4 overflow-auto rounded-2xl bg-slate-950 p-4 text-sm text-slate-100">
              {this.state.error.message}
            </pre>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
