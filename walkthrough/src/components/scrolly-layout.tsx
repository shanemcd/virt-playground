import { Link, useLocation } from "react-router-dom"
import { useEffect, useMemo, useState } from "react"
import {
  Selection,
  Selectable,
  SelectionProvider,
} from "codehike/utils/selection"
import {
  Breadcrumb,
  BreadcrumbItem,
  Card,
  CardBody,
  Content,
  PageSection,
  Title,
} from "@patternfly/react-core"
import { sectionOf } from "../curriculum"
import { walkthroughByPath } from "../walkthroughs"
import { ChapterPager } from "./chapter-pager"
import { stepSlug } from "../step-slug"
import { StepUrlSync } from "./step-url-sync"

type StepView = {
  title: string
  body: React.ReactNode
  panel: React.ReactNode
}

/** Same band math as Code Hike's defaultRootMargin, but higher than 50%. */
function scrollTriggerMargin(vh: number, triggerRatio: number) {
  const y = Math.round(vh * triggerRatio)
  return `-${y - 2}px 0px -${vh - y - 2}px`
}

/** Narrow layouts dock a sticky panel up top — trigger in the steps band below it. */
function triggerRatioForViewport() {
  if (typeof window === "undefined") return 0.32
  return window.matchMedia("(max-width: 992px)").matches ? 0.58 : 0.32
}

function useScrollTriggerMargin() {
  const [rootMargin, setRootMargin] = useState(() =>
    typeof window === "undefined"
      ? "-286px 0px -610px"
      : scrollTriggerMargin(window.innerHeight, triggerRatioForViewport()),
  )
  useEffect(() => {
    const update = () =>
      setRootMargin(
        scrollTriggerMargin(window.innerHeight, triggerRatioForViewport()),
      )
    update()
    window.addEventListener("resize", update)
    const mq = window.matchMedia("(max-width: 992px)")
    mq.addEventListener("change", update)
    return () => {
      window.removeEventListener("resize", update)
      mq.removeEventListener("change", update)
    }
  }, [])
  return rootMargin
}

export function ScrollyLayout({
  backHref = "/",
  introTitle,
  introBody,
  steps,
  outroBody,
}: {
  backHref?: string
  introTitle: string
  introBody: React.ReactNode
  steps: StepView[]
  outroTitle?: string
  outroBody: React.ReactNode
}) {
  const rootMargin = useScrollTriggerMargin()
  const { pathname } = useLocation()
  const section = sectionOf(pathname)
  const walkthrough = walkthroughByPath(pathname)
  const slugs = useMemo(() => {
    const used = new Set<string>()
    return steps.map((step, i) => stepSlug(step.title, i, used))
  }, [steps])

  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          {walkthrough ? (
            <>
              <BreadcrumbItem>
                <Link to="/walkthroughs">Walkthroughs</Link>
              </BreadcrumbItem>
              <BreadcrumbItem isActive>{introTitle}</BreadcrumbItem>
            </>
          ) : (
            <>
              <BreadcrumbItem>
                <Link to="/curriculum">Curriculum</Link>
              </BreadcrumbItem>
              {section ? (
                <BreadcrumbItem>
                  <Link to={`/curriculum/${section.id}`}>{section.title}</Link>
                </BreadcrumbItem>
              ) : null}
              <BreadcrumbItem isActive>{introTitle}</BreadcrumbItem>
            </>
          )}
        </Breadcrumb>
      </PageSection>

      <PageSection isWidthLimited>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mb-md">
          {introTitle}
        </Title>
        <Content className="kv-lede">{introBody}</Content>
      </PageSection>

      <PageSection variant="secondary" isFilled>
        <SelectionProvider className="kv-scrolly-grid" rootMargin={rootMargin}>
          <StepUrlSync slugs={slugs} />
          {/* Panel first in DOM so mobile sticky-top works; desktop grid-area puts it right. */}
          <div className="kv-sticky-panel">
            <Card isFullHeight className="kv-sticky-card">
              <CardBody className="kv-sticky-panel-body">
                <Selection from={steps.map((step) => step.panel)} />
              </CardBody>
            </Card>
          </div>

          <div className="kv-steps-column">
            {steps.map((step, i) => (
              <Selectable
                key={slugs[i]}
                id={slugs[i]}
                index={i}
                selectOn={["click", "scroll"]}
                className="kv-step"
              >
                <Title headingLevel="h2" size="lg" className="pf-v6-u-mb-sm">
                  {step.title}
                </Title>
                <Content>{step.body}</Content>
              </Selectable>
            ))}
          </div>
        </SelectionProvider>
      </PageSection>

      {walkthrough ? (
        <PageSection className="kv-pager-section" isWidthLimited>
          {outroBody ? (
            <Content className="kv-lede pf-v6-u-mb-lg">{outroBody}</Content>
          ) : null}
          <nav className="kv-chapter-pager" aria-label="Walkthrough">
            <Link to="/walkthroughs" className="kv-pager-card">
              <span className="kv-pager-dir">All walkthroughs</span>
              <span className="kv-pager-title">Walkthroughs</span>
            </Link>
            <Link
              to="/"
              className="kv-pager-card kv-pager-card--next"
              aria-label="Home"
            >
              <span className="kv-pager-dir">Home</span>
              <span className="kv-pager-title">Back to overview</span>
            </Link>
          </nav>
        </PageSection>
      ) : (
        <ChapterPager outroBody={outroBody} />
      )}
    </>
  )
}
