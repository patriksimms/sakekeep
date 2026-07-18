# Sakekeep product and implementation plan

## Goal

Build a complete local-first web application in which an organizer creates a
questionnaire, shares an unguessable public link, collects anonymous responses,
designs mixed-layout friend-book pages, reviews the generated book, and exports
a print-ready DIN A5 landscape PDF.

The primary use cases are personal birthday gifts and farewell gifts for work
colleagues.

This document is the product source of truth for a long-running Codex goal. The
entire product described here is in scope. Implementation should proceed in
verified vertical milestones, leaving the application runnable at the end of
each milestone. Codex may make small, reversible implementation decisions that
are consistent with this plan and must record material decisions in the
repository. It must not silently remove requirements to finish sooner.

## Prototype boundary

This version is an unauthenticated prototype:

- There are no accounts and no Clerk integration.
- All organizer routes are accessible to anyone with access to the local app.
- The organizer is still represented as a product role, but ownership and
  authorization are not enforced.
- Anonymous share links remain separate from organizer routes so the intended
  production interaction model can be exercised.
- The application is intended for local evaluation only. It must not be
  deployed publicly or used for real personal data.
- Production authentication, authorization, abuse prevention, privacy policy,
  consent language, and formal retention policy are outside this prototype.
- A project can be deleted locally, including its submissions and stored
  assets, so test data can be removed. Individual submitted responses cannot be
  edited, excluded, or deleted through the normal organizer workflow.

The architecture should not assume that organizer routes will always remain
public, but it should not build a speculative authentication abstraction.

## Roles

### Organizer

The organizer creates projects and forms, publishes share links, inspects
responses, closes collection, creates layouts, generates and arranges a book,
and exports it.

### Contributor

A contributor follows a share link, completes a form without logging in, and
submits one anonymous response. Contributors cannot edit a response after it is
submitted. The same person may submit more than once; duplicate prevention is
not part of this version.

## End-to-end workflow

1. The organizer creates a draft project.
2. The organizer builds a form from ordered questions.
3. The organizer publishes the form and receives a randomized, unguessable
   share link. Publishing permanently freezes that form revision.
4. Contributors open the link on mobile or desktop, complete the form, and
   submit anonymously without logging in.
5. While collection is open, the organizer can inspect incoming submissions
   and the response count in read-only form.
6. The organizer permanently closes collection.
7. The organizer creates one or more reusable-within-the-project page layouts
   on a visual DIN A5 landscape canvas.
8. The organizer generates one book page for every submission, reviews
   warnings, changes individual layout assignments where needed, reorders
   pages, and adds standalone pages.
9. The organizer exports the complete book as a print-ready PDF.

## Project lifecycle

A project has one of these form states:

- `draft`: questions and form configuration are editable; no public form is
  available.
- `collecting`: publishing creates the share token and freezes the form;
  submissions are accepted.
- `closed`: closing is permanent and new submissions are rejected.

The generated book additionally has a derived status:

- `not-generated`: no generated book exists.
- `current`: generated pages reflect the current layouts, assignments, order,
  standalone pages, and submissions.
- `stale`: a change that affects rendering has occurred and the complete book
  must be regenerated before final export.

Editing a layout, changing a page assignment, changing page order, changing a
standalone page, or changing generation settings marks the book stale. Existing
generated output may remain visible as an explicitly stale preview, but it
cannot be exported as final output.

A published or closed project can be duplicated into a new editable draft. The
copy receives no submissions or share token. The original project, share link,
and responses remain unchanged.

## Form builder

Each ordered form item contains a question, a required/optional setting, and an
answer type:

- Single-line plain text
- Multiline plain text with preserved line breaks
- Radio buttons
- Checkboxes
- Image upload

Single-line and multiline questions can have an optional positive character
limit. Single-line text can enable URL validation; links are not a separate
answer or layout type. Radio and checkbox questions contain organizer-defined,
ordered choices. A required checkbox question requires at least one selection.

An image question has a configurable maximum of 1 to 10 images. Accepted input
formats are JPEG, PNG, WebP, HEIF, and HEIC. Each source image is limited to 15
MB and all images in one submission are limited to 50 MB. The upload pipeline
must normalize orientation, remove embedded metadata, retain a print-quality
master, and create an efficient preview derivative. HEIF and HEIC inputs must
be converted into a consistently renderable print master and preview without
silently reducing effective print resolution.

Question order is editable only while the project is a draft. Publishing is
allowed only when the form has at least one valid question and all question
configuration is complete.

## Anonymous form filling

