# Coolify production deployment

This runbook deploys Sakekeep as a Coolify Docker Compose stack. Projects are private
and membership is stored in Sakekeep. Clerk handles accounts and invitation email.

## Opening registration on an existing installation

Keep Clerk registration restricted while deploying this change. Do not apply the
committed public Clerk configuration until the following steps have finished:

1. Back up the database and deploy the new image and schema migration.
2. In the app container, run `bun run scripts/backfill-project-owners.ts patriksimms@outlook.de`.
   It requires the environment's `DATABASE_URL` and `CLERK_SECRET_KEY`, resolves exactly
   one account with that verified email, and assigns only projects without an owner.
   It is safe to repeat and does not change ownership of newer projects.
3. Verify the owner can open existing projects and a separate account cannot list,
   read, edit, or download their files. Unassigned projects remain inaccessible.
4. Apply `clerk/auth-access-control.json` to the intended Clerk instance. Verify
   `auth_access_control.sign_up_mode` is `public`. New accounts can now create projects.
5. Set Clerk's sign-in and sign-up paths to `/sign-in` and `/sign-up`, with `/projects`
   as the fallback destination. Allow the application's `APP_ORIGIN` for redirects.
   Invitations redirect to `/invitations/:token`, which handles both existing and new accounts.
6. Send a real test invitation from the deployed app and verify registration/sign-in,
   email verification, project acceptance, and revocation with a separate account.

The backfill and Clerk configuration changes are explicit deployment operations,
not automatic application startup tasks. Use each environment's own Clerk keys.
No additional email service, secret, or workspace configuration is required.
Clerk sends invitation emails through its application invitation API, which is
limited to 100 requests per hour per instance. Delivery errors are shown in the app;
retry sends a fresh invitation. Sakekeep binds seven-day invitations to a verified
email and stores only a token hash. Revoked and expired links cannot grant access.

## Stack and configuration

`docker-compose.coolify.yml` builds one image with separate `runtime` and
`migrate` targets. The one-shot migration container must complete before the
application starts. PostgreSQL is reachable only by Compose service DNS, while
the app uses external S3-compatible object storage. Only the `app` service
receives a Coolify domain.

Configure these Coolify build-time and runtime values:

| Variable                     | Scope         | Requirement                                      |
| ---------------------------- | ------------- | ------------------------------------------------ |
| `POSTGRES_PASSWORD`          | Runtime       | Unique generated password                        |
| `DATABASE_URL`               | Runtime       | PostgreSQL URL with percent-encoded password     |
| `S3_ENDPOINT`                | Runtime       | Object-store HTTPS endpoint                      |
| `S3_REGION`                  | Runtime       | Region used to sign S3 requests                  |
| `S3_ACCESS_KEY_ID`           | Runtime       | Object-store access key                          |
| `S3_SECRET_ACCESS_KEY`       | Runtime       | Object-store secret key                          |
| `S3_BUCKET`                  | Runtime       | Existing object-store bucket name                |
| `SHARE_TOKEN_SECRET`         | Runtime       | At least 48 random characters; keep stable       |
| `APP_ORIGIN`                 | Runtime       | Final `https://<hostname>` origin                |
| `VITE_SAKEKEEP_DEMO_MODE`    | Build/runtime | Fixed to `false`                                 |
| `VITE_CLERK_PUBLISHABLE_KEY` | Build/runtime | Clerk production publishable key                 |
| `CLERK_SECRET_KEY`           | Runtime       | Clerk production secret key                      |
| `VITE_POSTHOG_PROJECT_TOKEN` | Build/runtime | Optional PostHog publishable project token       |
| `POSTHOG_HOST`               | Runtime       | Optional; defaults to `https://eu.i.posthog.com` |
| `NODE_ENV`, `HOST`, `PORT`   | Runtime       | Fixed to `production`, `0.0.0.0`, `3000`         |

Compose uses required-variable expressions, so missing secrets stop
configuration before deployment. The application also rejects local defaults,
demo mode, short share secrets, and non-HTTPS origins in production. Values
starting with `VITE_` are public browser configuration; never put a secret in
one. `DATABASE_URL` must use the same password as `POSTGRES_PASSWORD`, with
reserved URL characters percent-encoded (for example, `#` becomes `%23` and
`/` becomes `%2F`).

`VITE_POSTHOG_PROJECT_TOKEN` enables PostHog analytics and must be provided
both at build time (client bundle) and at runtime (ingest proxy and server
error reporting); leave it unset to ship without any PostHog integration. A
build with the token whose runtime lacks it serves 404s on `/ingest/*` and
sends nothing.

To validate the production definition without using real credentials:

```sh
bun run scripts/check-production-compose.ts
```

## First deployment

1. In Coolify, create a resource from this Git repository and select the Docker
   Compose build pack.
