# CLAUDE.md

> 🇹🇷 Türkçesi: [CLAUDE.TR.md](CLAUDE.TR.md) — insan okuru için çeviri. Tools read THIS file;
> when the rules change, update both.

Guidance for Claude Code when working in this repo. Setup and commands live in README.md;
this file holds the RULES only.

## Project

An Express + TypeScript + Drizzle (PostgreSQL) API skeleton, in a pnpm monorepo. `apps/api` is
ready to run; `apps/web` is empty (the framework is chosen when a project starts) and
`packages/shared` holds the zod contract and API client shared by both ends.

## Stack

| Layer   | Choice                                                                                    |
| ------- | ----------------------------------------------------------------------------------------- |
| Backend | Express 5 + `ws` + REST (`/api/v1/*`), TypeScript, ESM (imports carry `.js`)              |
| DB      | PostgreSQL 16 + Drizzle ORM                                                               |
| Auth    | JWT Bearer (access 15 min + refresh 30 days, tracked in the DB), roles: `admin` \| `user` |
| Deploy  | Docker Compose; Traefik is NOT in the compose file, it is the shared VPS instance         |

## How the API is organised (module-first)

`apps/api/src` is split by MODULE, not by layer — one task, one folder to open.

```
src/
├─ index.ts   bootstrap (http + ws + jobs)
├─ app.ts     express setup
├─ router.ts  EVERY mount, grouped by audience (anonymous / authenticated / admin)
├─ core/      NOTHING module-specific: config, db, http/middleware, observability
│             (log WRITING), realtime, storage, utils
└─ modules/   auth/ example/ uploads/
```

Inside a module: `<name>.service.ts` (the only layer that talks to the DB) +
`<name>.controller.ts` + `<name>.routes.ts` + `index.ts`. When a module serves more than one
audience, the HTTP surface is split by file (`public.routes.ts`) while the service and the
schema stay single copies.

**Two rules (never break them):**

1. **Modules reach each other only through `index.ts`.** From `modules/x/` you never import
   `modules/y/y.service.js`.
2. **`core` depends on no module.** If a core file needs one, the design is wrong (writing logs
   belongs in core, reading them belongs in a module).

`routes` only binds path ↔ handler + middleware; `controller` handles req/res (zod parsing
included) and calls the service. **Express 5: an error thrown in an async handler reaches
errorHandler by itself — controllers DO NOT write try/catch.** Services throw `HttpError`
(the message is a stable CODE, free-form text goes into `detail`).

Validators are written with zod and imported from `packages/shared` whenever possible — the
contract is shared with the frontend, so it does not move into a module.

## Database

- Tables live in `core/db/schema/<table-name>.ts`, one table per file, all re-exported from
  `schema/index.ts` (drizzle-kit's entry point).
- **SQL is never written by hand:** edit the schema → `pnpm --filter api db:generate` → read the
  generated SQL → `db:migrate`. Migrations are sequential, never skipped, never rolled back;
  you go back with a new migration.
- Enum lists are declared in `shared` and consumed by `pgEnum` — the type cannot drift apart
  between the two ends.
- Soft delete (`is_deleted`) instead of removing the row. `is_active` is a DIFFERENT thing —
  a user-facing on/off switch (a disabled account, a row its owner paused). A table that needs
  both carries both columns; one flag can never mean both.

## Non-negotiables

- Every public (unauthenticated) endpoint must be rate-limited and strictly validated, and its
  response body must not carry more fields than it needs to.
- Ownership is part of every query — a row must never be reachable by id alone. Someone else's
  row returns 404, not 403 (do not leak that it exists).
- The refresh token pattern stays intact: rotation + reuse detection + family revoke. No cache
  and no auto-retry on the refresh endpoint.
- Money and other critical arithmetic happens only on the server, inside a transaction; a value
  computed by the client is never trusted.
- `core/storage/storage.service.ts` is the only file that touches the disk.
- A single API instance is assumed (WS state is in memory) — scaling out means Redis pub/sub first.
- Uploaded files live under `UPLOAD_DIR`; in production, backing up that volume matters as much
  as pgdata.

## Commits

Conventional Commits — `<type>(<scope>): <subject>`. Lowercase, imperative, no trailing period,
under ~72 characters. Types: `feat` `fix` `docs` `refactor` `chore` `build` `test` `style`
`perf`. Scope is `api`, `web`, `shared`, `db`, or the module name when that is narrower.

```
feat(notes): add the notes module with CRUD endpoints
fix(auth): clear the refresh cookie on the path it was set on
chore(deps): bump drizzle-orm to 0.45.2
```

Suggesting these is welcome (see the working agreement). Describe what the diff actually does —
read it first rather than restating the file names. A new app arrives as several commits (shared
contract, table + migration, module, frontend route), so propose the split when the staged
change covers more than one of those.

## Development

Claude Code does not start dev servers on its own — the user runs `pnpm dev` in their own
terminal. If verifying something genuinely needs a running server, check the port first
(`lsof -nP -iTCP:3000 -sTCP:LISTEN`) and ask the user if nothing is listening.
