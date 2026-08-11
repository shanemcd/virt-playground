import { Link } from "react-router-dom"
import {
  Breadcrumb,
  BreadcrumbItem,
  Content,
  List,
  ListItem,
  PageSection,
  Title,
} from "@patternfly/react-core"
import type { Chapter, Section } from "../curriculum"
import { ChapterPager } from "./chapter-pager"

export function OutlineChapter({
  section,
  chapter,
}: {
  section: Section
  chapter: Chapter
}) {
  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/curriculum">Curriculum</Link>
          </BreadcrumbItem>
          <BreadcrumbItem>
            <Link to={`/curriculum/${section.id}`}>{section.title}</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>{chapter.title}</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <PageSection isWidthLimited>
        <p className="kv-outline-badge">Outline — full scrolly chapter next</p>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mb-md">
          {chapter.title}
        </Title>
        <Content className="kv-lede">
          <p>{chapter.blurb}</p>
          <p>
            This slot is reserved in the curriculum so the map stays complete.
            When written, it will use the same scroll + panel format as the ready
            chapters. Until then, use these objectives and links.
          </p>
        </Content>
      </PageSection>

      <PageSection variant="secondary" isWidthLimited>
        <Title headingLevel="h2" size="lg" className="pf-v6-u-mb-md">
          Learning objectives
        </Title>
        <List>
          {(chapter.objectives ?? []).map((obj) => (
            <ListItem key={obj}>{obj}</ListItem>
          ))}
        </List>

        {chapter.furtherReading && chapter.furtherReading.length > 0 ? (
          <>
            <Title
              headingLevel="h2"
              size="lg"
              className="pf-v6-u-mt-xl pf-v6-u-mb-md"
            >
              Further reading
            </Title>
            <List>
              {chapter.furtherReading.map((item) => (
                <ListItem key={item.href}>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                </ListItem>
              ))}
            </List>
          </>
        ) : null}
      </PageSection>

      <ChapterPager />
    </>
  )
}
