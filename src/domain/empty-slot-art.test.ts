import { describe, expect, it } from "vitest"
import { emptySlotArtSchema, resolveEmptySlotArt } from "./empty-slot-art.ts"
import { addElement, emptyLayoutSchema, layoutSchemaValidator } from "./layout.ts"
import { generateBook } from "./generation.ts"
import { completeForm, cycleSettings, layoutFixture, submissionFixture } from "../test/fixtures.ts"

function gallery() {
  const schema = addElement(emptyLayoutSchema(), "gallery-frame", "photos")
  const element = schema.elements[0]!
  if (element.type !== "gallery-frame") throw new Error("Expected gallery")
  return { schema, element }
}

describe("empty slot artwork", () => {
  it("keeps legacy layouts enabled and resolves explicit choices before the layout switch", () => {
    const { schema, element } = gallery()
    const parsed = layoutSchemaValidator.parse(schema).elements[0]!
    expect(parsed).toHaveProperty("fillEmptySlots", true)
    const automatic = resolveEmptySlotArt(element, "page", 0)
    expect(automatic).toBeDefined()
    expect(
      resolveEmptySlotArt(element, "page", 0, { [element.id]: { 0: "blank" } })
    ).toBeUndefined()
    element.fillEmptySlots = false
    expect(resolveEmptySlotArt(element, "page", 0)).toBeUndefined()
    expect(
      resolveEmptySlotArt(element, "page", 0, { [element.id]: { 0: "single-bloom" } })?.id
    ).toBe("single-bloom")
    element.fillEmptySlots = true
    expect(resolveEmptySlotArt(element, "page", 0)).toEqual(automatic)
  })

  it("preserves choices across regeneration and drops removed slots permanently", () => {
    const { schema, element } = gallery()
    const layout = { ...layoutFixture(), schema }
    const input = {
      projectId: layout.projectId,
      form: completeForm,
      submissions: [submissionFixture("10000000-0000-4000-8000-000000000001", 1)],
      layouts: [layout],
      settings: cycleSettings,
    }
    const first = generateBook(input)
    first.pages[0]!.emptySlotArt = {
      [element.id]: { 0: "blank", 1: "single-bloom", 3: "leaf-pair" },
      removed: { 0: "blank" },
    }
    const regenerated = generateBook({ ...input, previousBook: first })
    expect(regenerated.pages[0]!.emptySlotArt).toEqual({
      [element.id]: { 0: "blank", 1: "single-bloom", 3: "leaf-pair" },
    })
    element.arrangement = "two-portrait"
    const narrowed = generateBook({ ...input, previousBook: regenerated })
    expect(narrowed.pages[0]!.emptySlotArt).toEqual({
      [element.id]: { 0: "blank", 1: "single-bloom" },
    })
    element.arrangement = "four-square"
    const widened = generateBook({ ...input, previousBook: narrowed })
    expect(widened.pages[0]!.emptySlotArt).toEqual(narrowed.pages[0]!.emptySlotArt)
    layout.schema.elements = []
    const removed = generateBook({ ...input, previousBook: widened })
    expect(removed.pages[0]!.emptySlotArt).toBeUndefined()
  })

  it("rejects unknown motifs and invalid slot indices at the API boundary", () => {
    expect(emptySlotArtSchema.safeParse({ frame: { 0: "unknown" } }).success).toBe(false)
    expect(emptySlotArtSchema.safeParse({ frame: { 4: "blank" } }).success).toBe(false)
    expect(emptySlotArtSchema.safeParse({ frame: { 0: "blank", 1: "leaf-pair" } }).success).toBe(
      true
    )
  })
})
