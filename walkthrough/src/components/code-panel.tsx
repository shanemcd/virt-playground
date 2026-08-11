import { useEffect, useState } from "react"
import { Pre, RawCode, highlight, HighlightedCode } from "codehike/code"
import { tokenTransitions } from "./annotations/token-transitions"
import { callout } from "./annotations/callout"
import { focus } from "./annotations/focus"

export function CodePanel({ codeblock }: { codeblock: RawCode }) {
  const [highlighted, setHighlighted] = useState<HighlightedCode | null>(null)

  useEffect(() => {
    let cancelled = false
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
      <Pre
        code={highlighted}
        handlers={[tokenTransitions, callout, focus]}
        className="kv-code-pre"
      />
    </div>
  )
}
