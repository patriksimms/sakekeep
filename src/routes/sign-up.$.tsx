import { SignUp } from "@clerk/tanstack-react-start"
import { createFileRoute } from "@tanstack/react-router"

export const Route = createFileRoute("/sign-up/$")({
  component: Page,
})

function Page() {
  return (
    <div className="flex min-h-[calc(100svh-10rem)] items-center justify-center py-12">
      <SignUp />
    </div>
  )
}
