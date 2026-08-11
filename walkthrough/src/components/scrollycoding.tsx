import { Block, CodeBlock, parseRoot } from "codehike/blocks"
import { z } from "zod"
import type { MDXContent } from "mdx/types"
import { Mermaid } from "./mermaid"
import { CodePanel } from "./code-panel"
import { ScrollyLayout } from "./scrolly-layout"

const Schema = Block.extend({
  intro: Block,
  steps: z.array(Block.extend({ code: CodeBlock })),
  outro: Block,
})

export function ScrollycodingChapter({
  Content: Mdx,
  backHref = "/",
}: {
  Content: MDXContent
  backHref?: string
}) {
  const { intro, steps, outro } = parseRoot(Mdx, Schema)
  const stepViews = steps.map((step, i) => ({
    title: String(step.title ?? ""),
    body: step.children,
    panel: (
      <div key={String(step.title ?? i)}>
        {step.code.lang === "mermaid" ? (
          <div className="kv-panel-figure kv-panel-figure--diagram">
            <Mermaid chart={step.code.value} />
          </div>
        ) : (
          <CodePanel codeblock={step.code} />
        )}
      </div>
    ),
  }))

  return (
    <ScrollyLayout
      backHref={backHref}
      introTitle={String(intro.title ?? "")}
      introBody={intro.children}
      steps={stepViews}
      outroTitle={String(outro.title ?? "")}
      outroBody={outro.children}
    />
  )
}
