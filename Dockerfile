FROM node:24-bookworm-slim AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY apps/worker apps/worker
COPY packages packages
COPY db db
COPY scripts scripts
COPY tsconfig.json ./
ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "--import", "tsx", "apps/api/src/main.ts"]
