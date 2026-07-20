# Sakekeep

Sakekeep is an unauthenticated, local-only prototype for collecting anonymous
memories and photos, composing a friend book, and exporting a print-ready DIN
A5 landscape PDF. `PLAN.md` is the product source of truth.

> Prototype warning: there is no authentication or authorization. Anyone who
> can reach the local server can open the organizer workspace. Use test data
> only and do not expose port 3000, PostgreSQL, or RustFS to an untrusted
> network.

## Requirements

- Bun 1.3.9
- Docker with Compose v2
- A Chromium-compatible system for Playwright (run
  `bunx playwright install chromium`)
- Optional for independent PDF inspection: Poppler (`pdfinfo` and `pdftoppm`)

No hosted database, object store, identity provider, or production service is
required.

## Fresh setup

```sh
git clone <repository-url>
cd sakekeep
cp .env.example .env
bun run setup
bun run dev
```

`bun run setup` installs dependencies, downloads and checksum-verifies the
official PSO Coated v3 ICC profile, starts PostgreSQL and RustFS, applies Drizzle
migrations, and seeds deterministic local data. Open
<http://localhost:3000>.

If you use direnv, run `direnv allow`; `.envrc` loads the documented local
template and lets an ignored `.env` override it without containing credentials
itself. Check service readiness with:

```sh
bun run health
```

The seed creates:

- **Lea’s farewell book** — closed, three responses, two layouts, and a current
  three-page generated book ready for review and export.
- **Mina’s 30th birthday** — collecting at
  <http://localhost:3000/s/oTC0yjSC98MvzGGiZh6x3rxgChqX5IU5> when the default
  development share secret is used.

Re-running `bun run db:seed` resets only those two deterministic demo projects.

## Product workflow

1. Create a draft project from `/projects`.
2. Add, configure, reorder, and autosave all question types.
3. Publish once to freeze the form and create an anonymous share link.
4. Let a contributor recover a browser-local IndexedDB draft, including image
   files, and submit with an idempotency key.
5. Review read-only submissions and permanently close collection.
6. Create canonical millimetre-based layouts with the Fabric.js editor.
7. Generate and review one page per response plus optional standalone pages.
8. Resolve blocking text, print-area, gallery, and image-resolution problems.
9. Export a structurally verified PDF/X-4-targeted PDF and preflight report.

Published or closed projects can be duplicated into a fresh draft without
copying responses or the public token.

## Useful commands

```sh
bun run services:up       # start PostgreSQL and RustFS
bun run services:down     # stop local services
bun run db:migrate        # apply Drizzle migrations
bun run db:seed           # reset deterministic demo projects
bun run storage:cleanup   # retry tombstoned/orphan object deletion
bun run setup:icc         # fetch and checksum-verify the ECI ICC profile
bun run dev               # development server on localhost:3000
bun run build             # production client and server build
bun run verify            # every required repository gate
```

The individual verification gates are:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
docker compose config --quiet
```

Vitest covers schema validation, lifecycle and concurrency behavior,
IndexedDB file recovery, layout geometry, deterministic generation, overflow,
effective PPI, image failures, and PDF/preflight structure. Playwright covers
mobile and desktop contribution, all organizer form types, publishing, tablet
layout review, book review, export, and automated WCAG A/AA scans. Saved visual
evidence lives under `visual-artifacts/`.

## Architecture

- TanStack Start, React, TypeScript, TanStack Query, Tailwind CSS, and shadcn
  Base UI components
- PostgreSQL with Drizzle migrations as the relational source of truth
- RustFS through the S3 API for print masters, previews, decorative assets, and
  export artifacts
- Sharp for orientation normalization, metadata removal, color-managed print
  masters, and sRGB WebP previews
- Fabric.js 7 as an interaction adapter over a typed, versioned canonical
  layout schema; raw Fabric JSON is never persisted
- `pdf-lib`, bundled OFL static fonts, and a locally downloaded PSO Coated v3
  output intent for individual-page 216 × 154 mm exports

Share tokens encode 192 HMAC-derived bits. Only their SHA-256 digest is stored
in PostgreSQL. Form and layout autosaves use revision checks and serialized
client queues, and submissions use persisted UUID idempotency keys.

## PDF verification scope

The renderer emits 210 × 148 mm TrimBoxes inside 216 × 154 mm Media/BleedBoxes,
embeds all offered fonts, embeds the FOGRA51 output intent, retains vector text
and geometry, and exports source image masters rather than the screen canvas.
The included inspection verifies page count, boxes, fonts, output intent,
metadata, resolution reporting, and unresolved blockers.

This prototype does not run an independent commercial or ISO 15930 conformance
validator. The precise PDF/X-4 claim boundary, ICC licensing decision, and
manual Poppler verification procedure are documented in
`docs/PDF_PIPELINE.md`.

## Reset and cleanup

`docker compose down` preserves service volumes. To remove all local database
and object-store data, use `docker compose down -v` only when that destructive
reset is intended. Normal project deletion writes object tombstones before
best-effort cleanup; `bun run storage:cleanup` safely retries failures.
