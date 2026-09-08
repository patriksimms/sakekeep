import { getLocale, overwriteGetLocale } from "#/paraglide/runtime.js"

export const runtimeLocale = getLocale

// Existing fixtures and assertions describe English books. Locale-specific tests override this.
overwriteGetLocale(() => "en")
