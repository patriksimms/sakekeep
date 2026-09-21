// @vitest-environment jsdom

import { lazy, useEffect, useState } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"

import { DeferredWorkspaceTool } from "./deferred-workspace-tool.tsx"
import { Tabs, TabsContent } from "./ui/tabs.tsx"

afterEach(cleanup)

it("loads only on first visit and retains pending work and local state while hidden", async () => {
  let finishLoading!: (module: { default: typeof Tool }) => void
  let finishWork!: () => void
  const work = new Promise<void>((resolve) => {
    finishWork = resolve
  })
  const unmounted = vi.fn()
  function Tool() {
    const [value, setValue] = useState("draft")
    const [finished, setFinished] = useState(false)
    useEffect(() => {
      void work.then(() => setFinished(true))
      return unmounted
    }, [])
    return (
      <>
        <input
          aria-label="Draft"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <p>{finished ? "Finished" : "Working"}</p>
      </>
    )
  }
  const load = vi.fn(
    () =>
      new Promise<{ default: typeof Tool }>((resolve) => {
        finishLoading = resolve
      })
  )
  const LazyTool = lazy(load)
  function Workspace({ active }: { active: boolean }) {
    return (
      <Tabs value={active ? "tool" : "form"}>
        <TabsContent value="form">Form</TabsContent>
        <TabsContent value="tool" keepMounted>
          <DeferredWorkspaceTool tool="layouts" active={active} loadingLabel="Loading tool…">
            <LazyTool />
          </DeferredWorkspaceTool>
        </TabsContent>
      </Tabs>
    )
  }
  const view = render(<Workspace active={false} />)
  expect(load).not.toHaveBeenCalled()
  view.rerender(<Workspace active />)
  expect(load).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("status").textContent).toBe("Loading tool…")
  // Leaving during the download must not start another load or lose the tool on return.
  view.rerender(<Workspace active={false} />)
  await act(async () => finishLoading({ default: Tool }))
  view.rerender(<Workspace active />)
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "unsaved edit" } })
  view.rerender(<Workspace active={false} />)
  await act(async () => finishWork())
  view.rerender(<Workspace active />)
  expect(screen.getByRole<HTMLInputElement>("textbox").value).toBe("unsaved edit")
  expect(screen.getByText("Finished")).toBeDefined()
  expect(unmounted).not.toHaveBeenCalled()
  expect(load).toHaveBeenCalledTimes(1)
})

it("loads immediately when the tool is the initial tab", async () => {
  const load = vi.fn(async () => ({ default: () => <p>Tool ready</p> }))
  const Tool = lazy(load)
  render(
    <DeferredWorkspaceTool tool="book" active loadingLabel="Loading tool…">
      <Tool />
    </DeferredWorkspaceTool>
  )
  expect(await screen.findByText("Tool ready")).toBeDefined()
  expect(load).toHaveBeenCalledTimes(1)
})
