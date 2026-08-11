import { Link, useLocation } from "react-router-dom"
import {
  Masthead,
  MastheadBrand,
  MastheadContent,
  MastheadLogo,
  MastheadMain,
  Nav,
  NavItem,
  NavList,
  Page,
  Toolbar,
  ToolbarContent,
  ToolbarGroup,
  ToolbarItem,
} from "@patternfly/react-core"
import { SiteSearch } from "./site-search"

const nav = [
  { href: "/", label: "Home", match: (p: string) => p === "/" },
  {
    href: "/curriculum",
    label: "Curriculum",
    match: (p: string) =>
      p === "/curriculum" ||
      p.startsWith("/curriculum/") ||
      [
        "/foundations",
        "/data-plane",
        "/lifecycle",
        "/platform",
        "/ecosystem",
        "/contribute",
      ].some((prefix) => p.startsWith(prefix)),
  },
  {
    href: "/walkthroughs",
    label: "Walkthroughs",
    match: (p: string) => p.startsWith("/walkthroughs"),
  },
]

export function PfShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()

  const masthead = (
    <Masthead className="kv-masthead" inset={{ default: "insetLg" }}>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo
            component={(props) => <Link {...props} to="/" />}
            className="kv-brand"
          >
            <img
              src="/kubevirt-logo.png"
              alt=""
              width={28}
              height={28}
              className="kv-brand-logo"
            />
            KubeVirt
            <span className="kv-brand-sub">ecosystem</span>
          </MastheadLogo>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="kv-walkthrough-toolbar" isFullHeight>
          <ToolbarContent>
            <ToolbarGroup
              variant="action-group-plain"
              align={{ default: "alignStart" }}
              alignItems="center"
            >
              <ToolbarItem>
                <Nav
                  variant="horizontal"
                  aria-label="Primary"
                  className="kv-top-nav"
                >
                  <NavList>
                    {nav.map((item) => (
                      <NavItem
                        key={item.href}
                        itemId={item.href}
                        to={item.href}
                        isActive={item.match(pathname)}
                        component={(props) => {
                          const { href, ...rest } = props
                          return <Link {...rest} to={href ?? item.href} />
                        }}
                      >
                        {item.label}
                      </NavItem>
                    ))}
                  </NavList>
                </Nav>
              </ToolbarItem>
            </ToolbarGroup>
            <ToolbarGroup
              variant="action-group-plain"
              align={{ default: "alignEnd" }}
              alignItems="center"
            >
              <ToolbarItem>
                <SiteSearch />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  )

  return (
    <Page masthead={masthead} isContentFilled className="kv-page">
      {children}
    </Page>
  )
}
