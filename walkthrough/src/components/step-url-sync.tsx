import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useSelectedIndex } from "codehike/utils/selection"

function scrollStepIntoView(slug: string) {
  const el = document.getElementById(slug)
  const root = document.querySelector(".pf-v6-c-page__main") as HTMLElement | null
  if (el && root) {
    const top =
      el.getBoundingClientRect().top -
      root.getBoundingClientRect().top +
      root.scrollTop -
      root.clientHeight * 0.28
    root.scrollTo({ top: Math.max(0, top), behavior: "instant" })
    return
  }
  el?.scrollIntoView({ block: "center", behavior: "instant" })
}

/** Keep the active scrolly step in the URL hash and restore it on load. */
export function StepUrlSync({ slugs }: { slugs: string[] }) {
  const [selectedIndex, setSelectedIndex] = useSelectedIndex()
  const location = useLocation()
  const navigate = useNavigate()
  /** Hash we last wrote from selection — ignore those in the restore path. */
  const writtenHash = useRef<string | null>(null)
  /** While restoring, ignore scroll-driven selection churn. */
  const restoring = useRef(false)
  const didInitialRestore = useRef(false)

  const restore = (hash: string) => {
    const i = slugs.indexOf(hash)
    if (i < 0) return
    restoring.current = true
    writtenHash.current = `#${hash}`
    setSelectedIndex(i)
    requestAnimationFrame(() => {
      scrollStepIntoView(hash)
      window.setTimeout(() => {
        restoring.current = false
        setSelectedIndex(i)
      }, 120)
    })
  }

  useEffect(() => {
    const onPopState = () => {
      const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""))
      if (hash) restore(hash)
    }

    if (!didInitialRestore.current) {
      didInitialRestore.current = true
      const hash = decodeURIComponent(location.hash.replace(/^#/, ""))
      if (hash) restore(hash)
    }

    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per mount + popstate
  }, [slugs, setSelectedIndex])

  useEffect(() => {
    if (restoring.current) return
    const slug = slugs[selectedIndex]
    if (!slug) return
    const nextHash = `#${slug}`
    if (location.hash === nextHash) {
      writtenHash.current = nextHash
      return
    }
    writtenHash.current = nextHash
    navigate(
      { pathname: location.pathname, search: location.search, hash: slug },
      { replace: true },
    )
  }, [
    selectedIndex,
    slugs,
    location.pathname,
    location.search,
    location.hash,
    navigate,
  ])

  return null
}

export function stepSlug(title: string, index: number, used: Set<string>) {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `step-${index + 1}`
  let slug = base
  let n = 2
  while (used.has(slug)) {
    slug = `${base}-${n}`
    n += 1
  }
  used.add(slug)
  return slug
}
