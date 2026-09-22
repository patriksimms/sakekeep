# Deferred workspace tools

Before is `6701c78`; after is `1eef57d`. Screenshots use the real local application, seeded farewell project, dark theme, 1440 × 1000 viewport. Form, Layouts and Book review have matched before/after captures. Loading captures hold the actual tool module request in the browser test to expose the fallback; they do not replace the UI with a fixture.

## Production transfer

Built both revisions with the frozen Bun lockfile, demo mode disabled, analytics disabled and the same test Clerk publishable key. Served with `bun run server.ts`, including its normal gzip compression. Authentication uses a locally signed test JWT and the repository's Clerk backend fixture. Each measurement uses a fresh Chromium session on the same `/projects/11111111-1111-4111-8111-111111111111?tab=form` route, after the published form becomes visible.

`javascript-transfer.json` records browser Resource Timing entries for first-party `/assets/*.js`, including preload traffic. External Clerk SDK traffic is excluded. These are cold-cache byte measurements, not user load-time measurements.

| Metric                                                      |      Before |       After | Reduction |
| ----------------------------------------------------------- | ----------: | ----------: | --------: |
| Transferred JavaScript, including browser-reported overhead |   701,963 B |   361,855 B |     48.5% |
| Encoded response bodies                                     |   690,263 B |   347,455 B |     49.7% |
| Decoded JavaScript                                          | 2,179,875 B | 1,106,175 B |     49.3% |

The initial response no longer preloads the layout editor, book review, or their heavy layout dependencies. The remaining shared shell and form/response code still loads normally.

## Behavior checks

| Scenario                                      | Evidence                                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Open Form, then Responses                     | Browser test sees no tool module requests                                                    |
| First Layouts or Book review visit            | Browser test holds the module request and checks the localized status                        |
| Leave during module download, then return     | Component test confirms a single load and retained state                                     |
| Switch away during ongoing work               | Component test retains completion; existing book-regeneration browser tests cover generation |
| Enter Book review with unsaved layout changes | Existing browser tests cover flush, failed save and retry                                    |
| Direct tool URL                               | Initial-active component test and existing layout/book browser tests                         |

No changes outside the repository are required for deployment.
