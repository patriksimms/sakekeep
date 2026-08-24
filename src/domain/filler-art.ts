import { type LayoutElement, type LayoutSchema } from "./types.ts"

/**
 * Placeholder art for photo slots a contributor left unfilled. A layout with five frames and
 * three uploaded photos would otherwise print two blank rectangles, so the remaining slots get a
 * flat vector motif instead. The motif is drawn straight onto the page with no panel behind it,
 * so an unfilled slot reads as part of the page rather than as an empty card on top of it.
 *
 * Everything here is authored as SVG path data in one square coordinate system, which both the
 * HTML preview and the `pdf-lib` exporter draw directly. Staying vector keeps filler art out of
 * the effective-PPI preflight rules that apply to embedded photos, and keeps preview and print
 * identical without a second drawing implementation.
 */

/** Motifs are authored inside this square and scaled to a slot's shorter side. */
export const MOTIF_VIEWBOX = 100

export type FillerTone = "primary" | "secondary" | "ink"

export interface FillerShape {
  d: string
  tone: FillerTone
  /** Stroke the path at this width in motif units instead of filling it. */
  strokeWidth?: number
}

export interface FillerMotif {
  id: string
  family: "botanical" | "geometric" | "textural"
  shapes: FillerShape[]
}

export interface FillerPalette {
  primary: string
  secondary: string
  ink: string
}

const KAPPA = 0.5522847498307936

