import { useUser } from "@clerk/tanstack-react-start"
import { useEffect } from "react"

import { posthogToken, setAnalyticsUser, setupAnalyticsConsent } from "#/lib/analytics.ts"
import { isDemoMode } from "#/lib/demo-mode.ts"

export function Analytics() {
  useEffect(() => {
    void setupAnalyticsConsent()
  }, [])
  if (!posthogToken || isDemoMode) return null
  return <AnalyticsIdentity />
}

function AnalyticsIdentity() {
  const { isLoaded, user } = useUser()
  useEffect(() => {
    if (isLoaded) setAnalyticsUser(user?.id)
  }, [isLoaded, user?.id])
  return null
}
