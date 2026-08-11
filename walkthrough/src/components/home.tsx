import { Link, useNavigate } from "react-router-dom"
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
import { walkthroughs } from "../walkthroughs"

export function Home() {
  const navigate = useNavigate()
  const firstChapter = sections[0]?.chapters[0]?.href ?? "/curriculum"
  const readyWalkthroughs = walkthroughs.filter((w) => w.status === "ready")

  return (
    <>
      <PageSection isWidthLimited className="kv-home-hero">
        <Title headingLevel="h1" size="3xl" className="pf-v6-u-mb-md">
          KubeVirt ecosystem for maintainers
        </Title>
        <Content className="kv-lede">
          <p>
            Two tracks: a linear <strong>curriculum</strong> through upstream
            KubeVirt and siblings, and targeted <strong>walkthroughs</strong> for
            cross-cutting questions.
          </p>
        </Content>
        <Flex
          className="pf-v6-u-mt-lg"
          spaceItems={{ default: "spaceItemsMd" }}
          flexWrap={{ default: "wrap" }}
        >
          <FlexItem>
            <Button onClick={() => navigate(firstChapter)}>
              Start curriculum
            </Button>
          </FlexItem>
          <FlexItem>
            <Button variant="secondary" onClick={() => navigate("/walkthroughs")}>
              Browse walkthroughs
            </Button>
          </FlexItem>
        </Flex>
      </PageSection>

      <PageSection variant="secondary" isWidthLimited>
        <Flex
          justifyContent={{ default: "justifyContentSpaceBetween" }}
          alignItems={{ default: "alignItemsFlexEnd" }}
          flexWrap={{ default: "wrap" }}
          className="pf-v6-u-mb-lg"
        >
          <FlexItem>
            <Title headingLevel="h2" size="xl">
              Curriculum
            </Title>
            <Content className="kv-lede pf-v6-u-mt-sm">
              <p>Read in order — foundations through contributing.</p>
            </Content>
          </FlexItem>
          <FlexItem>
            <Button
              variant="link"
              isInline
              icon={<ArrowRightIcon />}
              iconPosition="end"
              component={(props) => <Link {...props} to="/curriculum" />}
            >
              Full curriculum
            </Button>
          </FlexItem>
        </Flex>

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

      {readyWalkthroughs.length > 0 ? (
        <PageSection isWidthLimited>
          <Flex
            justifyContent={{ default: "justifyContentSpaceBetween" }}
            alignItems={{ default: "alignItemsFlexEnd" }}
            flexWrap={{ default: "wrap" }}
            className="pf-v6-u-mb-lg"
          >
            <FlexItem>
              <Title headingLevel="h2" size="xl">
                Walkthroughs
              </Title>
              <Content className="kv-lede pf-v6-u-mt-sm">
                <p>
                  Cross-cutting deep dives — follow a bug or mechanism across
                  layers without replaying the whole curriculum.
                </p>
              </Content>
            </FlexItem>
            <FlexItem>
              <Button
                variant="link"
                isInline
                icon={<ArrowRightIcon />}
                iconPosition="end"
                component={(props) => <Link {...props} to="/walkthroughs" />}
              >
                All walkthroughs
              </Button>
            </FlexItem>
          </Flex>

          <Gallery
            hasGutter
            minWidths={{ default: "100%", md: "280px" }}
            maxWidths={{ md: "1fr" }}
          >
            {readyWalkthroughs.map((w) => {
              const titleId = `wt-${w.id}`
              return (
                <GalleryItem key={w.id}>
                  <Card isClickable isFullHeight>
                    <CardHeader
                      selectableActions={{
                        onClickAction: () => navigate(w.href),
                        selectableActionAriaLabelledby: titleId,
                      }}
                    >
                      <CardTitle id={titleId}>{w.title}</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <Content>
                        <p>{w.blurb}</p>
                      </Content>
                      <div className="kv-tag-row">
                        {w.tags.map((t) => (
                          <Label key={t} isCompact color="blue">
                            {t}
                          </Label>
                        ))}
                      </div>
                    </CardBody>
                    <CardFooter>
                      <Button
                        variant="link"
                        isInline
                        icon={<ArrowRightIcon />}
                        iconPosition="end"
                        onClick={() => navigate(w.href)}
                      >
                        Open
                      </Button>
                    </CardFooter>
                  </Card>
                </GalleryItem>
              )
            })}
          </Gallery>
        </PageSection>
      ) : null}
    </>
  )
}