function round(value: number): number {
  return Number(value.toFixed(2))
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/** Rotates a point around a centre, so every motif helper can share one rotation convention. */
function rotator(cx: number, cy: number, angleDegrees: number) {
  const cos = Math.cos(radians(angleDegrees))
  const sin = Math.sin(radians(angleDegrees))
  return (x: number, y: number) =>
    `${round(cx + x * cos - y * sin)} ${round(cy + x * sin + y * cos)}`
}

/**
 * Ellipse as four cubic curves. Arcs would be shorter, but curves avoid depending on the `A`
 * command's parameterisation matching between the browser and pdf-lib's path parser.
 */
function ellipse(cx: number, cy: number, rx: number, ry: number, angleDegrees = 0): string {
  const at = rotator(cx, cy, angleDegrees)
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  return [
    `M ${at(-rx, 0)}`,
    `C ${at(-rx, -oy)} ${at(-ox, -ry)} ${at(0, -ry)}`,
    `C ${at(ox, -ry)} ${at(rx, -oy)} ${at(rx, 0)}`,
    `C ${at(rx, oy)} ${at(ox, ry)} ${at(0, ry)}`,
    `C ${at(-ox, ry)} ${at(-rx, oy)} ${at(-rx, 0)}`,
    "Z",
  ].join(" ")
}

function circle(cx: number, cy: number, r: number): string {
  return ellipse(cx, cy, r, r)
}

function rectangle(x: number, y: number, width: number, height: number): string {
  return `M ${x} ${y} L ${round(x + width)} ${y} L ${round(x + width)} ${round(y + height)} L ${x} ${round(y + height)} Z`
}

/** Rectangle rotated around its own centre, used for the scattered confetti bars. */
function bar(cx: number, cy: number, length: number, thickness: number, angleDegrees: number) {
  const at = rotator(cx, cy, angleDegrees)
  const halfLength = length / 2
  const halfThickness = thickness / 2
  return `M ${at(-halfLength, -halfThickness)} L ${at(halfLength, -halfThickness)} L ${at(halfLength, halfThickness)} L ${at(-halfLength, halfThickness)} Z`
}

/** Rectangle with a semicircular top. */
function arch(x: number, y: number, width: number, height: number): string {
  const r = width / 2
  const offset = r * KAPPA
  const springing = y + r
  return [
    `M ${x} ${round(y + height)}`,
    `L ${x} ${round(springing)}`,
    `C ${x} ${round(springing - offset)} ${round(x + r - offset)} ${y} ${round(x + r)} ${y}`,
    `C ${round(x + r + offset)} ${y} ${round(x + width)} ${round(springing - offset)} ${round(x + width)} ${round(springing)}`,
    `L ${round(x + width)} ${round(y + height)}`,
    "Z",
  ].join(" ")
}

/** Pie slice spanning ninety degrees clockwise from `startAngleDegrees`. */
function quarterDisc(cx: number, cy: number, r: number, startAngleDegrees: number): string {
  const start = radians(startAngleDegrees)
  const end = radians(startAngleDegrees + 90)
  const startX = cx + r * Math.cos(start)
  const startY = cy + r * Math.sin(start)
  const endX = cx + r * Math.cos(end)
  const endY = cy + r * Math.sin(end)
  const controlOne = `${round(startX - r * KAPPA * Math.sin(start))} ${round(startY + r * KAPPA * Math.cos(start))}`
  const controlTwo = `${round(endX + r * KAPPA * Math.sin(end))} ${round(endY - r * KAPPA * Math.cos(end))}`
  return `M ${cx} ${cy} L ${round(startX)} ${round(startY)} C ${controlOne} ${controlTwo} ${round(endX)} ${round(endY)} Z`
}

/** Pointed leaf drawn as two mirrored quadratic curves between its base and its tip. */
function leaf(baseX: number, baseY: number, tipX: number, tipY: number, bulge: number): string {
  const midX = (baseX + tipX) / 2
  const midY = (baseY + tipY) / 2
  const length = Math.hypot(tipX - baseX, tipY - baseY) || 1
  const normalX = ((baseY - tipY) / length) * bulge
  const normalY = ((tipX - baseX) / length) * bulge
  return [
    `M ${baseX} ${baseY}`,
    `Q ${round(midX + normalX)} ${round(midY + normalY)} ${tipX} ${tipY}`,
    `Q ${round(midX - normalX)} ${round(midY - normalY)} ${baseX} ${baseY}`,
    "Z",
  ].join(" ")
}

function bloomPetals(cx: number, cy: number, count: number, distance: number): FillerShape[] {
  return Array.from({ length: count }, (_, index) => {
    const angle = (360 / count) * index - 90
    return {
      d: ellipse(
        cx + Math.cos(radians(angle)) * distance,
        cy + Math.sin(radians(angle)) * distance,
        6.5,
        12,
        angle + 90
      ),
      tone: "primary" as const,
    }
  })
}

function dotGrid(): FillerShape[] {
  const positions = [22, 41, 60, 79]
  return positions.flatMap((y, row) =>
    positions.map((x, column) => ({
      d: circle(x, y, 5),
      tone: ((row + column) % 2 === 0 ? "primary" : "secondary") as FillerTone,
    }))
  )
}

function waveBand(y: number, tone: FillerTone): FillerShape {
  return {
    d: `M 12 ${y} Q 26 ${y - 9} 40 ${y} Q 54 ${y + 9} 68 ${y} Q 78 ${y - 6} 88 ${y}`,
    tone,
    strokeWidth: 4,
  }
}

/**
 * Nine motifs across three families. The count is deliberately coprime with the strides in
 * `fillerMotif`, which is what lets every slot in one frame land on a different motif.
 */
export const FILLER_MOTIFS: FillerMotif[] = [
  {
    id: "single-bloom",
    family: "botanical",
    shapes: [
      { d: rectangle(48.5, 46, 3, 40), tone: "ink" },
      ...bloomPetals(50, 38, 6, 13),
      { d: circle(50, 38, 7.5), tone: "secondary" },
    ],
  },
  {
    id: "leaf-pair",
    family: "botanical",
    shapes: [
      { d: rectangle(48.5, 18, 3, 68), tone: "ink" },
      { d: leaf(50, 64, 22, 42, 16), tone: "primary" },
      { d: leaf(50, 46, 78, 26, 16), tone: "secondary" },
    ],
  },
  {
    id: "berry-branch",
    family: "botanical",
    shapes: [
      // The berries sit on sampled points of the branch curve, so they read as growing from it.
      { d: "M 22 82 Q 42 66 50 40 Q 56 22 70 18", tone: "ink", strokeWidth: 3 },
      { d: circle(70, 18, 7), tone: "primary" },
      { d: circle(40.4, 61.4, 5.5), tone: "secondary" },
      { d: circle(31.25, 73.35, 4.5), tone: "ink" },
    ],
  },
  {
    id: "arch-stack",
    family: "geometric",
    shapes: [
      { d: arch(18, 20, 26, 58), tone: "primary" },
      { d: arch(50, 32, 22, 46), tone: "secondary" },
      { d: rectangle(14, 82, 72, 4), tone: "ink" },
    ],
  },
  {
    id: "circle-cluster",
    family: "geometric",
    shapes: [
      { d: circle(38, 42, 22), tone: "primary" },
      { d: circle(65, 55, 16), tone: "secondary" },
      { d: circle(45, 71, 9), tone: "ink" },
    ],
  },
  {
    id: "nested-arcs",
    family: "geometric",
    shapes: [
      { d: quarterDisc(16, 84, 68, 270), tone: "primary" },
      { d: quarterDisc(16, 84, 42, 270), tone: "secondary" },
      { d: quarterDisc(16, 84, 18, 270), tone: "ink" },
    ],
  },
  {
    id: "dot-grid",
    family: "textural",
    shapes: dotGrid(),
  },
  {
    id: "wave-bands",
    family: "textural",
    shapes: [waveBand(32, "primary"), waveBand(50, "ink"), waveBand(68, "secondary")],
  },
  {
    id: "confetti-scatter",
    family: "textural",
    shapes: [
      { d: circle(26, 30, 6), tone: "primary" },
      { d: bar(62, 26, 18, 5, -25), tone: "ink" },
      { d: circle(72, 52, 4.5), tone: "secondary" },
      { d: bar(34, 58, 16, 5, 35), tone: "secondary" },
      { d: circle(52, 74, 7), tone: "primary" },
      { d: bar(74, 78, 14, 5, -10), tone: "ink" },
    ],
  },
]

/**
 * Fallback accents for layouts that carry no shapes of their own, matching the colours the
 * background presets already use. The dark tone leads so a blank layout still gets an ink.
 */
const HOUSE_ACCENTS = ["#27485b", "#5b927b", "#b45f52", "#f0c66f"]

interface Channels {
  r: number
  g: number
  b: number
}

function parseHex(value: string): Channels | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim())?.[1]
  if (!hex) return null
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16),
  }
}

