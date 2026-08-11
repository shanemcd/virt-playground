import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Content,
  Flex,
  FlexItem,
  Gallery,
  GalleryItem,
  Label,
  PageSection,
  Title,
} from "@patternfly/react-core"
import ArrowRightIcon from "@patternfly/react-icons/dist/esm/icons/arrow-right-icon"
import { sectionById, sections } from "../curriculum"

export function CurriculumIndex() {
  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/">Home</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>Curriculum</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <PageSection isWidthLimited>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mb-md">
          Curriculum
        </Title>
        <Content className="kv-lede">
          <p>
            Linear path through the ecosystem. Open a section for its chapters,
            or start at the first Foundations chapter.
          </p>
        </Content>
      </PageSection>

      <PageSection variant="secondary" isWidthLimited>
        <ol className="kv-section-list">
          {sections.map((section, sIdx) => (
            <li key={section.id}>
              <Link
                to={`/curriculum/${section.id}`}
                className="kv-section-row"
              >
                <span className="kv-section-num">
                  {String(sIdx + 1).padStart(2, "0")}
                </span>
                <span className="kv-section-row-body">
                  <span className="kv-section-row-title">{section.title}</span>
                  <span className="kv-section-row-blurb">{section.blurb}</span>
                </span>
                <span className="kv-section-row-meta">
                  {section.chapters.length} chapters
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </PageSection>
    </>
  )
}

export function CurriculumSectionPage() {
  const { sectionId } = useParams()
  const navigate = useNavigate()
  const section = sectionId ? sectionById(sectionId) : undefined
  if (!section) return <Navigate to="/curriculum" replace />

  const sIdx = sections.findIndex((s) => s.id === section.id)

  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/">Home</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Link to="/curriculum">Curriculum</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{section.title}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <PageSection isWidthLimited>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mb-sm">
          <span className="kv-section-num">
            {String(sIdx + 1).padStart(2, "0")}
          </span>{" "}
          {section.title}
        </Title>
        <Content className="kv-lede">
          <p>{section.blurb}</p>
        </Content>
      </PageSection>

      <PageSection variant="secondary" isWidthLimited>
        <Gallery
          hasGutter
          minWidths={{ default: "100%", md: "260px" }}
          maxWidths={{ md: "1fr" }}
        >
          {section.chapters.map((c, cIdx) => {
            const titleId = `chapter-${c.href.replace(/\//g, "")}`
            const n = String(cIdx + 1).padStart(2, "0")
            return (
              <GalleryItem key={c.href}>
                <Card isClickable isFullHeight>
                  <CardHeader
                    selectableActions={{
                      onClickAction: () => navigate(c.href),
                      selectableActionAriaLabelledby: titleId,
                    }}
                  >
                    <Flex
                      alignItems={{ default: "alignItemsCenter" }}
                      spaceItems={{ default: "spaceItemsSm" }}
                      flexWrap={{ default: "wrap" }}
                    >
                      <FlexItem>
                        <span className="kv-chapter-num">{n}</span>
                      </FlexItem>
                      <FlexItem>
                        <CardTitle id={titleId}>{c.title}</CardTitle>
                      </FlexItem>
                      {c.status === "outline" ? (
                        <FlexItem>
                          <Label color="grey">Outline</Label>
                        </FlexItem>
                      ) : null}
                    </Flex>
                  </CardHeader>
                  <CardBody>
                    <Content>
                      <p>{c.blurb}</p>
                    </Content>
                  </CardBody>
                  <CardFooter>
                    <Button
                      variant="link"
                      isInline
                      icon={<ArrowRightIcon />}
                      iconPosition="end"
                      onClick={() => navigate(c.href)}
                    >
                      Open chapter
                    </Button>
                  </CardFooter>
                </Card>
              </GalleryItem>
            )
          })}
        </Gallery>
      </PageSection>
    </>
  )
}
