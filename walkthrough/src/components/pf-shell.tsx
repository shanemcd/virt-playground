import { useEffect, useState } from "react"
import { Link, useLocation } from "react-router-dom"
import {
  Button,
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
import SearchIcon from "@patternfly/react-icons/dist/esm/icons/search-icon"
import TimesIcon from "@patternfly/react-icons/dist/esm/icons/times-icon"
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

  // Narrow viewports collapse search behind an icon so the nav row stays one line.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  useEffect(() => setMobileSearchOpen(false), [pathname])

  const masthead = (
    <Masthead className="kv-masthead" inset={{ default: "insetLg" }}>
      <MastheadMain>
        <MastheadBrand>
          <MastheadLogo
            component={(props) => <Link {...props} to="/" />}
            className="kv-brand"
          >
            <img
              src={`${import.meta.env.BASE_URL}kubevirt-logo.png`}
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
        <Toolbar
          id="kv-walkthrough-toolbar"
          isFullHeight
          className="kv-toolbar"
        >
          <ToolbarContent className="kv-toolbar-content">
            <ToolbarGroup
              variant="action-group-plain"
              align={{ default: "alignStart" }}
              alignItems="center"
              className="kv-toolbar-nav"
            >
              <ToolbarItem className="kv-toolbar-nav-item">
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
              <ToolbarItem className="kv-mobile-search-toggle-item">
                <Button
                  variant="plain"
                  aria-label={mobileSearchOpen ? "Close search" : "Search"}
                  aria-expanded={mobileSearchOpen}
                  className="kv-mobile-search-toggle"
                  onClick={() => setMobileSearchOpen((v) => !v)}
                >
                  {mobileSearchOpen ? <TimesIcon /> : <SearchIcon />}
                </Button>
              </ToolbarItem>
            </ToolbarGroup>
            <ToolbarGroup
              variant="action-group-plain"
              align={{ default: "alignEnd" }}
              alignItems="center"
              className={
                mobileSearchOpen
                  ? "kv-toolbar-search kv-toolbar-search--open"
                  : "kv-toolbar-search"
              }
            >
              <ToolbarItem className="kv-toolbar-search-item">
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
