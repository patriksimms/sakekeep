import { createFileRoute } from "@tanstack/react-router"

import { PagePreview } from "#/components/book-review.tsx"
import { LayoutCanvas } from "#/components/layout-canvas.tsx"
import { DEFAULT_TEXT_SETTINGS } from "#/domain/layout.ts"
import {
  FORM_SCHEMA_VERSION,
  LAYOUT_SCHEMA_VERSION,
  type LayoutSchema,
  type Project,
  type SubmissionBookPage,
  type SubmissionSummary,
} from "#/domain/types.ts"

export const Route = createFileRoute("/layout-parity")({
  component: LayoutParityFixture,
})

const schema: LayoutSchema = {
  version: LAYOUT_SCHEMA_VERSION,
  trim: { widthMm: 210, heightMm: 148 },
  bleedMm: 3,
  safeMarginMm: 6,
  background: "#fbf3e7",
  elements: [
    {
      id: "bleed-panel",
      type: "rectangle",
      geometry: { x: -3, y: -3, width: 57, height: 154, rotation: 0 },
      opacity: 1,
      fill: "#cddfd7",
      stroke: "#416b61",
      strokeWidth: 0.8,
    },
    {
      id: "overlap-circle",
      type: "circle",
      geometry: { x: 160, y: -8, width: 54, height: 54, rotation: 0 },
      opacity: 0.62,
      fill: "#d89b73",
      stroke: "#7e4932",
      strokeWidth: 1.2,
    },
    {
      id: "decorative-crop",
      type: "decorative-image",
      geometry: { x: 3, y: 7, width: 45, height: 34, rotation: -6 },
      opacity: 0.92,
      assetId: "parity-decor",
      focalPoint: { x: 0.82, y: 0.18 },
    },
    {
      id: "static-heading",
      type: "static-text",
      geometry: { x: 61, y: 9, width: 111, height: 22, rotation: 0 },
      opacity: 1,
      content: "Same page, same geometry.",
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Source Serif 4",
        fontSize: 23,
        minFontSize: 12,
        color: "#3f2e27",
        fontWeight: "bold",
      },
    },
    {
      id: "bound-memory",
      type: "bound-text",
      geometry: { x: 62, y: 35, width: 118, height: 34, rotation: -3 },
      opacity: 0.88,
      questionId: "memory",
      showLabel: true,
      label: "A shared memory",
      text: {
        ...DEFAULT_TEXT_SETTINGS,
        fontFamily: "Inter",
        fontSize: 13,
        minFontSize: 8,
        color: "#384b47",
        fontStyle: "italic",
        alignment: "left",
        lineHeight: 1.35,
      },
    },
    {
      id: "image-crop",
      type: "image-frame",
      geometry: { x: 7, y: 55, width: 63, height: 78, rotation: 3 },
      opacity: 0.94,
      questionId: "photos",
      cornerRadius: 5,
      focalPoint: { x: 0.82, y: 0.2 },
    },
    {
      id: "gallery-crop",
      type: "gallery-frame",
      geometry: { x: 80, y: 76, width: 122, height: 61, rotation: -2 },
      opacity: 0.96,
      questionId: "photos",
      arrangement: "hero-two",
      gap: 3,
      focalPoint: { x: 0.18, y: 0.78 },
    },
    {
      id: "diagonal-line",
      type: "line",
      geometry: { x: 54, y: 137, width: 150, height: 8, rotation: 1 },
      opacity: 0.78,
      fill: "transparent",
      stroke: "#76564b",
      strokeWidth: 1.1,
    },
  ],
}

const submission: SubmissionSummary = {
  id: "parity-submission",
  sequence: 1,
  submittedAt: "2026-07-23T00:00:00.000Z",
  answers: {
    memory: "The rainy train ride that became the best afternoon of the trip.",
    photos: [
      {
        assetId: "parity-landscape",
        name: "landscape.svg",
        mimeType: "image/svg+xml",
        width: 600,
        height: 300,
        sizeBytes: 1,
        previewUrl: "/layout-parity-landscape.svg",
        focalPoint: { x: 0.5, y: 0.5 },
      },
      {
        assetId: "parity-portrait",
        name: "portrait.svg",
        mimeType: "image/svg+xml",
        width: 300,
        height: 600,
        sizeBytes: 1,
        previewUrl: "/layout-parity-portrait.svg",
        focalPoint: { x: 0.5, y: 0.5 },
      },
    ],
  },
}

const page: SubmissionBookPage = {
  id: "parity-page",
  kind: "submission",
  submissionId: submission.id,
  layoutId: "parity-layout",
  problems: [],
}

const project: Project = {
  id: "parity-project",
  title: "Layout parity fixture",
  occasion: null,
  state: "closed",
  formSchema: {
    version: FORM_SCHEMA_VERSION,
    questions: [
      {
        id: "memory",
        type: "multiline",
        prompt: "Which memory should be preserved?",
        required: true,
      },
      {
        id: "photos",
        type: "images",
        prompt: "Favourite photos",
        required: false,
        maxImages: 2,
      },
    ],
  },
  formRevision: 1,
  shareUrl: null,
  submissionCount: 1,
  bookStatus: "current",
  layouts: [
    {
      id: "parity-layout",
      projectId: "parity-project",
      name: "All supported elements",
      position: 0,
      revision: 1,
      schema,
      updatedAt: "2026-07-23T00:00:00.000Z",
    },
  ],
  book: null,
  submissions: [submission],
  createdAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
}

function LayoutParityFixture() {
  const decorativeAssetUrl = () => "/layout-parity-decor.svg"
  return (
    <main className="mx-auto flex w-fit flex-col gap-5 p-8">
      <div>
        <h1 className="font-heading text-2xl">Editor / preview parity fixture</h1>
        <p className="text-sm text-muted-foreground">
          Fixed schema, content, assets, fonts, viewport, and reduced motion.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-6" data-testid="layout-parity-fixture">
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Fabric editor</h2>
          <LayoutCanvas
            schema={schema}
            width={648}
            selectedId={null}
            onSelect={() => undefined}
            onChange={() => undefined}
            questions={project.formSchema.questions}
            previewSubmission={submission}
            decorativeAssetUrl={decorativeAssetUrl}
            showGuides={false}
          />
        </section>
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Book preview</h2>
          <PagePreview
            page={page}
            project={project}
            className="w-[648px]"
            decorativeAssetUrl={decorativeAssetUrl}
            showProblems={false}
          />
        </section>
      </div>
    </main>
  )
}