function toHex({ r, g, b }: Channels): string {
  return `#${[r, g, b].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`
}

function distance(left: Channels, right: Channels): number {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b)
}

function luminance({ r, g, b }: Channels): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Below this an accent reads as the page background rather than as art on top of it. */
const MINIMUM_ACCENT_CONTRAST = 45

function isShape(element: LayoutElement): element is Extract<LayoutElement, { fill: string }> {
  return element.type === "rectangle" || element.type === "circle" || element.type === "line"
}

/**
 * Colours the filler art from the layout itself rather than from a fixed theme, so art on a sage
 * and terracotta page does not arrive in someone else's palette. Background presets are copied
 * into a layout's elements when applied and their preset id is not stored, so the accents are
 * read back off the shapes the layout actually contains. This also covers hand-built layouts and
 * presets the organizer has since recoloured.
 *
 * Accents are ordered by how far they sit from the page background, so the most legible colour
 * leads rather than whichever panel happens to be largest.
 */
export function fillerPalette(schema: LayoutSchema): FillerPalette {
  const background = parseHex(schema.background) ?? { r: 255, g: 255, b: 255 }
  const candidates = schema.elements
    .filter(isShape)
    .flatMap((element) => {
      const channels = parseHex(element.fill)
      return channels
        ? [{ channels, area: element.geometry.width * element.geometry.height, id: element.id }]
        : []
    })
    .sort(
      (left, right) =>
        distance(right.channels, background) - distance(left.channels, background) ||
        right.area - left.area ||
        (left.id < right.id ? -1 : 1)
    )

  const accents: Channels[] = []
  const push = (channels: Channels) => {
    if (distance(channels, background) < MINIMUM_ACCENT_CONTRAST) return
    if (accents.some((accent) => distance(accent, channels) < 24)) return
    accents.push(channels)
  }
  for (const candidate of candidates) push(candidate.channels)
  for (const accent of HOUSE_ACCENTS) {
    if (accents.length >= 3) break
    const channels = parseHex(accent)
    if (channels) push(channels)
  }
  // A page coloured close to every house accent rejects them all; fall back to a paper tone.
  while (accents.length < 3) accents.push({ r: 245, g: 240, b: 232 })
  accents.sort((left, right) => distance(right, background) - distance(left, background))

  // One tone carries the line work: the accent furthest from the page in lightness, which is the
  // darkest on paper tones and the lightest on a dark page. The two most legible of the rest fill.
  const backgroundLuminance = luminance(background)
  const ink = accents.reduce((left, right) =>
    Math.abs(luminance(left) - backgroundLuminance) >=
    Math.abs(luminance(right) - backgroundLuminance)
      ? left
      : right
  )
  const [primary, secondary] = accents.filter((accent) => accent !== ink)

  return {
    primary: toHex(primary!),
    secondary: toHex(secondary!),
    ink: toHex(ink),
  }
}

function hash(value: string): number {
  let result = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }
  return result >>> 0
}

/** Coprime with the motif count, so stepping by one of these visits every motif before repeating. */
const STRIDES = [1, 2, 4, 5, 7, 8]

/**
 * Picks a motif for one empty slot. The seed is derived from the submission and the frame rather
 * than from anything generated per export, so regenerating a book never reshuffles the art, and
 * the stride guarantees that neighbouring slots inside one frame never show the same motif.
 */
export function fillerMotif(seed: string, slotIndex: number): FillerMotif {
  const seeded = hash(seed)
  const stride = STRIDES[(seeded >>> 8) % STRIDES.length]!
  const index = (seeded + slotIndex * stride) % FILLER_MOTIFS.length
  return FILLER_MOTIFS[index]!
}

/** Seed for every slot of one photo frame on one response's page. */
export function fillerSeed(submissionId: string, elementId: string): string {
  return `${submissionId}:${elementId}`
}

/**
 * Where a motif's square sits inside a slot of arbitrary shape: centred on the shorter side, so
 * the art never stretches. This is the same fit the preview gets from the SVG viewBox attribute
 * `preserveAspectRatio="xMidYMid meet"`; the exporter has to compute it.
 */
export function motifPlacement(width: number, height: number) {
  const size = Math.min(width, height)
  return {
    size,
    scale: size / MOTIF_VIEWBOX,
    offsetX: (width - size) / 2,
    offsetY: (height - size) / 2,
  }
}
