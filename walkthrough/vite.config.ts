import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import mdx from "@mdx-js/rollup"
import remarkGfm from "remark-gfm"
import { remarkCodeHike, recmaCodeHike } from "codehike/mdx"

/** @type {import('codehike/mdx').CodeHikeConfig} */
const chConfig = {
  components: { code: "Code" },
}

export default defineConfig({
  plugins: [
    {
      enforce: "pre",
      ...mdx({
        remarkPlugins: [remarkGfm, [remarkCodeHike, chConfig]],
        recmaPlugins: [[recmaCodeHike, chConfig]],
        providerImportSource: "@mdx-js/react",
      }),
    },
    react({ include: /\.(jsx|tsx|mdx)$/ }),
  ],
  server: {
    port: 3010,
  },
})
