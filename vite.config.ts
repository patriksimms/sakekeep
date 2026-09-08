import { paraglideVitePlugin } from "@inlang/paraglide-js"
import { defineConfig, loadEnv } from "vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"

import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"

import { validateProductionAuthBuildConfiguration } from "./src/server/auth-config.ts"

const config = defineConfig(({ command, mode }) => {
  if (command === "build") {
    validateProductionAuthBuildConfiguration({
      ...loadEnv(mode, process.cwd(), ""),
      ...process.env,
    })
  }

  return {
    resolve: { tsconfigPaths: true },
    plugins: [
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        emitTsDeclarations: true,
        strategy: ["cookie", "preferredLanguage", "baseLocale"],
      }),
      tailwindcss(),
      tanstackStart(),
      viteReact(),
    ],
  }
})

export default config
