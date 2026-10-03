FROM node:24-alpine AS build
RUN corepack enable
ENV CI=true
WORKDIR /repo
# Manifests first: this layer is cached until a dependency actually changes.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter api...
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter shared build && pnpm --filter api build
# `pnpm install --prod` only unlinks devDeps and leaves them in node_modules/.pnpm; `deploy`
# writes a fresh bundle that holds nothing but the production dependency tree.
RUN pnpm --filter api deploy --prod /deploy

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app/apps/api
COPY --from=build /deploy/package.json ./package.json
COPY --from=build /deploy/node_modules ./node_modules
COPY --from=build /deploy/dist ./dist
# SQL files are not compiled by tsc, so they are copied next to the built migrator.
COPY apps/api/src/core/db/migrations ./dist/core/db/migrations
# A fresh named volume copies this directory's ownership, so `node` can write uploads.
RUN mkdir -p /app/uploads && chown node:node /app/uploads
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
