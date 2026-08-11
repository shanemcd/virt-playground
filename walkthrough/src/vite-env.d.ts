/// <reference types="vite/client" />
/// <reference types="@mdx-js/rollup" />

declare module "*.mdx" {
  import type { MDXContent } from "mdx/types"
  const content: MDXContent
  export default content
}