- The public form is fully mobile-friendly and keyboard accessible.
- A contributor draft is autosaved in IndexedDB, including selected local image
  files. `localStorage` may hold only small metadata, not image blobs.
- Drafts are scoped to the share token and survive refreshes or closing and
  reopening the browser on the same device.
- A successful submission clears its saved draft.
- Client-side validation improves feedback, but the server independently
  validates the frozen form schema, required answers, choice membership,
  character limits, URL values, image types, counts, and sizes.
- A share token must contain at least 128 bits of cryptographically secure
  entropy. Tokens are stored in a form that does not unnecessarily expose them
  through routine database inspection.
- Unknown, malformed, draft, and closed share links return clear states without
  exposing project details.

## Layout editor

The visual editor uses Fabric.js 7 as its interaction and rendering engine.
React components provide the surrounding toolbar, sidebar, dialogs, and tabs.
The application's typed, versioned layout schema is canonical; raw Fabric.js
JSON is never stored as the source of truth.

Layout geometry is stored relative to the trimmed page so it remains independent
of editor screen size, device pixel ratio, zoom, and the export renderer.
Coordinates must also support elements extending into the bleed area.

The editor supports:

- Adding question-bound text elements
- Adding one-image frames and gallery frames for common arrangements such as
  two portrait images or four square images
- Static text
- Rectangles, circles, and lines
- Page background colours
- Decorative images
- Dragging, resizing, rotating, layering, aligning, duplicating, and deleting
  elements
- Selection through the canvas and layers list
- Undo and redo for editor operations
- Autosaving the canonical schema to the server with a debounce and visible
  saving, saved, and failed states
- Desktop and tablet layouts; phone support is not required for form creation or
  visual layout editing

Question-bound text settings include label visibility and text, font family,
size, minimum size, colour, style, alignment, line height, and one overflow
policy:

- Shrink to the configured minimum font size
- Truncate visibly
- Flag the page for manual attention

Image frames support focal-point cropping. Gallery frames define deterministic
slots; excess images are reported as a page problem and missing images leave
empty slots. A layout is compatible with a submission through the
question-bound elements it contains; no separate compatibility declaration is
needed. Missing optional text or images leave an accepted empty gap and do not
produce a warning.

Layouts are project-specific. The organizer may create, name, duplicate, edit,
reorder, and delete any number of layouts, provided a referenced layout cannot
be deleted without first resolving its page assignments.

## Book generation and review

One submitted response produces exactly one submission page. Standalone cover,
introduction, closing, and blank pages are also supported and are not tied to a
submission.

Submission pages initially follow submission order. Layouts can be assigned by:

- Cycling through the ordered layouts
- Seeded random assignment
- Manual assignment per page

The random seed is stored with the generation settings. Given the same ordered
submissions, layouts, and seed, assignment is reproducible. Adding or removing
inputs may change later assignments; the generated result is persisted so it
does not change merely because the page is reopened.

After generation, the organizer can override the layout for an individual
submission page and manually reorder all submission and standalone pages.
Regeneration rebuilds the entire book; selected-page regeneration is not
supported. Explicit manual assignments and manual page order are preserved
where their referenced pages and layouts still exist.

Generated pages flag actionable problems, including unresolved text overflow,
images below the resolution threshold, unsupported assets, gallery overflow,
and elements outside the allowed print area. Intentionally empty optional
elements are not problems. The review UI provides a navigable problem list and
prevents final export while blocking problems remain.

The final renderer reconstructs pages from the canonical layout schema and
print-quality image masters. It must not upscale or export the screen-sized
Fabric canvas.

## Print and PDF specification

The default book specification is:

- Standard: DIN/ISO A5 landscape
- Trim size: 210 mm × 148 mm
- Bleed: 3 mm on every edge
- Export page box including bleed: 216 mm × 154 mm
- Safe margin: 6 mm inside every trim edge; normal text and critical content
  must remain inside it
- Image target: 300 effective PPI at placed size
- Image warning threshold: below 300 effective PPI
- Blocking image threshold: below 150 effective PPI, unless the organizer uses
  an explicit per-image override that is recorded in the export report
- Geometry and text remain vector-based where practical
- Fonts are bundled with suitable embedding rights and embedded or subset in
  the PDF; system-only fonts are not offered
- Output target: color-managed PDF/X-4 with an embedded output intent
- Default print condition: PSO Coated v3 / FOGRA51; untagged uploaded RGB images
  are treated as sRGB and embedded profiles are preserved when safe
