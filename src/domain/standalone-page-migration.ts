/**
 * Books saved before standalone pages became layout-backed carry their own `title`, `body` and
 * `background`. This module converts such a page into a layout that reproduces its rendering, so
 * the rest of the application only ever deals with the layout-backed shape.
 */
import {
  LAYOUT_SCHEMA_VERSION,
  type BookPage,
  type LayoutRole,
  type LayoutSchema,
  type PageProblem,
} from "./types.ts"
import { DEFAULT_TEXT_SETTINGS } from "./layout.ts"
import { type PageSpecification } from "./page-format.ts"

export type LegacyStandalonePageType = "cover" | "introduction" | "closing" | "blank"

export interface LegacyStandaloneBookPage {
  id: string
  kind: "standalone"
  pageType: LegacyStandalonePageType
  title: string
  body: string
  background: string
  problems: PageProblem[]
}

const LEGACY_PAGE_TYPES: readonly string[] = ["cover", "introduction", "closing", "blank"]

export function isLegacyStandalonePage(
  page: BookPage | LegacyStandaloneBookPage
): page is LegacyStandaloneBookPage {
  if (page.kind !== "standalone") return false
  const candidate = page as Partial<LegacyStandaloneBookPage>
  return (
    typeof candidate.pageType === "string" &&
    LEGACY_PAGE_TYPES.includes(candidate.pageType) &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string"
  )
}

const TEXT_MARGIN_MM = 18
const TITLE_TOP_MM = 24
const TITLE_HEIGHT_MM = 16
const BODY_GAP_MM = 6

/**
 * A layout that renders the legacy title and body the way the old standalone renderer did: a
 * serif title over a sans body, both inset from the trim edge.
 */
export function legacyStandaloneSchema(
  page: LegacyStandaloneBookPage,
  specification: PageSpecification
): LayoutSchema {
  const width = specification.trimWidthMm - TEXT_MARGIN_MM * 2
  const bodyTop = TITLE_TOP_MM + TITLE_HEIGHT_MM + BODY_GAP_MM
  const schema: LayoutSchema = {
    version: LAYOUT_SCHEMA_VERSION,
    trim: {
      widthMm: specification.trimWidthMm,
      heightMm: specification.trimHeightMm,
    },
    bleedMm: 3,
    safeMarginMm: 6,
    background: page.background,
    elements: [],
  }
  if (page.pageType === "blank") return schema
  if (page.title.trim()) {
    schema.elements.push({
      id: `${page.id}:title`,
      type: "static-text",
      geometry: {
        x: TEXT_MARGIN_MM,
        y: TITLE_TOP_MM,
        width,
        height: TITLE_HEIGHT_MM,
        rotation: 0,
      },
      opacity: 1,
      content: page.title,
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Source Serif 4",
        fontWeight: "bold",
        fontSize: 30,
        minFontSize: 12,
        color: "#292524",
      },
    })
  }
  if (page.body.trim()) {
    schema.elements.push({
      id: `${page.id}:body`,
      type: "static-text",
      geometry: {
        x: TEXT_MARGIN_MM,
        y: bodyTop,
        width,
        height: specification.trimHeightMm - bodyTop - TEXT_MARGIN_MM,
        rotation: 0,
      },
      opacity: 1,
      content: page.body,
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Inter",
        fontSize: 12,
        minFontSize: 8,
        color: "#57534e",
        lineHeight: 1.35,
      },
    })
  }
  return schema
}

export function legacyStandaloneName(page: LegacyStandaloneBookPage): string {
  const title = page.title.trim()
  if (!title) return page.pageType === "blank" ? "Blank page" : "Standalone page"
  return title.length > 60 ? `${title.slice(0, 57)}…` : title
}

/**
 * A legacy page only claims a cover role when it already sat where that cover goes, so the
 * conversion never reorders an existing book.
 */
export function legacyStandaloneRole(
  page: LegacyStandaloneBookPage,
  index: number,
  pageCount: number
): LayoutRole {
  if (page.pageType === "cover" && index === 0) return "front-cover"
  if (page.pageType === "closing" && index === pageCount - 1) return "back-cover"
  return "static"
}

export interface ConvertedStandaloneLayout {
  id: string
  sourcePageId: string
  name: string
  role: LayoutRole
  schema: LayoutSchema
}

export interface StandalonePageConversion {
  layouts: ConvertedStandaloneLayout[]
  /** `pages` with every legacy standalone page rewritten to reference its new layout. */
  pages: BookPage[]
}

/** Returns `null` when nothing needs converting, so callers can skip the write entirely. */
export function convertLegacyStandalonePages(input: {
  pages: Array<BookPage | LegacyStandaloneBookPage>
  specification: PageSpecification
  takenRoles: readonly LayoutRole[]
  newLayoutId: () => string
}): StandalonePageConversion | null {
  if (!input.pages.some(isLegacyStandalonePage)) return null
  const claimed = new Set<LayoutRole>(input.takenRoles)
  const layouts: ConvertedStandaloneLayout[] = []
  const pages = input.pages.map((page, index): BookPage => {
    if (!isLegacyStandalonePage(page)) return page
    const preferred = legacyStandaloneRole(page, index, input.pages.length)
    const role = preferred !== "static" && !claimed.has(preferred) ? preferred : "static"
    if (role !== "static") claimed.add(role)
    const id = input.newLayoutId()
    layouts.push({
      id,
      sourcePageId: page.id,
      name: legacyStandaloneName(page),
      role,
      schema: legacyStandaloneSchema(page, input.specification),
    })
    return { id: page.id, kind: "standalone", layoutId: id, problems: page.problems }
  })
  return { layouts, pages }
}
