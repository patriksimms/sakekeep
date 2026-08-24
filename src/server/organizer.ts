import { auth, clerkClient } from "@clerk/tanstack-react-start/server"

import { isDemoMode } from "#/lib/demo-mode.ts"

import { HttpError } from "./http.ts"

export interface OrganizerIdentity {
  userId: string
  name: string
}

export async function currentOrganizer(): Promise<OrganizerIdentity> {
  if (isDemoMode) return { userId: "demo-organizer", name: "Demo organizer" }

  const { userId, sessionClaims } = await auth({ treatPendingAsSignedOut: true })
  if (!userId) throw new HttpError(401, "Authentication required.")

  const claimedName = (sessionClaims as { name?: unknown } | null)?.name
  if (typeof claimedName === "string" && claimedName.trim()) {
    return { userId, name: claimedName.trim() }
  }

  try {
    const user = await clerkClient().users.getUser(userId)
    const name = [user.firstName, user.lastName].filter(Boolean).join(" ")
    return {
      userId,
      name: name || user.primaryEmailAddress?.emailAddress || userId,
    }
  } catch {
    // The stable Clerk user ID still leaves an accountable edit if profile lookup is unavailable.
    return { userId, name: userId }
  }
}