- Transparency remains live where PDF/X-4 permits it
- Bleed is included by default; crop and other printer marks are off by default
  and can be enabled explicitly because printer requirements differ
- Pages are exported as individual pages, not imposed printer spreads

The editor shows trim, bleed, and safe-area guides. Preflight verifies page
boxes, dimensions, image effective resolution, font embedding, output intent,
unresolved layout problems, and stale generation state. Export produces both
the PDF and a human-readable preflight report. If the chosen PDF library cannot
produce verifiable PDF/X-4, implementation must perform an early technical
spike and either add a suitable local conversion/preflight tool or document and
test the closest standards-compliant pipeline; it may not silently label a
normal PDF as PDF/X-4.

Print defaults were selected from these references and deliberately remain
overrideable for a future print-provider profile:

- The German Federal Government style guide lists A5 as 148 mm × 210 mm:
  <https://styleguide.bundesregierung.de/sg-de/medien/print-publikationen/formate/formate-2044334>
- Adobe recommends checking for images below 300 PPI and offers PDF/X-4 as a
  press-quality export target:
  <https://helpx.adobe.com/indesign/desktop/print/print-production-and-file-creation/produce-print-ready-pdf-files.html>
- The PDF Association explains that PDF/X requires embedded fonts and that
  PDF/X-4 uses an embedded output-intent ICC profile:
  <https://pdfa.org/technical-side-and-requirements-of-pdfx/>
- The 3 mm bleed is a common printer convention rather than part of the A-series
  paper-size standard; this print-provider guide combines 3 mm bleed, 300 PPI
  images at placed size, embedded fonts, and CMYK preparation:
  <https://www.print-bureau.co.uk/artwork-guidelines/>

## Organizer experience

- The application includes an aesthetic responsive landing page that explains
  the workflow and starts a project.
- The organizer workspace separates form, submissions, layouts, book review,
  and export into clear steps or tabs.
- Light and dark modes follow the system initially and include a persistent
  manual toggle.
- Prefer suitable Cult UI components; use shadcn/ui when Cult UI has no suitable
  accessible component. Product behavior and accessibility take precedence over
  visual novelty.
- Form-definition and layout-definition changes autosave to the server with a
  debounce. Navigation and closing the page flush pending saves where the
  platform permits it, and unsaved or failed changes are visibly communicated.
- Destructive and permanent transitions, especially publishing, closing
  collection, deleting a project, and regenerating a stale book, require clear
  confirmation and explain their consequences.

## Technology and repository conventions

- Bun runtime and package manager
- TanStack Start with Bun server runtime
- React and TypeScript with strict type checking
- TanStack Query for server-state coordination
- Tailwind CSS v4
- Cult UI, with shadcn/ui as fallback
- Fabric.js 7 for layout interaction
- PostgreSQL with Drizzle ORM and committed migrations
- RustFS using its S3-compatible API for local object storage
- Docker Compose for PostgreSQL and RustFS
- Oxlint and Oxfmt
- Vitest for unit and integration tests
- Playwright for end-to-end tests

The repository must include `.env.example`, a useful `.envrc` that does not
contain secrets, documented setup commands, deterministic seed data for demos
and tests, and health checks for local services. Tests must not depend on
external production services.

## Data and failure semantics

- Database records are the source of truth for projects, schemas, submissions,
  layouts, generation configuration, page order, and asset metadata.
- RustFS is the source of truth for image masters, previews, and generated
  export artifacts.
- Asset creation and database references must tolerate partial failure without
  leaving user-visible broken records. Orphan cleanup must be safe and
  repeatable.
- Autosave operations use revisions or equivalent optimistic concurrency so a
  slow response cannot overwrite a newer edit.
- Publishing and closing use server-side transactional state transitions.
- Submission creation is idempotent for a single client submission attempt so
  network retries do not accidentally create duplicates. This does not attempt
  to identify the contributor or prevent intentional repeat submissions.
- Generation is deterministic from persisted inputs, versions, assignments,
  order, and seed.
- Stored schemas are explicitly versioned and have tested migration or rejection
  behavior.

## Milestones

Each milestone must deliver a usable vertical slice, update documentation, and
pass all gates relevant at that point.

### 1. Running foundation

Scaffold the application and quality tooling; run PostgreSQL and RustFS through
Docker Compose; add Drizzle migrations, environment validation, health checks,
CI, theme support, and the initial accessible application shell.

### 2. Project and form creation

Create and persist draft projects; build, reorder, validate, and autosave every
question type; publish a frozen form with an unguessable share link; duplicate a
published project into a new draft.

### 3. Anonymous contribution