2. Set the Compose file to `/docker-compose.coolify.yml`.
3. Add the variables above. Mark runtime secrets as secret values and make
   `VITE_CLERK_PUBLISHABLE_KEY` available during the image build.
4. Deploy. Confirm `postgres` becomes healthy, `migrate` exits zero, and `app`
   becomes healthy. The migration service uses `restart: "no"` because it is
   intentionally one-shot; current Coolify excludes such services from
   long-running status evaluation.
5. Assign `https://<hostname>:3000` to the `app` service only. `3000` is the
   container target; Coolify's proxy serves normal public HTTPS. Do not add
   domains or host port mappings for PostgreSQL.
6. Verify project isolation, then follow the registration steps above.

The `postgres-data` named volume survives app rebuilds and normal redeployments.
Objects persist in the external object-store bucket. Never select a destructive
database volume reset or empty the bucket for a routine deployment.

## Cloudflare and firewall

1. Add a Cloudflare `A` record for the chosen hostname pointing to the Coolify
   server.
2. Start with the record **DNS only**. Wait for Coolify routing and its origin
   certificate to work over HTTPS.
3. Enable the Cloudflare proxy.
4. Set SSL/TLS encryption to **Full (strict)** and enable **Always Use HTTPS**.
5. Do not add a cache rule for `/api/**`. Dynamic and API responses are not
   cached by the application; fingerprinted `/assets/**` files are immutable.

The server firewall should expose only SSH as operationally required and the
Coolify proxy's HTTP/HTTPS ports. Port 3000 and PostgreSQL 5432 must not be
reachable from the public network. Allow outbound HTTPS from the app to the
configured object-store endpoint.

## Verification

After deployment:

```sh
curl --fail --silent https://<hostname>/api/health
```

The endpoint returns `200` only when both PostgreSQL and the object store respond.
Stopping either dependency must change it to `503`.

For a destructive, isolated local production-stack smoke test, create a Clerk
test instance that allows `http://127.0.0.1:33000`, set
`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_TEST_USER_EMAIL`, and
`CLERK_TEST_USER_PASSWORD`, then run:

```sh
bun run smoke:production
```

The smoke test uses a uniquely named Compose project, builds the production
targets, adds an isolated RustFS service through `docker-compose.smoke.yml`,
starts an empty stack, runs migrations without an automatic seed,
inserts test fixtures explicitly, signs into the organizer UI, exercises an
anonymous image submission, and creates a PDF export. It then recreates the app
container and retrieves the submission, uploaded image, and PDF before removing
its test volumes. The override tests the S3 integration without reading from or
writing to the production object store. It never uses production credentials or volumes.

## Backups and restore

Treat the PostgreSQL dump and object-store bucket backup as one timestamped recovery
set. A database record can reference an object, so restoring only one side can
produce missing assets or orphaned objects.

For a consistent logical backup:

1. Put the application into a maintenance window or stop `app` so writes cease.
2. Record the deployed Git SHA and migration level.
3. Create a PostgreSQL custom-format dump:

   ```sh
   docker compose -f docker-compose.coolify.yml exec -T postgres \
     pg_dump -U sakekeep -d sakekeep --format=custom > sakekeep-YYYYMMDD.dump
   ```

4. Mirror or archive the object-store bucket to a separate, encrypted backup
   location using an S3-compatible backup tool.
5. Store the dump, bucket backup, deployed SHA, and checksums as one recovery
   set outside the Coolify host and outside the production bucket.

To restore, create a fresh database volume and destination bucket, restore the
bucket backup and PostgreSQL dump from the same recovery set, configure the
recorded application version for that bucket, run its migrations, then check
`/api/health`, a representative public share, an image, and a PDF download
before reopening traffic. Test this procedure periodically in isolation.

## Migrations, cleanup, logs, and sizing

Migrations are forward-only and run once for each deployment attempt. A failed
migration prevents `app` from starting. Inspect the `migrate` logs, keep the
failed database volume intact, and fix the migration or restore the last
complete recovery set; do not mark a partial migration as successful manually.
Deploy the corrected forward migration rather than editing already-applied
migration history.

Schedule orphan cleanup through Coolify or the host scheduler during a quiet
period:

```sh
docker compose -f docker-compose.coolify.yml exec -T app bun run storage:cleanup
```

Inspect application and dependency logs in Coolify or with:

```sh
docker compose -f docker-compose.coolify.yml logs --since=1h app migrate postgres
```

Start with at least 2 CPU cores and 2 GiB RAM for the app, then measure real
exports. Sharp image processing and PDF generation create short CPU and memory
spikes; larger books and concurrent exports may require 4 GiB or more. Set
Coolify resource limits only after measuring peak resident memory, and leave
headroom for PostgreSQL and the proxy.
