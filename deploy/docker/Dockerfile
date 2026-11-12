# Oryne in Docker. See deploy/docker/README.md.
# Build context is the repository root:
#   docker compose -f deploy/docker/compose.yml build

# ---------------------------------------------------------------- dependencies
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY . .
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------- APIs and demo merchant
# Node runs the TypeScript directly (type stripping), so there is no build step.
FROM node:22-bookworm-slim AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app /app
RUN install -d -o node -g node /data
USER node
# compose.yml sets the working directory and command per service.
CMD ["node", "src/server.ts"]

# ---------------------------------------------------------------- website build
FROM deps AS web-build
# Baked into the bundle at build time, so changing them means rebuilding `web`.
ARG VITE_ORYNE_API_URL
ARG VITE_ORYNE_LIVE_API_URL
ENV VITE_ORYNE_API_URL=$VITE_ORYNE_API_URL \
    VITE_ORYNE_LIVE_API_URL=$VITE_ORYNE_LIVE_API_URL
RUN npm run build -w @oryne/web

# ---------------------------------------------------------------- website
FROM nginx:1.27-alpine AS web
COPY deploy/docker/web.nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
