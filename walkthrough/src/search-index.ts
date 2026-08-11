import { allChapters, sectionById } from "./curriculum"
import { stepSlug } from "./step-slug"
import { walkthroughs } from "./walkthroughs"

export type SearchHit = {
  id: string
  kind: "chapter" | "step" | "walkthrough"
  sectionTitle: string
  chapterTitle: string
  stepTitle?: string
  /** Path + optional hash for a step. */
  href: string
  snippet: string
  /** Lowercased haystack for filtering. */
  haystack: string
}

const rawModules = import.meta.glob("./content/**/*.mdx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, unknown>

function asMdxSource(mod: unknown): string {
  return typeof mod === "string" ? mod : ""
}

function pathToHref(modulePath: string): string | null {
  const m = modulePath.match(/\.\/content\/(.+)\.mdx$/)
  if (!m) return null
  return `/${m[1]}`
}

function stripFences(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function snippetAround(text: string, query: string, radius = 72) {
  const lower = text.toLowerCase()
  const q = query.toLowerCase()
  const i = lower.indexOf(q)
  if (i < 0) return text.slice(0, radius * 2).trim()
  const start = Math.max(0, i - radius)
  const end = Math.min(text.length, i + q.length + radius)
  const slice = text.slice(start, end).trim()
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`
}

type ParsedStep = {
  title: string
  body: string
  slug: string
}

function parseMdx(raw: string): { introTitle: string; introBody: string; steps: ParsedStep[] } {
  const parts = raw.split(/^## /m).filter(Boolean)
  let introTitle = ""
  let introBody = ""
  const steps: { title: string; body: string }[] = []

  for (const part of parts) {
    const nl = part.indexOf("\n")
    const heading = (nl < 0 ? part : part.slice(0, nl)).trim()
    const body = nl < 0 ? "" : part.slice(nl + 1)
    if (heading.startsWith("!intro ")) {
      introTitle = heading.replace(/^!intro\s+/, "").trim()
      introBody = stripFences(body)
    } else if (heading.startsWith("!!steps ")) {
      steps.push({
        title: heading.replace(/^!!steps\s+/, "").trim(),
        body: stripFences(body),
      })
    }
  }

  const used = new Set<string>()
  return {
    introTitle,
    introBody,
    steps: steps.map((s, i) => ({
      ...s,
      slug: stepSlug(s.title, i, used),
    })),
  }
}

function buildIndex(): SearchHit[] {
  const rawByHref = new Map<string, string>()
  for (const [modulePath, mod] of Object.entries(rawModules)) {
    const href = pathToHref(modulePath)
    const raw = asMdxSource(mod)
    if (href && raw) rawByHref.set(href, raw)
  }

  const hits: SearchHit[] = []

  for (const chapter of allChapters()) {
    const section = sectionById(chapter.sectionId)
    const sectionTitle = section?.title ?? chapter.sectionId
    const raw = rawByHref.get(chapter.href) ?? ""
    const parsed = raw ? parseMdx(raw) : { introTitle: "", introBody: "", steps: [] as ParsedStep[] }
    const chapterTitle = chapter.title || parsed.introTitle

    const chapterText = [
      sectionTitle,
      chapterTitle,
      chapter.blurb,
      parsed.introBody,
      ...parsed.steps.map((s) => `${s.title} ${s.body}`),
    ].join(" ")

    hits.push({
      id: `chapter:${chapter.href}`,
      kind: "chapter",
      sectionTitle,
      chapterTitle,
      href: chapter.href,
      snippet: chapter.blurb,
      haystack: chapterText.toLowerCase(),
    })

    for (const step of parsed.steps) {
      const text = `${step.title} ${step.body}`
      hits.push({
        id: `step:${chapter.href}#${step.slug}`,
        kind: "step",
        sectionTitle,
        chapterTitle,
        stepTitle: step.title,
        href: `${chapter.href}#${step.slug}`,
        snippet: step.body.slice(0, 160),
        haystack: `${sectionTitle} ${chapterTitle} ${text}`.toLowerCase(),
      })
    }
  }

  for (const wt of walkthroughs) {
    const text = [wt.title, wt.blurb, ...wt.tags].join(" ")
    hits.push({
      id: `walkthrough:${wt.id}`,
      kind: "walkthrough",
      sectionTitle: "Walkthroughs",
      chapterTitle: wt.title,
      href: wt.href,
      snippet: wt.blurb,
      haystack: text.toLowerCase(),
    })
  }

  return hits
}

const INDEX = buildIndex()

export function searchCurriculum(query: string, limit = 12): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (q.length < 2) return []

  const terms = q.split(/\s+/).filter(Boolean)
  const scored: { hit: SearchHit; score: number; snippet: string }[] = []

  for (const hit of INDEX) {
    if (!terms.every((t) => hit.haystack.includes(t))) continue

    let score = 0
    const titleBits = [
      hit.sectionTitle,
      hit.chapterTitle,
      hit.stepTitle ?? "",
    ]
      .join(" ")
      .toLowerCase()

    for (const t of terms) {
      if (hit.stepTitle?.toLowerCase().includes(t)) score += 12
      if (hit.chapterTitle.toLowerCase().includes(t)) score += 8
      if (hit.sectionTitle.toLowerCase().includes(t)) score += 4
      if (titleBits.includes(t)) score += 2
      if (hit.haystack.includes(t)) score += 1
    }
    if (hit.kind === "step") score += 1
    if (hit.kind === "walkthrough") score += 2

    const snippetSource =
      hit.kind === "step"
        ? `${hit.stepTitle ?? ""} ${hit.snippet}`
        : `${hit.chapterTitle} ${hit.snippet}`
    scored.push({
      hit,
      score,
      snippet: snippetAround(snippetSource, terms[0] ?? q),
    })
  }

  scored.sort((a, b) => b.score - a.score || a.hit.chapterTitle.localeCompare(b.hit.chapterTitle))
  return scored.slice(0, limit).map(({ hit, snippet }) => ({ ...hit, snippet }))
}
