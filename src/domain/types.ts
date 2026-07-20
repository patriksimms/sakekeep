export const FORM_SCHEMA_VERSION = 1 as const
export const LAYOUT_SCHEMA_VERSION = 1 as const

export type ProjectState = "draft" | "collecting" | "closed"
export type BookStatus = "not-generated" | "current" | "stale"
export type QuestionType = "single-line" | "multiline" | "radio" | "checkboxes" | "images"

export interface BaseQuestion {
  id: string
  prompt: string
  required: boolean
  type: QuestionType
}

export interface SingleLineQuestion extends BaseQuestion {
  type: "single-line"
  characterLimit?: number
  validateUrl?: boolean
}

export interface MultilineQuestion extends BaseQuestion {
  type: "multiline"
  characterLimit?: number
}

export interface ChoiceQuestion extends BaseQuestion {
  type: "radio" | "checkboxes"
  choices: Array<{ id: string; label: string }>
}

export interface ImageQuestion extends BaseQuestion {
  type: "images"
  maxImages: number
}

export type FormQuestion = SingleLineQuestion | MultilineQuestion | ChoiceQuestion | ImageQuestion

export interface FormSchema {
  version: typeof FORM_SCHEMA_VERSION
  questions: FormQuestion[]
}

export interface ImageAnswer {
  assetId: string
  name: string
  mimeType: string
  width: number
  height: number
  sizeBytes: number
  previewUrl?: string
  masterUrl?: string
  focalPoint?: { x: number; y: number }
}

export type SubmissionAnswer = string | string[] | ImageAnswer[]
export type SubmissionAnswers = Record<string, SubmissionAnswer>

export interface SubmissionSummary {
  id: string
  sequence: number
  submittedAt: string
  answers: SubmissionAnswers
}

export type OverflowPolicy = "shrink" | "truncate" | "flag"
export type TextAlignment = "left" | "center" | "right"
export type FontStyle = "normal" | "italic"
export type FontWeight = "normal" | "bold"
export type LayoutElementType =
  | "bound-text"
  | "static-text"
  | "image-frame"
  | "gallery-frame"
  | "rectangle"
  | "circle"
  | "line"
  | "decorative-image"

export interface RelativeGeometry {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export interface LayoutElementBase {
  id: string
  type: LayoutElementType
  geometry: RelativeGeometry
  opacity: number
  locked?: boolean
}

export interface TextSettings {
  fontFamily: "Inter" | "Source Serif 4"
  fontSize: number
  minFontSize: number
  color: string
  fontStyle: FontStyle
  fontWeight: FontWeight
  alignment: TextAlignment
  lineHeight: number
  overflow: OverflowPolicy
}

export interface BoundTextElement extends LayoutElementBase {
  type: "bound-text"
  questionId: string
  showLabel: boolean
  label?: string
  text: TextSettings
}

export interface StaticTextElement extends LayoutElementBase {
  type: "static-text"
  content: string
  text: TextSettings
}

export interface ImageFrameElement extends LayoutElementBase {
  type: "image-frame"
  questionId: string
  cornerRadius: number
  focalPoint?: { x: number; y: number }
}

export type GalleryArrangement = "two-portrait" | "four-square" | "hero-two" | "three-column"

export interface GalleryFrameElement extends LayoutElementBase {
  type: "gallery-frame"
  questionId: string
  arrangement: GalleryArrangement
  gap: number
  focalPoint?: { x: number; y: number }
}

export interface ShapeElement extends LayoutElementBase {
  type: "rectangle" | "circle" | "line"
  fill: string
  stroke: string
  strokeWidth: number
}

export interface DecorativeImageElement extends LayoutElementBase {
  type: "decorative-image"
  assetId: string
  focalPoint: { x: number; y: number }
}

export type LayoutElement =
  | BoundTextElement
  | StaticTextElement
  | ImageFrameElement
  | GalleryFrameElement
  | ShapeElement
  | DecorativeImageElement

export interface LayoutSchema {
  version: typeof LAYOUT_SCHEMA_VERSION
  trim: { widthMm: 210; heightMm: 148 }
  bleedMm: 3
  safeMarginMm: 6
  background: string
  elements: LayoutElement[]
}

export interface LayoutRecord {
  id: string
  projectId: string
  name: string
  position: number
  revision: number
  schema: LayoutSchema
  updatedAt: string
}

export type AssignmentMode = "cycle" | "seeded-random" | "manual"
export type StandalonePageType = "cover" | "introduction" | "closing" | "blank"

export interface GenerationSettings {
  mode: AssignmentMode
  seed: string
  manualAssignments: Record<string, string>
  resolutionOverrides: string[]
}

export type ProblemCode =
  | "text-overflow"
  | "image-low-resolution"
  | "image-blocking-resolution"
  | "unsupported-asset"
  | "gallery-overflow"
  | "outside-print-area"
  | "missing-required-answer"

export interface PageProblem {
  id: string
  code: ProblemCode
  pageId: string
  elementId?: string
  assetId?: string
  message: string
  blocking: boolean
}

export interface SubmissionBookPage {
  id: string
  kind: "submission"
  submissionId: string
  layoutId: string
  problems: PageProblem[]
}

export interface StandaloneBookPage {
  id: string
  kind: "standalone"
  pageType: StandalonePageType
  title: string
  body: string
  background: string
  problems: PageProblem[]
}

export type BookPage = SubmissionBookPage | StandaloneBookPage

export interface GeneratedBook {
  projectId: string
  settings: GenerationSettings
  pages: BookPage[]
  sourceFingerprint: string
  generatedAt: string
  updatedAt: string
}

export interface Project {
  id: string
  title: string
  occasion: string | null
  state: ProjectState
  formSchema: FormSchema
  formRevision: number
  shareUrl: string | null
  submissionCount: number
  bookStatus: BookStatus
  layouts: LayoutRecord[]
  book: GeneratedBook | null
  submissions?: SubmissionSummary[]
  createdAt: string
  updatedAt: string
}

export interface ProjectSummary {
  id: string
  title: string
  occasion: string | null
  state: ProjectState
  submissionCount: number
  bookStatus: BookStatus
  createdAt: string
  updatedAt: string
}

export interface PreflightCheck {
  id: string
  label: string
  status: "pass" | "warning" | "fail"
  detail: string
}

export interface ExportReport {
  version: 1
  projectId: string
  sourceFingerprint: string
  generatedAt: string
  specification: {
    standard: "DIN/ISO A5 landscape"
    trimMm: [210, 148]
    bleedMm: 3
    mediaBoxMm: [216, 154]
    safeMarginMm: 6
    targetPpi: 300
    blockingPpi: 150
    printCondition: "PSO Coated v3 / FOGRA51"
    marks: boolean
  }
  checks: PreflightCheck[]
  overrides: Array<{ assetId: string; reason: string }>
  pdfx: {
    target: "PDF/X-4"
    structurallyVerified: boolean
    limitation: string | null
  }
}

export interface ExportArtifact {
  id: string
  pdfUrl: string
  reportUrl: string
  report: ExportReport
}
