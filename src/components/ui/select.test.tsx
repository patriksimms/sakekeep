// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select.tsx"

afterEach(cleanup)

function renderLayoutSelect({
  items,
  onValueChange,
  value,
}: {
  items: Array<{ label: string; value: string }>
  onValueChange?: ComponentProps<typeof Select>["onValueChange"]
  value: string
}) {
  render(
    <Select items={items} value={value} onValueChange={onValueChange}>
      <SelectTrigger aria-label="Layout">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
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
    const onValueChange = vi.fn()
    const trigger = renderLayoutSelect({
      items: [
        { label: longName, value: "first-layout-id" },
        { label: longName, value: "second-layout-id" },
      ],
      onValueChange,
      value: "first-layout-id",
    })

    expect(trigger.textContent).toContain(longName)
    expect(trigger.textContent).not.toContain("first-layout-id")

    trigger.focus()
    fireEvent.keyDown(trigger, { key: "ArrowDown" })
    fireEvent.keyDown(screen.getAllByRole("option", { name: longName })[0], {
      key: "ArrowDown",
    })
    fireEvent.keyDown(screen.getAllByRole("option", { name: longName })[1], {
      key: "Enter",
    })

    expect(onValueChange).toHaveBeenCalledOnce()
    expect(onValueChange.mock.calls[0]?.[0]).toBe("second-layout-id")
  })
})
