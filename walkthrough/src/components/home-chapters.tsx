import { useNavigate } from "react-router-dom"
import {
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
import { sections } from "../curriculum"

export function HomeChapters() {
  const navigate = useNavigate()

  return (
    <>
      <PageSection isWidthLimited>
        <Flex
          direction={{ default: "column" }}
          spaceItems={{ default: "spaceItemsMd" }}
        >
          <FlexItem>
            <Title headingLevel="h1" size="3xl">
              KubeVirt ecosystem for maintainers
            </Title>
          </FlexItem>
          <FlexItem>
            <Content className="kv-lede">
              <p>
                An interactive curriculum: upstream{" "}
                <code>kubevirt/kubevirt</code> core first, then sibling projects
                (CDI, packaging, MTV/Forklift) that create and consume VMs.
              </p>
              <p>
                Scroll each chapter — the side panel follows with diagrams or
                code. Aimed at contributors who know Kubernetes basics and are
                learning this ecosystem.
              </p>
            </Content>
          </FlexItem>
        </Flex>
      </PageSection>

      {sections.map((section, sIdx) => (
        <PageSection
          key={section.id}
          variant={sIdx % 2 === 0 ? "secondary" : "default"}
          isWidthLimited
        >
          <Title headingLevel="h2" size="xl" className="pf-v6-u-mb-sm">
            <span className="kv-section-num">
              {String(sIdx + 1).padStart(2, "0")}
            </span>{" "}
            {section.title}
          </Title>
          <Content className="kv-lede pf-v6-u-mb-lg">
            <p>{section.blurb}</p>
          </Content>
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
                        {c.status === "outline" ? "Open outline" : "Open chapter"}
                      </Button>
                    </CardFooter>
                  </Card>
                </GalleryItem>
              )
            })}
          </Gallery>
        </PageSection>
      ))}

      <PageSection isWidthLimited>
        <Content>
          <small className="kv-muted">
            Built with PatternFly, Code Hike, Mermaid, and Vite. Run{" "}
            <code>npm install && npm run dev</code> from this directory.
          </small>
        </Content>
      </PageSection>
    </>
  )
}
