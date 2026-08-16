// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./alert-dialog.tsx"
import { Button } from "./button.tsx"

afterEach(cleanup)

describe("alert dialog action", () => {
  it("runs the action and closes the dialog", async () => {
    const action = vi.fn()
    render(
      <AlertDialog>
        <AlertDialogTrigger render={<Button />}>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle>Confirm action?</AlertDialogTitle>
          <AlertDialogDescription>This action requires confirmation.</AlertDialogDescription>
          <AlertDialogAction onClick={action}>Confirm</AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    )

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    fireEvent.click(await screen.findByRole("button", { name: "Confirm" }))

    expect(action).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull())
  })
})
