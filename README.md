# express-drizzle-starter

> 🇹🇷 Bu dosyanın Türkçesi: [README-TR.md](README-TR.md)

An Express + TypeScript + Drizzle (PostgreSQL) API skeleton. A pnpm monorepo: `apps/api` is
ready to run, `apps/web` is empty — you pick the frontend framework when the project starts.

What comes with it: JWT auth (access + refresh, with rotation and reuse detection), role-based
guards, image uploads (re-encoded to WebP by sharp), a WebSocket server, error and slow-request
logging into the database, a Postgres-only compose file for development and a Traefik-labelled
one for production.

## Quick start

```bash
cp .env.example .env                              # change the JWT secrets
pnpm install
docker compose -f docker-compose.dev.yml up -d    # postgres only
pnpm --filter shared build                        # api needs shared's dist
pnpm --filter api db:migrate
pnpm dev                                          # api on :3000
```

Create the first user:

```bash
pnpm --filter api user:create admin@example.com secret123 "Admin" admin
```

Check it:

```bash
curl localhost:3000/api/v1/health
curl -X POST localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"secret123"}'
```

## Commands

| Command                                                          | Where | What it does                                            |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------- |
| `pnpm dev`                                                       | root  | runs every package that has a `dev` script, in parallel |
| `pnpm build` / `pnpm check`                                      | root  | builds / typechecks every package                       |
| `pnpm --filter api db:generate`                                  | api   | generates a migration from the schema                   |
| `pnpm --filter api db:migrate`                                   | api   | applies pending migrations                              |
| `pnpm --filter api db:studio`                                    | api   | opens Drizzle Studio                                    |
| `pnpm --filter api user:create <email> <password> <name> [role]` | api   | creates a user                                          |

## Layout

```
apps/api/src/
├─ index.ts          bootstrap: http + ws + jobs
├─ app.ts            express setup (helmet, cors, static, rate limit, errorHandler)
├─ router.ts         EVERY mount in one file, grouped by audience
├─ core/             NOTHING module-specific lives here
│  ├─ config/env.ts  env validated with zod — a bad deploy fails at boot
│  ├─ db/            client, migrate, schema/ (tables), migrations/
│  ├─ http/          health + middleware (auth, errorHandler, rateLimit, requestLog, upload)
│  ├─ observability/ log WRITING + the pruning job
│  ├─ realtime/      WebSocket server
│  ├─ storage/       the ONLY file that touches the disk
│  └─ utils/         jwt, password, logger, refresh-token
└─ modules/          product code: auth/ example/ uploads/
packages/shared/src/ validators/ (zod) + api-client/ — the contract shared with the frontend
```

### Two rules (do not break them)

1. **Modules reach each other only through `index.ts`.** From `modules/x/` you never import
   `modules/y/y.service.js`, you import `modules/y/index.js`.
2. **`core` depends on no module.** If a file in core needs one, the design is wrong (writing
   logs belongs in core, reading them belongs in a module).

### Module skeleton

```
modules/<name>/
├─ <name>.service.ts     the ONLY layer that talks to the DB
├─ <name>.controller.ts  req/res + zod parse; NO try/catch (Express 5 routes errors to errorHandler)
├─ <name>.routes.ts      path ↔ handler + middleware, nothing else
├─ public.routes.ts      (optional) the same module's anonymous surface — one service, one schema
└─ index.ts              the module's public API
```

A new module = copy `modules/example/`, add one import and one mount line to `router.ts`.

## Database

Tables live under `apps/api/src/core/db/schema/`, one file per table; `index.ts` re-exports them
all and is the entry point of `drizzle.config.ts` — a table missing from that barrel does not
exist as far as `db:generate` is concerned.

SQL is never written by hand:

```bash
# 1. write or edit schema/<table>.ts, add it to index.ts
pnpm --filter api db:generate    # 2. SQL + meta snapshot are generated
pnpm --filter api db:migrate     # 3. applied
```

Migrations are sequential, never skipped and never rolled back — you go back with a new
migration. Read the generated `.sql` before applying it: Drizzle sometimes resolves a column
rename as "drop + add", and that is data loss.

Prefer deactivating (`is_active`) over deleting, so history and the rows referencing it survive.

## Auth

A single user universe (the `users` table) with authority split by `role`. Access tokens last
15 minutes, refresh tokens 30 days and are **tracked in the database**:

- Every refresh rotates: the old row is burned with `used_at` and a new row is opened.
- A token that comes back after it was spent counts as stolen and every token in its
  `family_id` is revoked. A 10-second grace window keeps races (a dropped connection, a second
  tab) from being mistaken for theft.
- Logout revokes the whole family; a password change revokes ALL of the user's tokens but hands
  a fresh pair back to the tab that made the request.

Do not break this pattern: caching or auto-retrying the refresh endpoint sets off reuse
detection for the wrong reason.

Endpoints: `POST /api/v1/auth/{register,login,refresh,logout}`, `GET|PATCH /api/v1/auth/me`.
If you do not want open sign-ups, delete the `register` line from `auth.routes.ts` and add users
with `user:create`.

## Uploads

`POST /api/v1/uploads/image` (token required, multipart field name `file`) converts the image to
WebP with sharp, writes it under `<UPLOAD_DIR>/<userId>/` and returns a public URL. Re-encoding
strips EXIF (location data!) and guarantees the bytes really are an image.

