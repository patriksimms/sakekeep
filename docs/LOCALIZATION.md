# Languages

German is the base locale. The organizer interface checks `PARAGLIDE_LOCALE`, then the browser's preferred language, then falls back to German. The header language menu writes the cookie and reloads the current URL. URLs have no language prefix.

Each project has its own `bookLanguage`, chosen when creating it and prefilled from the organizer's current language. Share links, contributor validation, print defaults, and German hyphenation use that explicit language. Switching the organizer interface does not change a book or its contributions. Existing projects and the English-authored seed fixtures remain English.

Messages live in `messages/de.json` and `messages/en.json`. `bun install` compiles them through Paraglide; Vite recompiles them during development. Run `bun run i18n:compile` after changing messages without a dev server. Generated files in `src/paraglide` are ignored.

Code that reaches contributors or print must pass a locale explicitly. Organizer-facing messages may use the ambient request locale. Do not evaluate ambient messages at module initialization; shared label definitions use getters so SSR requests do not retain another request's language.

The shared text engine uses German 1996 syllable patterns only for German books. It puts visible hyphens into the measured lines, which both browser and PDF renderers consume. English keeps its previous wrapping behavior. A German book with an older `layoutEngineVersion` is stale and must be regenerated before export.

Page problems persist codes and parameters, rather than translated prose. Migration removes old English problem messages while keeping their codes and page references. Regenerate an old book to recover detailed measurements that were previously stored only as prose.

# Deployment

Run the normal database migrations before starting the updated application. They backfill existing projects to English, default new projects to German, and convert stored book problems. No new environment variables or infrastructure services are required.

Clerk authentication UI uses the bundled German or English localization. Clerk's dashboard controls authentication email templates and language configuration; configure German emails there separately. This delivery does not change live Clerk settings.

Patrik will update the legal texts separately. The existing privacy policy and imprint remain in English until that update.
