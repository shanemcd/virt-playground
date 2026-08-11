import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { MDXProvider } from "@mdx-js/react"
import "@patternfly/react-core/dist/styles/base.css"
import "./globals.css"
import { App } from "./App"
import { Code } from "./components/code"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MDXProvider components={{ Code }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MDXProvider>
  </StrictMode>,
)