The only file that touches the disk is `core/storage/storage.service.ts` — switching to S3 should
mean changing that file and nothing else. **In production, backing up the `uploads` volume matters
as much as `pgdata`: those files are not in the database dump.**

## Logs

Only the interesting requests are written to `app_logs`: failed (>= 400) or slow (>= 3s).
Successful fast requests write nothing, which is why the mechanism costs almost nothing. Routine
401s from an expired access token are skipped on purpose; 401s on `/login` and `/refresh` are
kept because both are security events. Rows are deleted after 14 days by a daily job.

If you want to read logs from an admin page, the read side becomes a MODULE
(`modules/observability/`) — it is not added to core.

## Adding a frontend

`apps/web` is empty. Install a framework inside it, give its `package.json` a `"name": "web"` and
a `dev` script — the root `pnpm dev` (`pnpm --parallel -r dev`) will pick it up on its own.

Example (SvelteKit):

```bash
cd apps/web && pnpm create svelte@latest .
pnpm add shared@workspace:*
```

Add a proxy to `vite.config.ts` so development needs no reverse proxy:

```ts
server: {
  proxy: {
    "/api": "http://localhost:3000",
    "/ws": { target: "ws://localhost:3000", ws: true }
  }
}
```

Then use the client from `shared`:

```ts
import { createApiClient } from "shared";
const api = createApiClient({ baseUrl: "", getAccessToken: () => session.accessToken });
const { items } = await api.examples.list({ page: 1 });
```

If you need more than one frontend (say `apps/admin`), copy the same pattern: a new folder, a
different port, a new service plus a Traefik router in `docker-compose.yml`.

## Production deploy

`docker-compose.yml` assumes a Traefik instance already running on the VPS and owning the
external `traefik-net` network — it does not start Traefik itself. Entrypoint `https`, cert
resolver `letsencrypt`; change the labels if yours are named differently.

```bash
cp .env.example .env      # DOMAIN, DB_*, JWT_* → real values
docker compose up -d --build
docker compose exec api node dist/core/db/migrate.js
```

Postgres sits on the `internal` network only; neither the outside world nor Traefik can reach it.
Uploaded files persist in the `uploads` volume.

## Commits

Conventional Commits — `<type>(<scope>): <subject>`. Lowercase, imperative ("add", not "added"),
no trailing period, under ~72 characters.

| Type       | When                                                    |
| ---------- | ------------------------------------------------------- |
| `feat`     | a new endpoint, module, page or user-visible capability |
| `fix`      | a bug in something that already worked                  |
| `docs`     | README, CLAUDE.md, comments                             |
| `refactor` | same behaviour, different code                          |
| `chore`    | dependencies, config, tooling, deleting dead code       |
| `build`    | Dockerfile, compose, tsconfig — the build itself        |
| `test`     | tests only                                              |
| `style`    | formatting only, no logic (a prettier run)              |
| `perf`     | a change made for speed                                 |

Scope is the part of the repo the commit touches: `api`, `web`, `shared`, `db`, or the module
name when that is narrower — `notes`, `auth`, `uploads`.

```
feat(notes): add the notes module with CRUD endpoints
feat(db): add notes table and note_color enum
feat(shared): add note types, constants and api-client service
feat(web): add the /notes route
fix(notes): stop a title-only PATCH from resetting the colour
fix(auth): clear the refresh cookie on the path it was set on
chore: remove the example module
chore(deps): bump drizzle-orm to 0.45.2
docs: rewrite the README for the practice-apps layout
build(docker): pin the postgres image to 16.4
```

A new app lands as several commits, not one — the shared contract, the table and migration, the
module, the frontend route. Each one should build on its own.

## Working with AI tools (CLAUDE.md)

[CLAUDE.md](CLAUDE.md) in the repo root holds this skeleton's rules — module boundaries, no
try/catch in Express 5 controllers, the migration flow, the refresh token pattern — in a form
meant to be read by a machine. [CLAUDE.TR.md](CLAUDE.TR.md) is a Turkish translation for human
readers — tools read `CLAUDE.md`, so keep both in sync when the rules change.

- **Using Claude Code?** Nothing to do: the file is loaded automatically in every session.
- **Using something else?** (Cursor, Copilot, Codex, Gemini…) The file is not picked up on its
  own. Copy its contents into that tool's own rules file — `.cursor/rules/`,
  `.github/copilot-instructions.md`, `AGENTS.md`, `GEMINI.md`, or whatever it expects. Copy the
  text rather than referring to `CLAUDE.md`; most tools will not open a file you merely mention.
- **Not using AI at all?** Read it anyway: it is the shortest explanation of why the skeleton is
  built this way.

When you change the rules, update `CLAUDE.md` too — a stale rules file is worse than none.

## Make it yours

- [ ] Change the project name in `package.json` and `docker-compose.yml` (`name: app`,
      `container_name: app_*`, `traefik.http.routers.app-*`)
- [ ] Put a real `DOMAIN` and random JWT secrets in `.env`
- [ ] `modules/example/`, `schema/examples.ts`, `validators/example.ts`,
      `api-client/example.service.ts` → delete them or grow them into your first real module
- [ ] Delete `core/realtime/` (WebSocket) or `core/storage/` + `modules/uploads/` if you do not
      need them
- [ ] Install a framework in `apps/web`, uncomment the `web` service in the compose file
- [ ] If you use an AI tool other than Claude Code, copy `CLAUDE.md` into its rules file
