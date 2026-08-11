export type Walkthrough = {
  id: string
  title: string
  blurb: string
  /** Only ready walkthroughs are listed — no outline placeholders. */
  status: "ready"
  tags: string[]
  relatedChapterHrefs?: string[]
  href: string
}

function wt(
  id: string,
  fields: Omit<Walkthrough, "id" | "href">,
): Walkthrough {
  return { id, href: `/walkthroughs/${id}`, ...fields }
}

/** Targeted deep dives — only ship entries that have real content. */
export const walkthroughs: Walkthrough[] = [
  wt("cmd-socket", {
    title: "Tracing the Cmd socket",
    blurb:
      "Handler ↔ launcher gRPC: the protobuf contract, where launcher-sock lives, how virt-handler dials it on the node, and what SyncVirtualMachine looks like when deployed.",
    status: "ready",
    tags: ["handler", "launcher", "grpc", "sockets"],
    relatedChapterHrefs: [
      "/foundations/node-path",
      "/platform/metrics",
      "/contribute/api-gates-generate",
    ],
  }),
]

export function walkthroughById(id: string): Walkthrough | undefined {
  return walkthroughs.find((w) => w.id === id)
}

export function walkthroughByPath(pathname: string): Walkthrough | null {
  const normalized = pathname.replace(/\/$/, "") || "/"
  return (
    walkthroughs.find(
      (w) => normalized === w.href || normalized.startsWith(`${w.href}/`),
    ) ?? null
  )
}
