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
import { sections } from "../curriculum"
import { SiteSearch } from "./site-search"

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
                  aria-label="Section navigation"
                  className="kv-top-nav"
                >
                  <NavList>
                    <NavItem
                      itemId="home"
                      to="/"
                      isActive={pathname === "/"}
                      component={(props) => {
                        const { href, ...rest } = props
                        return <Link {...rest} to={href ?? "/"} />
                      }}
                    >
                      Home
                    </NavItem>
                    {sections.map((section) => {
                      const first = section.chapters[0]?.href ?? "/"
                      const active = pathname.startsWith(`/${section.id}`)
                      return (
                        <NavItem
                          key={section.id}
                          itemId={section.id}
                          to={first}
                          isActive={active}
                          component={(props) => {
                            const { href, ...rest } = props
                            return <Link {...rest} to={href ?? first} />
                          }}
                        >
                          {section.short}
                        </NavItem>
                      )
                    })}
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