Render published forms responsively; persist drafts including images in
IndexedDB; validate and submit responses; process image masters and previews;
reject closed forms and invalid payloads; cover mobile contribution with
Playwright.

### 4. Collection management

Show response count and read-only submission detail while collecting; close
collection permanently; exercise retry, concurrency, and state-transition
failure cases.

### 5. Canonical layout schema and basic editor

Implement the versioned schema, relative geometry, Fabric adapter, canvas
selection and transforms, layers, undo/redo, autosave, basic text, shapes,
single-image frames, and print guides. Prove schema-to-canvas-to-schema
round-tripping without depending on raw Fabric JSON.

### 6. Complete layout authoring

Add question binding, text styling and overflow modes, gallery frames,
focal-point cropping, decorative images, alignment and layering tools, layout
duplication and ordering, and tablet usability.

### 7. Book generation and review

Generate submission pages with cycle, seeded-random, and manual assignments;
support complete regeneration, preserved overrides, page reordering,
standalone pages, stale-state handling, and navigable problem reporting.

### 8. Print renderer and PDF export

Complete the early PDF/X technical spike, render from source assets, implement
font embedding and color management, export the specified page boxes, run
preflight, and produce a PDF plus report. Add automated structural PDF checks
and representative visual regression fixtures.

### 9. Product completion and hardening

Finish the landing page and cohesive responsive UX; complete keyboard and
accessibility passes; test empty, loading, error, retry, and recovery states;
verify project deletion and orphan cleanup; optimize realistic multi-page books;
and complete the end-to-end acceptance suite and documentation.

## Acceptance criteria

The complete goal is done only when all of the following are true:

1. A fresh checkout can install dependencies, start PostgreSQL and RustFS,
   apply migrations, seed data, and start the app using documented commands.
2. An organizer can complete the entire workflow from project creation through
   verified PDF export without editing the database or object store manually.
3. Every stated question type, validation rule, lifecycle transition, layout
   element, assignment mode, standalone page type, review operation, and export
   rule in this plan is implemented.
4. A contributor can recover an interrupted draft with images on the same
   device, submit it once despite a network retry, and see clear success or
   failure feedback.
5. Server-side validation prevents clients from bypassing the frozen schema or
   submitting after collection closes.
6. Layouts round-trip through the canonical schema and reproduce equivalent
   geometry at different editor sizes and in final output.
7. Generation is reproducible, stale output cannot be exported, manual
   assignments and ordering obey the documented regeneration semantics, and
   every blocking layout problem is surfaced.
8. An automated PDF inspection confirms physical page boxes, bleed, embedded
   fonts, output intent, asset resolution metadata, page count, and absence of
   unresolved blocking preflight problems.
9. The public form passes representative mobile and desktop Playwright flows;
   organizer creation and editing pass desktop and tablet flows.
10. Keyboard navigation, visible focus, form labels, validation announcements,
    contrast, and reduced-motion behavior receive an automated and manual
    accessibility check.
11. No test or development workflow requires Clerk, a hosted database, hosted
    object storage, or another production service.
12. The repository contains no known high-severity dependency vulnerability and
    no committed secret.
13. The final implementation is reviewed against this document, and all
    deviations are either corrected or explicitly approved and recorded.

## Required verification gates

The final repository must expose and pass these commands (names may be wired to
the appropriate underlying tools during scaffolding):

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run test:e2e
bun run build
docker compose config --quiet
```

CI runs the non-interactive equivalents. Tests cover domain and state-machine
logic, validation, schema serialization and migration, relative geometry,
generation determinism, overflow behavior, effective image resolution,
autosave concurrency, upload failures, PDF structure and preflight, and the
critical end-to-end workflows.

Because visual correctness is central, milestone verification must include
saved screenshots or rendered fixtures for the public form, layout editor,
representative generated pages, and final PDF pages at desktop, tablet, and
required mobile sizes. Visual inspection supplements rather than replaces
behavioral assertions.

## Explicitly out of scope

Only the following are outside the complete prototype goal:

- Production deployment and operations
- Authentication, authorization, accounts, co-organizers, or shared ownership
- Production abuse prevention and rate-limiting policy
- Contributor response editing
- Intentional duplicate-person detection
- Organizer editing, exclusion, or deletion of an individual response
- Reopening a closed collection
- Regenerating only selected pages
- Reusing layouts between projects
- Markdown answers
- A separate link answer type
- Real payment, ordering, or integration with a print provider
- Formal production privacy, retention, and legal compliance work

Anything else described in this document remains in scope.
