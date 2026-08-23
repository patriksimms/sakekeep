// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FORM_SCHEMA_VERSION, type LayoutRecord, type Project } from "#/domain/types.ts"
import { layoutFixture } from "#/test/fixtures.ts"

const updateLayout = vi.fn()
const layoutAction = vi.fn()

vi.mock("#/lib/api.ts", async () => {
  const actual = await vi.importActual<typeof import("#/lib/api.ts")>("#/lib/api.ts")
  return {
    ...actual,
    projectApi: {
      ...actual.projectApi,
      layoutAction: (...args: unknown[]) => layoutAction(...args),
      updateLayout: (...args: unknown[]) => updateLayout(...args),
    },
  }
})

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

vi.mock("#/components/layout-canvas.tsx", () => ({
  LAYOUT_ELEMENT_DRAG_TYPE: "application/x-sakekeep-layout-element",
  LayoutCanvas: () => <div>Canvas</div>,
}))

const { LayoutsPanel } = await import("./layout-editor.tsx")

function project(layouts: LayoutRecord[]): Project {
  return {
    id: layouts[0]?.projectId ?? "99999999-9999-4999-8999-999999999999",
    title: "Test",
    occasion: null,
    state: "closed",
    shareUrl: null,
    submissionCount: 0,
    formRevision: 0,
    formSchema: { version: FORM_SCHEMA_VERSION, questions: [] },
    bookStatus: "not-generated",
    pageFormat: "a5",
    pageOrientation: "landscape",
    layouts,
    book: null,
    archivedAt: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  }
}

function Harness({ initial }: { initial: Project }) {
  const [value, setValue] = useState(initial)
  return <LayoutsPanel project={value} onProjectChange={setValue} />
}

beforeEach(() => {
  vi.useFakeTimers()
  layoutAction.mockReset()
  updateLayout.mockReset()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  )
  Element.prototype.getAnimations = () => []
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("layout editor saves", () => {
  it("debounces the first edit after a successful save", async () => {
    const layout = layoutFixture()
    updateLayout.mockImplementation(
      (
        _projectId: string,
        _layoutId: string,
        input: { name: string; schema: LayoutRecord["schema"] }
      ) => Promise.resolve({ ...layout, ...input, revision: updateLayout.mock.calls.length })
    )
    render(<Harness initial={project([layout])} />)

    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "First edit" } })
    await act(() => vi.advanceTimersByTimeAsync(700))
    expect(updateLayout).toHaveBeenCalledTimes(1)
    await act(async () => {})

    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Second edit" } })
    await act(() => vi.advanceTimersByTimeAsync(699))
    expect(updateLayout).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(1))
    expect(updateLayout).toHaveBeenCalledTimes(2)
  })

  it("waits for the active layout save before switching editors", async () => {
    const first = layoutFixture()
    const second = { ...layoutFixture("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1), name: "Layout 2" }
    let finishSave: ((layout: LayoutRecord) => void) | undefined
    updateLayout.mockImplementation(
      (
        _projectId: string,
        _layoutId: string,
        input: { name: string; schema: LayoutRecord["schema"] }
      ) =>
        new Promise<LayoutRecord>((resolve) => {
          finishSave = resolve
        }).then(() => ({ ...first, ...input, revision: 1 }))
    )
    render(<Harness initial={project([first, second])} />)

    fireEvent.change(screen.getByLabelText("Layout name"), { target: { value: "Pending name" } })
    fireEvent.click(screen.getByRole("tab", { name: "Layout 2" }))

    expect(updateLayout).toHaveBeenCalledTimes(1)
    expect((screen.getByLabelText("Layout name") as HTMLInputElement).value).toBe("Pending name")

    await act(async () => finishSave?.(first))
    expect((screen.getByLabelText("Layout name") as HTMLInputElement).value).toBe("Layout 2")
  })

  it("selects a newly created background after the serialized mutation", async () => {
    const existing = layoutFixture()
    const created = {
      ...layoutFixture("cccccccc-cccc-4ccc-8ccc-cccccccccccc", 1),
      name: "Geometric collage background",
    }
    updateLayout.mockImplementation(
      (
        _projectId: string,
        _layoutId: string,
        input: { name: string; schema: LayoutRecord["schema"] }
      ) => Promise.resolve({ ...existing, ...input, revision: 1 })
    )
    layoutAction.mockResolvedValue(created)
    render(<Harness initial={project([existing])} />)

    fireEvent.change(screen.getByLabelText("Layout name"), {
      target: { value: "Edited original" },
    })
    fireEvent.click(screen.getByRole("button", { name: "New layout" }))
    fireEvent.click(screen.getByRole("button", { name: "Create Geometric collage background" }))
    await act(async () => {})

    expect(
      screen
        .getByRole("tab", { name: /Geometric collage background/ })
        .getAttribute("aria-selected")
    ).toBe("true")
    expect(screen.getByRole("tab", { name: /Edited original/ })).toBeTruthy()
  })

  it("can become archived while the panel remains mounted", () => {
    const value = project([layoutFixture()])
    const { rerender } = render(<LayoutsPanel project={value} onProjectChange={vi.fn()} />)

    rerender(
      <LayoutsPanel
        project={{ ...value, archivedAt: new Date(0).toISOString() }}
        onProjectChange={vi.fn()}
      />
    )

    expect(screen.getByText("This project is archived")).toBeTruthy()
  })
})
