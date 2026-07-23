import { describe, expect, it } from "vitest"

import {
  boundQuestionLabel,
  boundQuestionPlaceholder,
  layoutQuestionPalette,
} from "./layout-question-palette.ts"

describe("layout question palette", () => {
  it("maps text, choice, and image questions to bound element actions", () => {
    expect(
      layoutQuestionPalette([
        { id: "short", prompt: "Short answer", type: "single-line" },
        { id: "long", prompt: "Long answer", type: "multiline" },
        { id: "radio", prompt: "Choose one", type: "radio" },
        { id: "checks", prompt: "Choose many", type: "checkboxes" },
        { id: "photos", prompt: "Favourite photos", type: "images" },
      ])
    ).toEqual([
      {
        questionId: "short",
        prompt: "Short answer",
        actions: [{ elementType: "bound-text", label: "Text" }],
      },
      {
        questionId: "long",
        prompt: "Long answer",
        actions: [{ elementType: "bound-text", label: "Text" }],
      },
      {
        questionId: "radio",
        prompt: "Choose one",
        actions: [{ elementType: "bound-text", label: "Text" }],
      },
      {
        questionId: "checks",
        prompt: "Choose many",
        actions: [{ elementType: "bound-text", label: "Text" }],
      },
      {
        questionId: "photos",
        prompt: "Favourite photos",
        actions: [
          { elementType: "image-frame", label: "Image" },
          { elementType: "gallery-frame", label: "Gallery" },
        ],
      },
    ])
  })

  it("keeps duplicate prompts as distinct ID-backed controls", () => {
    const palette = layoutQuestionPalette([
      { id: "first", prompt: "A memory", type: "multiline" },
      { id: "second", prompt: "A memory", type: "single-line" },
    ])

    expect(palette).toHaveLength(2)
    expect(palette.map((item) => item.questionId)).toEqual(["first", "second"])
    expect(palette.map((item) => item.prompt)).toEqual(["A memory", "A memory"])
  })

  it("uses a stable fallback for blank prompts", () => {
    expect(
      layoutQuestionPalette([{ id: "empty", prompt: "   ", type: "single-line" }])[0]?.prompt
    ).toBe("Untitled question")
    expect(boundQuestionPlaceholder([{ id: "empty", prompt: " " }], "empty")).toBe(
      "{{ Untitled question }}"
    )
    expect(boundQuestionPlaceholder([], "missing")).toBe("{{ Untitled question }}")
    expect(boundQuestionLabel([{ id: "empty", prompt: " " }], "empty")).toBe("Untitled question")
    expect(boundQuestionLabel([], "missing")).toBe("Unbound element")
  })
})
