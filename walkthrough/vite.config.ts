import { defineConfig, type Plugin } from "vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"
import remarkGfm from "remark-gfm"
import { remarkCodeHike, recmaCodeHike } from "codehike/mdx"

/** @type {import('codehike/mdx').CodeHikeConfig} */
const chConfig = {
  components: { code: "Code" },
}

const mdxPlugin = mdx({
  remarkPlugins: [remarkGfm, [remarkCodeHike, chConfig]],
  recmaPlugins: [[recmaCodeHike, chConfig]],
  providerImportSource: "@mdx-js/react",
}) as Plugin

/** Let Vite's ?raw handling win — otherwise MDX compiles those imports to components. */
function mdxExceptRaw(): Plugin {
  const transform = mdxPlugin.transform
  return {
    ...mdxPlugin,
    enforce: "pre",
    transform(code, id, options) {
      if (id.includes("?raw") || id.includes("&raw")) return null
      if (typeof transform === "function") {
        return transform.call(this, code, id, options)
      }
      return null
    },
  }
}

/** Project Pages live at https://<user>.github.io/virt-playground/ */
const base = process.env.VITE_BASE ?? "/"

export default defineConfig({
  base,
  plugins: [mdxExceptRaw(), react({ include: /\.(jsx|tsx|mdx)$/ })],
  server: {
    port: 3010,
  },
})
