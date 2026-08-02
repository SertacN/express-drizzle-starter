FROM node:22-alpine AS build
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
# Drop devDeps — only production dependencies reach the runtime image.
RUN pnpm install --frozen-lockfile --filter api... --prod

# pnpm installs dependencies as symlinks (apps/api/node_modules/* -> ../../node_modules/.pnpm/*),
# so the runtime image keeps the exact same workspace layout or those links break.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared ./packages/shared
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/apps/api/package.json ./apps/api/package.json
COPY --from=build /repo/apps/api/dist ./apps/api/dist
# SQL files are not compiled by tsc, so they are copied next to the built migrator.
COPY apps/api/src/core/db/migrations ./apps/api/dist/core/db/migrations
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
