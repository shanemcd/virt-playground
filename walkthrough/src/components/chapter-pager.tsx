import { Link, useLocation } from "react-router-dom"
import { Content, PageSection } from "@patternfly/react-core"
import ArrowLeftIcon from "@patternfly/react-icons/dist/esm/icons/arrow-left-icon"
import ArrowRightIcon from "@patternfly/react-icons/dist/esm/icons/arrow-right-icon"
import {
  allChapters,
  chapterAfter,
  chapterBefore,
  chapterIndex,
  sectionOf,
} from "../curriculum"

export function ChapterPager({
  outroBody,
}: {
  /** Teaser copy for the next chapter (from MDX outro). */
  outroBody?: React.ReactNode
}) {
  const { pathname } = useLocation()
  const prev = chapterBefore(pathname)
  const next = chapterAfter(pathname)
  const index = chapterIndex(pathname)
  const chapters = allChapters()
  const position = index >= 0 ? index + 1 : null
  const section = sectionOf(pathname)
  const sectionChapters = section?.chapters ?? []
  const inSection =
    section && index >= 0
      ? sectionChapters.findIndex((c) => c.href === chapters[index]?.href) + 1
      : null

  return (
    <PageSection className="kv-pager-section" isWidthLimited>
      {position != null && section && inSection != null && inSection > 0 ? (
        <p className="kv-pager-position">
          {section.title} · {inSection} / {sectionChapters.length}
          <span className="kv-pager-position-global">
            {" "}
            · Chapter {position} of {chapters.length}
          </span>
        </p>
      ) : null}

      {!next && outroBody ? (
        <Content className="kv-lede pf-v6-u-mb-lg">{outroBody}</Content>
      ) : null}

      <nav className="kv-chapter-pager" aria-label="Chapter">
        <Link
          to={prev?.href ?? "/"}
          className="kv-pager-card"
          aria-label={prev ? `Previous chapter: ${prev.title}` : "All chapters"}
        >
          <span className="kv-pager-dir">
            <ArrowLeftIcon />
            {prev ? "Previous" : "Overview"}
          </span>
          <span className="kv-pager-title">
            {prev ? prev.title : "All chapters"}
          </span>
        </Link>

        <Link
          to={next?.href ?? "/"}
          className="kv-pager-card kv-pager-card--next"
          aria-label={next ? `Next chapter: ${next.title}` : "All chapters"}
        >
          <span className="kv-pager-dir">
            {next ? "Next" : "Finish"}
            <ArrowRightIcon />
          </span>
          <span className="kv-pager-title">
            {next ? next.title : "All chapters"}
          </span>
          {next && outroBody ? (
            <span className="kv-pager-blurb">
              <Content>{outroBody}</Content>
            </span>
          ) : null}
        </Link>
      </nav>
    </PageSection>
  )
}
