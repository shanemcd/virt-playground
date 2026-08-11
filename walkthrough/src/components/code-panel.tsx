import { Component, useEffect, useState, type ReactNode } from "react"
import { Pre, RawCode, highlight, HighlightedCode } from "codehike/code"
import { tokenTransitions } from "./annotations/token-transitions"
import { callout } from "./annotations/callout"
import { focus } from "./annotations/focus"

class CodeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

export function CodePanel({ codeblock }: { codeblock: RawCode }) {
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null)

  useEffect(() => {
    let cancelled = false
    setHighlighted(null)
    highlight(codeblock, "github-light").then((result) => {
      if (!cancelled) setHighlighted(result)
    })
    return () => {
      cancelled = true
    }
  }, [codeblock])

  if (!highlighted) {
    return <div className="kv-mermaid-loading">Loading code…</div>
  }

  return (
    <div className="kv-panel-figure kv-panel-figure--code">
      <CodeErrorBoundary
        fallback={
          <pre className="kv-code-pre kv-code-fallback">{codeblock.value}</pre>
        }
      >
        <Pre
          code={highlighted}
          handlers={[tokenTransitions, callout, focus]}
          className="kv-code-pre"
        />
      </CodeErrorBoundary>
    </div>
  )
}
