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
import { ChapterPager } from "./chapter-pager"
import { StepUrlSync, stepSlug } from "./step-url-sync"

type StepView = {
  title: string
  body: React.ReactNode
  panel: React.ReactNode
}

/** Same band math as Code Hike's defaultRootMargin, but higher than 50%. */
function scrollTriggerMargin(vh: number, triggerRatio = 0.32) {
  const y = Math.round(vh * triggerRatio)
  return `-${y - 2}px 0px -${vh - y - 2}px`
}

function useScrollTriggerMargin() {
  const [rootMargin, setRootMargin] = useState(() =>
    typeof window === "undefined"
      ? "-286px 0px -610px"
      : scrollTriggerMargin(window.innerHeight),
  )
  useEffect(() => {
    const update = () => setRootMargin(scrollTriggerMargin(window.innerHeight))
    update()
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
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
  const slugs = useMemo(() => {
    const used = new Set<string>()
    return steps.map((step, i) => stepSlug(step.title, i, used))
  }, [steps])

  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to={backHref}>Chapters</Link>
          </BreadcrumbItem>
          {section ? (
            <BreadcrumbItem>
              <Link to={section.chapters[0]?.href ?? "/"}>{section.title}</Link>
            </BreadcrumbItem>
          ) : null}
          <BreadcrumbItem isActive>{introTitle}</BreadcrumbItem>
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

          <div className="kv-sticky-panel">
            <Card isFullHeight className="kv-sticky-card">
              <CardBody className="kv-sticky-panel-body">
                <Selection from={steps.map((step) => step.panel)} />
              </CardBody>
            </Card>
          </div>
        </SelectionProvider>
      </PageSection>

      <ChapterPager outroBody={outroBody} />
    </>
  )
}
