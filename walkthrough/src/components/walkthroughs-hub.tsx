import { Link, Navigate, useNavigate, useParams } from "react-router-dom"
import type { MDXContent } from "mdx/types"
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
  Gallery,
  GalleryItem,
  Label,
  PageSection,
  Title,
} from "@patternfly/react-core"
import ArrowRightIcon from "@patternfly/react-icons/dist/esm/icons/arrow-right-icon"
import { walkthroughById, walkthroughs } from "../walkthroughs"
import { ScrollycodingChapter } from "./scrollycoding"
import CmdSocket from "../content/walkthroughs/cmd-socket.mdx"
import GuestGetDevices from "../content/walkthroughs/guest-get-devices.mdx"

const readyMdx: Record<string, MDXContent> = {
  "/walkthroughs/cmd-socket": CmdSocket,
  "/walkthroughs/guest-get-devices": GuestGetDevices,
}

export function WalkthroughsIndex() {
  const navigate = useNavigate()

  return (
    <>
      <PageSection type="breadcrumb">
        <Breadcrumb>
          <BreadcrumbItem>
            <Link to="/">Home</Link>
          </BreadcrumbItem>
          <BreadcrumbItem isActive>Walkthroughs</BreadcrumbItem>
        </Breadcrumb>
      </PageSection>

      <PageSection isWidthLimited>
        <Title headingLevel="h1" size="2xl" className="pf-v6-u-mb-md">
          Walkthroughs
        </Title>
        <Content className="kv-lede">
          <p>
            Cross-cutting deep dives — follow one mechanism across code and a
            deployed cluster without replaying the whole curriculum.
          </p>
        </Content>
      </PageSection>

      <PageSection variant="secondary" isWidthLimited>
        {walkthroughs.length === 0 ? (
          <Content className="kv-lede">
            <p>No walkthroughs yet.</p>
          </Content>
        ) : (
          <Gallery
            hasGutter
            minWidths={{ default: "100%", md: "280px" }}
            maxWidths={{ md: "1fr" }}
          >
            {walkthroughs.map((w) => {
              const titleId = `wt-index-${w.id}`
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
        )}
      </PageSection>
    </>
  )
}

export function WalkthroughPage() {
  const { walkthroughId } = useParams()
  const wt = walkthroughId ? walkthroughById(walkthroughId) : undefined
  if (!wt) return <Navigate to="/walkthroughs" replace />

  const Mdx = readyMdx[wt.href]
  if (!Mdx) return <Navigate to="/walkthroughs" replace />
  return <ScrollycodingChapter Content={Mdx} />
}
