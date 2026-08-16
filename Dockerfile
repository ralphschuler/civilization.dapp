FROM node:26-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.21.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY public ./public
COPY server ./server
COPY scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY scripts/lib/migrations.mjs ./scripts/lib/migrations.mjs
COPY migrations ./migrations
COPY src ./src
COPY next.config.ts tsconfig.json postcss.config.mjs ./
RUN pnpm build

FROM node:26-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=31057
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/scripts/db-migrate.mjs ./scripts/db-migrate.mjs
COPY --from=build --chown=node:node /app/scripts/lib/migrations.mjs ./scripts/lib/migrations.mjs
COPY --from=build --chown=node:node /app/migrations ./migrations
COPY --from=build --chown=node:node /app/src/lib/database.mjs ./src/lib/database.mjs
COPY --from=build --chown=node:node /app/src/lib/database-connect.mjs ./src/lib/database-connect.mjs
USER node
EXPOSE 31057
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:31057/api/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
