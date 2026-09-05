import * as m from "#/paraglide/messages.js"
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

/*
 * The old exporter drew these pages itself with fixed typography. The constants below mirror it so
 * a converted page keeps its appearance: a 15 mm side margin, the title baseline at 68 % of the
 * trim height measured from the bottom, the body baseline 14 mm under it on a 16 pt grid, and the
 * body stopping 12 mm above the trim edge.
 */
const TEXT_MARGIN_MM = 15
const TITLE_BASELINE_FRACTION = 0.32
const BODY_BASELINE_OFFSET_MM = 14
const BODY_BOTTOM_MARGIN_MM = 12
const TITLE_SIZE_PT = 30
const TITLE_LINE_HEIGHT = 1.25
const BODY_SIZE_PT = 12
/** 16 pt of leading on a 12 pt body, as the old exporter stepped its lines. */
const BODY_LINE_HEIGHT = 16 / 12
const MM_PER_POINT = 25.4 / 72

function lineHeightMm(sizePt: number, lineHeight: number): number {
  return sizePt * MM_PER_POINT * lineHeight
}

/**
 * A layout that renders the legacy title and body where the old standalone renderer put them: a
 * serif title over a sans body, both inset from the trim edge.
 *
 * Text boxes are top-anchored and the first baseline sits one line height below the box top, so
 * each box starts one line height above the baseline it has to reproduce.
 */
export function legacyStandaloneSchema(
  page: LegacyStandaloneBookPage,
  specification: PageSpecification
): LayoutSchema {
  const width = Math.max(20, specification.trimWidthMm - TEXT_MARGIN_MM * 2)
  const titleLine = lineHeightMm(TITLE_SIZE_PT, TITLE_LINE_HEIGHT)
  const bodyLine = lineHeightMm(BODY_SIZE_PT, BODY_LINE_HEIGHT)
  const titleBaseline = specification.trimHeightMm * TITLE_BASELINE_FRACTION
  const bodyBaseline = titleBaseline + BODY_BASELINE_OFFSET_MM
  const bodyTop = bodyBaseline - bodyLine
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
        y: Math.max(0, titleBaseline - titleLine),
        width,
        height: titleLine,
        rotation: 0,
      },
      opacity: 1,
      content: page.title,
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Source Serif 4",
        fontWeight: "bold",
        fontSize: TITLE_SIZE_PT,
        minFontSize: 6,
        color: "#292524",
        lineHeight: TITLE_LINE_HEIGHT,
        // The old exporter scaled an over-wide title down to one line.
        overflow: "shrink",
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
        height: Math.max(bodyLine, specification.trimHeightMm - BODY_BOTTOM_MARGIN_MM - bodyTop),
        rotation: 0,
      },
      opacity: 1,
      content: page.body,
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Inter",
        fontSize: BODY_SIZE_PT,
        minFontSize: BODY_SIZE_PT,
        color: "#57534e",
        lineHeight: BODY_LINE_HEIGHT,
        // The old exporter clipped the body to the lines that fit; truncating keeps that and
        // keeps an already-exported book from gaining a blocking overflow problem.
        overflow: "truncate",
      },
    })
  }
  return schema
}

export function legacyStandaloneName(page: LegacyStandaloneBookPage): string {
  const title = page.title.trim()
  if (!title) return page.pageType === "blank" ? m.ui_blank_page() : m.ui_standalone_page()
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
