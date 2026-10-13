# Stages are split by how often they change, so an ordinary deploy (source only) rebuilds
# just the compiled code and leaves a small layer in the server's build cache:
#   deps      → manifests + lockfile only
#   prod-deps → production node_modules; reruns only when the lockfile changes
#   build     → full install (cached the same way) + source + compile
# Production deps must NOT be produced after the source copy (`pnpm deploy`, or an in-place
# `pnpm install --prod`): that step then reruns on every deploy and each run leaves a fresh
# node_modules layer in the cache.
FROM node:24-alpine AS deps
RUN corepack enable
ENV CI=true
WORKDIR /repo
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# A fresh install with --prod never fetches devDeps, so none of them reach the image. (Running
# `pnpm install --prod` on top of a full install is different: it unlinks devDeps but leaves
# their files in node_modules/.pnpm.) mkdir keeps the COPYs below valid for a package that
# ends up with no production dependency.
FROM deps AS prod-deps
RUN pnpm install --frozen-lockfile --filter api... --prod \
	&& mkdir -p node_modules apps/api/node_modules packages/shared/node_modules

FROM deps AS build
RUN pnpm install --frozen-lockfile --filter api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter shared build && pnpm --filter api build

# The repo's workspace layout is kept: pnpm links `shared` and every dependency with relative
# symlinks (apps/api/node_modules/* -> ../../node_modules/.pnpm/*, shared -> packages/shared).
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# SQL files are not compiled by tsc, so they are copied next to the built migrator.
COPY apps/api/src/core/db/migrations ./apps/api/dist/core/db/migrations
# A fresh named volume copies this directory's ownership, so `node` can write uploads.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
