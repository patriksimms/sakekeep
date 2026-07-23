"use client"

import { useEffect, useRef, useState } from "react"

import { Field, FieldLabel } from "#/components/ui/field.tsx"
import { Input } from "#/components/ui/input.tsx"

function formatNumericValue(value: number) {
  return String(Number(value.toFixed(3)))
}

function parseNumericDraft(value: string) {
  if (value.trim() === "") return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function NumericField({
  label,
  value,
  onChange,
  step = 0.5,
  min,
  max,
}: {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
}) {
  const [draft, setDraft] = useState(() => formatNumericValue(value))
  const focused = useRef(false)
  const parsedDraft = parseNumericDraft(draft)
  const bounded = (next: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next))
  const outOfRange =
    parsedDraft !== null &&
    ((min !== undefined && parsedDraft < min) || (max !== undefined && parsedDraft > max))

  useEffect(() => {
    if (!focused.current) setDraft(formatNumericValue(value))
  }, [value])

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input
        aria-label={label}
        aria-invalid={outOfRange || undefined}
        type="number"
        step={step}
        min={min}
        max={max}
        value={draft}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          const next = parseNumericDraft(nextDraft)
          if (next !== null) onChange(bounded(next))
        }}
        onBlur={() => {
          focused.current = false
          const next = parseNumericDraft(draft)
          if (next === null) {
            setDraft(formatNumericValue(value))
            return
          }
          const nextBounded = bounded(next)
          if (nextBounded !== value) onChange(nextBounded)
          setDraft(formatNumericValue(nextBounded))
        }}
      />
    </Field>
  )
}
