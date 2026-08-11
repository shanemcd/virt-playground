
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import mermaid from "mermaid"

const MERMAID_CONFIG_VERSION = 8
let initializedVersion = 0

function ensureMermaid() {
  if (initializedVersion === MERMAID_CONFIG_VERSION) return
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "neutral",
    fontFamily:
      "var(--pf-t--global--font--family--body, RedHatText, Overpass, overpass, helvetica, arial, sans-serif)",
    fontSize: 14,
    flowchart: {
      curve: "basis",
      padding: 12,
      nodeSpacing: 32,
      rankSpacing: 40,
      htmlLabels: true,
      useMaxWidth: false,
    },
    themeVariables: {
      fontSize: "14px",
      primaryColor: "#bee1f4",
      primaryTextColor: "#151515",
      primaryBorderColor: "#0066cc",
      lineColor: "#4f5255",
      secondaryColor: "#f0f0f0",
      tertiaryColor: "#ffffff",
      background: "#ffffff",
      mainBkg: "#ffffff",
      nodeBorder: "#0066cc",
      clusterBkg: "#f2f2f2",
      clusterBorder: "#8a8d90",
      titleColor: "#151515",
      edgeLabelBackground: "#ffffff",
    },
  })
  initializedVersion = MERMAID_CONFIG_VERSION
}

/**
 * Fit the SVG into the sticky panel.
 * Wide (horizontal) flowcharts use the full panel width — a fixed 320px cap
 * made LR diagrams unreadably small. Compact tall graphs still get a modest
 * upscale ceiling so 2–3 node charts don't become full-panel posters.
 */
function sizeSvg(container: HTMLElement, svg: SVGSVGElement) {
  const vb = svg.viewBox?.baseVal
  const naturalW = vb?.width || Number(svg.getAttribute("width")) || 320
  const naturalH = vb?.height || Number(svg.getAttribute("height")) || 180
  if (!naturalW || !naturalH) return

  const containerW = Math.max(container.clientWidth - 16, 200)
  const availH = Math.min(window.innerHeight * 0.5, 420)
  const aspect = naturalW / naturalH
  const isWide = aspect >= 1.35

  const maxW = isWide ? containerW : Math.min(containerW, 380)
  // Wide charts need room to stay legible; compact ones stay restrained.
  const maxUpscale = isWide ? 3.2 : 1.75
  const scale = Math.min(maxW / naturalW, availH / naturalH, maxUpscale)

  const width = Math.round(naturalW * scale)
  const height = Math.round(naturalH * scale)

  svg.setAttribute("width", String(width))
  svg.setAttribute("height", String(height))
  svg.style.width = `${width}px`
  svg.style.height = `${height}px`
  svg.style.maxWidth = "100%"
}
export function Mermaid({ chart, className = "" }: { chart: string; className?: string }) {
  const reactId = useId().replace(/:/g, "")
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ensureMermaid()
    const id = `mermaid-${reactId}-${Math.random().toString(36).slice(2, 8)}`
    mermaid
      .render(id, chart.trim())
      .then(({ svg: rendered }) => {
        if (!cancelled) {
          setSvg(rendered)
          setError(null)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message)
          setSvg("")
        }
      })
    return () => {
      cancelled = true
    }
  }, [chart, reactId])

  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container || !svg) return
    const el = container.querySelector("svg")
    if (!el) return
    sizeSvg(container, el)

    const onResize = () => sizeSvg(container, el)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [svg])

  if (error) {
    return (
      <pre className="kv-mermaid-error">
        Mermaid error: {error}
        {"\n\n"}
        {chart}
      </pre>
    )
  }

  if (!svg) {
    return <div className="kv-mermaid-loading">Rendering diagram…</div>
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-diagram ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
