FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public ./public
COPY src ./src
ARG VITE_WORLD_APP_ID
ARG VITE_WORLD_ID_APP_ID
ARG VITE_WORLD_ID_ACTION=play
ARG VITE_CIVILIZATION_CONTRACT_ADDRESS=0x29147c7bead901e8019d7911a7dc404447877c62
ARG VITE_WORLD_ID_PROOF_CONTEXT_URL=https://civilization.nyphon.de/api/world-id/proof-context
ARG VITE_WORLD_ID_ENVIRONMENT=production
ENV VITE_WORLD_APP_ID=$VITE_WORLD_APP_ID \
    VITE_WORLD_ID_APP_ID=$VITE_WORLD_ID_APP_ID \
    VITE_WORLD_ID_ACTION=$VITE_WORLD_ID_ACTION \
    VITE_CIVILIZATION_CONTRACT_ADDRESS=$VITE_CIVILIZATION_CONTRACT_ADDRESS \
    VITE_WORLD_ID_PROOF_CONTEXT_URL=$VITE_WORLD_ID_PROOF_CONTEXT_URL \
    VITE_WORLD_ID_ENVIRONMENT=$VITE_WORLD_ID_ENVIRONMENT
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY src/game.js ./src/game.js
COPY --from=build /app/dist ./dist
USER node
EXPOSE 31057
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 CMD node -e "fetch('http://127.0.0.1:31057/api/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
