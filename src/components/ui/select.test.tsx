// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { Select, SelectTrigger, SelectValue } from "./select.tsx"

afterEach(cleanup)

function renderLayoutSelect({
  items,
  value,
}: {
  items: Array<{ label: string; value: string }>
  value: string
}) {
  render(
    <Select items={items} value={value}>
      <SelectTrigger aria-label="Layout">
        <SelectValue />
      </SelectTrigger>
    </Select>
  )

  return screen.getByRole("combobox", { name: "Layout" })
}

describe("layout select labels", () => {
  it("renders the selected item's label instead of its stored value", () => {
    const trigger = renderLayoutSelect({
      items: [
        { label: "Portrait", value: "layout-portrait-id" },
        { label: "Collage", value: "layout-collage-id" },
      ],
      value: "layout-collage-id",
    })

    expect(trigger.textContent).toContain("Collage")
    expect(trigger.textContent).not.toContain("layout-collage-id")
  })

  it("maps duplicate and long labels by their distinct values", () => {
    const longName =
      "A deliberately long duplicate layout name that must remain human-readable when truncated"
    const trigger = renderLayoutSelect({
      items: [
        { label: longName, value: "first-layout-id" },
        { label: longName, value: "second-layout-id" },
      ],
      value: "second-layout-id",
    })

    expect(trigger.textContent).toContain(longName)
    expect(trigger.textContent).not.toContain("second-layout-id")
  })
})
