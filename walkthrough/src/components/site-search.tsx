import { useEffect, useId, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { SearchInput } from "@patternfly/react-core"
import { searchCurriculum, type SearchHit } from "../search-index"

function parseHref(href: string): { pathname: string; hash: string } {
  const i = href.indexOf("#")
  if (i < 0) return { pathname: href, hash: "" }
  return { pathname: href.slice(0, i), hash: href.slice(i + 1) }
}

export function SiteSearch() {
  const navigate = useNavigate()
  const listId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => searchCurriculum(query), [query])

  useEffect(() => {
    setActive(0)
    setOpen(query.trim().length >= 2)
  }, [query])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [])

  const go = (hit: SearchHit) => {
    const { pathname, hash } = parseHref(hit.href)
    navigate({ pathname, hash })
    setQuery("")
    setOpen(false)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) {
      if (e.key === "Escape") setOpen(false)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, results.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      const hit = results[active]
      if (hit) go(hit)
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  return (
    <div className="kv-site-search" ref={rootRef} onKeyDown={onKeyDown}>
      <SearchInput
        aria-label="Search curriculum"
        placeholder="Search…"
        value={query}
        onChange={(_e, value) => setQuery(value)}
        onClear={() => {
          setQuery("")
          setOpen(false)
        }}
        onFocus={() => {
          if (query.trim().length >= 2) setOpen(true)
        }}
        resultsCount={open && query.trim().length >= 2 ? results.length : undefined}
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
      />
      {open && query.trim().length >= 2 ? (
        <ul id={listId} className="kv-search-results" role="listbox">
          {results.length === 0 ? (
            <li className="kv-search-empty" role="option" aria-selected={false}>
              No matches
            </li>
          ) : (
            results.map((hit, i) => (
              <li key={hit.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={
                    i === active
                      ? "kv-search-result kv-search-result--active"
                      : "kv-search-result"
                  }
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(hit)}
                >
                  <span className="kv-search-result-meta">
                    {hit.sectionTitle}
                    {" · "}
                    {hit.kind === "step" ? "Step" : "Chapter"}
                  </span>
                  <span className="kv-search-result-title">
                    {hit.kind === "step" ? hit.stepTitle : hit.chapterTitle}
                  </span>
                  {hit.kind === "step" ? (
                    <span className="kv-search-result-chapter">{hit.chapterTitle}</span>
                  ) : null}
                  <span className="kv-search-result-snippet">{hit.snippet}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
