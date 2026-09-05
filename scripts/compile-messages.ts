import { compile } from "@inlang/paraglide-js"

await compile({
  project: "./project.inlang",
  outdir: "./src/paraglide",
  strategy: ["cookie", "preferredLanguage", "baseLocale"],
})
