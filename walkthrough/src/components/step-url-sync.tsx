import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useSelectedIndex } from "codehike/utils/selection"

export { stepSlug } from "../step-slug"

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

/** Keep the active scrolly step in the URL hash and restore it on load / search jumps. */
export function StepUrlSync({ slugs }: { slugs: string[] }) {
  const [selectedIndex, setSelectedIndex] = useSelectedIndex()
  const location = useLocation()
  const navigate = useNavigate()
  /** Hash we last wrote from selection — ignore those in the restore path. */
  const writtenHash = useRef<string | null>(null)
  /** While restoring, ignore scroll-driven selection churn. */
  const restoring = useRef(false)

  // Restore when the hash is set externally (load, search, back/forward).
  useEffect(() => {
    const hash = decodeURIComponent(location.hash.replace(/^#/, ""))
    if (!hash) return
    if (writtenHash.current === `#${hash}`) return
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
        writtenHash.current = `#${hash}`
      }, 120)
    })
  }, [location.hash, location.pathname, setSelectedIndex, slugs])

  // Persist the current step as we scroll / click (replace, no history spam).
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
