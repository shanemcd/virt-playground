import { CodePanel } from "./code-panel"
import { Mermaid } from "./mermaid"
import type { RawCode } from "codehike/code"

/** MDX `<Code />` from Code Hike fences outside scrolly steps. */
export function Code({ codeblock }: { codeblock: RawCode }) {
  if (codeblock.lang === "mermaid") {
    return (
      <div className="kv-panel-figure kv-panel-figure--diagram">
        <Mermaid chart={codeblock.value} />
      </div>
    )
  }
  return <CodePanel codeblock={codeblock} />
}
