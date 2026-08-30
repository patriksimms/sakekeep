# Sakekeep

Sakekeep is a private shared organizer workspace for collecting anonymous
memories and photos, composing a friend book, and exporting a print-ready DIN
A4, A5, or A6 PDF in portrait or landscape. `PLAN.md` is the product source of truth.

Clerk authentication protects every organizer page and API. Contributor links
remain anonymous and token-based.

## Requirements

- Bun 1.3.9
- Docker with Compose v2
- A Chromium-compatible system for Playwright (run
  `bunx playwright install chromium`)
- Optional for independent PDF inspection: Poppler (`pdfinfo` and `pdftoppm`)

Clerk is required outside explicit local/test demo mode. PostgreSQL and an
S3-compatible object store are required for application data.

## Fresh setup

```sh
git clone <repository-url>
cd sakekeep
cp .envrc.example .envrc
# Add development Clerk keys to .envrc, or set VITE_SAKEKEEP_DEMO_MODE=true for
# local-only exploration.
direnv allow
bun run setup
bun run dev
```

`bun run setup` installs dependencies, downloads and checksum-verifies the
official PSO Coated v3 ICC profile, starts PostgreSQL and RustFS, applies Drizzle
migrations, and seeds deterministic local data. Open
<http://localhost:3000>.

The ignored `.envrc` is the single source for local environment overrides;
`.envrc.example` documents the required shape without containing credentials.
After changing `.envrc`, run `direnv allow` again. Check service readiness with:

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
   files dropped onto or picked for the photo questions, agree to the privacy
   policy, and submit with an idempotency key.
5. Review submissions, permanently close collection, and correct submitted text with visible edit
   history when needed.
6. Create canonical millimetre-based layouts with the Fabric.js editor.
7. Generate and review one page per response plus optional standalone pages.
8. Resolve blocking text, print-area, gallery, and image-resolution problems.
9. Export a structurally verified PDF/X-4-targeted PDF and preflight report.
   Every export also produces a ZIP of one PDF per page and a ZIP of one
   300 PPI JPEG per page, so the format is chosen when downloading.

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
bun run start             # native Bun production server after a build
bun run smoke:production  # isolated production Compose smoke test (requires Clerk test credentials)
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
bun run scripts/check-production-compose.ts
```

Vitest covers schema validation, lifecycle and concurrency behavior,
IndexedDB file recovery, layout geometry, deterministic generation, overflow,
effective PPI, image failures, and PDF/preflight structure. Playwright covers
mobile and desktop contribution, all organizer form types, publishing, tablet
layout review, book review, export, and automated WCAG A/AA scans. Saved visual
evidence lives under `visual-artifacts/`.

## Authentication and route policy

Any user admitted to the linked Clerk instance can access the shared organizer
workspace. There is no per-user project ownership or tenant isolation.

- Authenticated organizer surfaces: `/projects/**`, `/layout-parity`,
  `/api/projects/**`, `/api/assets/**`, and `/api/exports/**`.
- Public surfaces: `/`, `/imprint`, `/sign-in/**`, the restricted Clerk
  invitation flow at `/sign-up/**`, `/s/:token`, `/api/share/:token`,
  `/api/health`, and static assets.
- Signed-out organizer page requests redirect to `/sign-in` with a same-origin
  return path. Signed-out organizer API requests receive JSON `401`.

`VITE_SAKEKEEP_DEMO_MODE=true` bypasses Clerk only for local development and
tests. Production startup and builds reject demo mode and missing Clerk keys.
Never enable demo mode in a public deployment.

The committed `clerk/auth-access-control.json` keeps registration restricted.
After linking the application and creating its production instance, apply and
verify both environments:

```sh
clerk config patch --instance dev --file clerk/auth-access-control.json --yes
clerk config patch --instance prod --file clerk/auth-access-control.json --yes
clerk config pull --instance dev --keys auth_access_control
clerk config pull --instance prod --keys auth_access_control
```

Both `config pull` commands must report a non-public `sign_up_mode` before
deployment.

## Architecture

- TanStack Start, React, TypeScript, TanStack Query, Tailwind CSS, and shadcn
  Base UI components
- PostgreSQL with Drizzle migrations as the relational source of truth
- S3-compatible object storage for print masters, previews, decorative assets,
  and export artifacts
- Sharp for orientation normalization, metadata removal, color-managed print
  masters, and sRGB WebP previews
- Fabric.js 7 as an interaction adapter over a typed, versioned canonical
  layout schema; raw Fabric JSON is never persisted
- `pdf-lib`, bundled OFL static fonts, and a locally downloaded PSO Coated v3
  output intent for individual-page DIN A4, A5, and A6 exports
- PDFium (WebAssembly) with Sharp for the optional per-page JPEG bundle, and
  `fflate` for the ZIP bundles

Share tokens encode 192 HMAC-derived bits. Only their SHA-256 digest is stored
in PostgreSQL. Form and layout autosaves use revision checks and serialized
client queues, and submissions use persisted UUID idempotency keys.

## PDF verification scope

The renderer emits format-specific TrimBoxes inside Media/BleedBoxes with 3 mm
bleed, embeds all offered fonts, embeds the FOGRA51 output intent, retains vector text
and geometry, and exports source image masters rather than the screen canvas.
The included inspection verifies page count, boxes, fonts, output intent,
metadata, resolution reporting, and unresolved blockers.

This prototype does not run an independent commercial or ISO 15930 conformance
validator. The precise PDF/X-4 claim boundary, ICC licensing decision, and
manual Poppler verification procedure are documented in
`docs/PDF_PIPELINE.md`.

## Production deployment

The production image uses the repository-pinned Bun runtime and serves the
TanStack Start fetch handler through the native server in `server.ts`; it does
not use Vite preview or Nitro. `docker-compose.coolify.yml` adds the application,
one-shot migrations, internal-only PostgreSQL, external S3-compatible object storage,
health checks, and a persistent database volume. The complete Coolify,
Cloudflare, backup, restore, migration, cleanup, logging, sizing, and smoke-test
procedure is in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

Do not expose a deployment publicly until organizer authorization and
restricted Clerk sign-up in issue #23 are complete.

## Reset and cleanup

`docker compose down` preserves service volumes. To remove all local database
and object-store data, use `docker compose down -v` only when that destructive
reset is intended. A tombstone marks an object as unowned and doubles as a
claim ticket: project deletion, an in-flight export, and `bun run
storage:cleanup` all have to remove the row before they may touch the object,
so exactly one of them wins and the others back off. Project
deletion tombstones its objects and deletes them straight away; an export holds
tombstones over its uploads and wins them back when it records the export row.
`storage:cleanup` only goes after tombstones older than an hour, and an export
that somehow runs past that fails with a conflict instead of being recorded
against files the sweep already removed.
