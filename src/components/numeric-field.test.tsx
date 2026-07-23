// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { NumericField } from "./numeric-field.tsx"

afterEach(cleanup)

function renderOpacityField(onChange = vi.fn()) {
  function Harness() {
    const [value, setValue] = useState(1)
    return (
      <NumericField
        label="Opacity"
        value={value}
        step={0.05}
        min={0}
        max={1}
        onChange={(next) => {
          onChange(next)
          setValue(next)
        }}
      />
    )
  }

  render(<Harness />)
  return {
    input: screen.getByRole("spinbutton", { name: "Opacity" }) as HTMLInputElement,
    onChange,
  }
}

describe("NumericField", () => {
  it("accepts fractions and restores the last canonical value after an incomplete draft", () => {
    const { input, onChange } = renderOpacityField()

    expect(input.getAttribute("step")).toBe("0.05")
    expect(input.getAttribute("min")).toBe("0")
    expect(input.getAttribute("max")).toBe("1")

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "0.35" } })
    expect(onChange).toHaveBeenLastCalledWith(0.35)
    expect(input.value).toBe("0.35")

    const acceptedCalls = onChange.mock.calls.length
    fireEvent.change(input, { target: { value: "" } })
    expect(onChange).toHaveBeenCalledTimes(acceptedCalls)
    expect(input.value).toBe("")

    fireEvent.blur(input)
    expect(input.value).toBe("0.35")
  })

  it("clamps out-of-range values and preserves both boundaries", () => {
    const { input, onChange } = renderOpacityField()

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "1.5" } })
    expect(onChange).toHaveBeenLastCalledWith(1)
    expect(input.getAttribute("aria-invalid")).toBe("true")
    fireEvent.blur(input)
    expect(input.value).toBe("1")

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "-0.5" } })
    expect(onChange).toHaveBeenLastCalledWith(0)
    fireEvent.blur(input)
    expect(input.value).toBe("0")

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: "1" } })
    expect(onChange).toHaveBeenLastCalledWith(1)
    fireEvent.blur(input)
    expect(input.value).toBe("1")
  })
})
