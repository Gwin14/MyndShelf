# Contexto de build: a raiz do repositório (docker compose cuida disso).
FROM node:24-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/server ./apps/server
COPY apps/desktop ./apps/desktop
# o lockfile cita o mobile; basta o manifesto para o pnpm não reclamar
COPY apps/mobile/package.json ./apps/mobile/package.json
RUN pnpm install --frozen-lockfile --filter @myndshelf/server... --filter @myndshelf/desktop...
# servidor num arquivo só + o site (build estático do desktop)
RUN pnpm --filter @myndshelf/server build \
 && pnpm --filter @myndshelf/desktop exec vite build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PUBLIC_DIR=/app/public \
    PORT=8787
COPY --from=build /repo/apps/server/dist/main.js ./main.js
COPY --from=build /repo/apps/desktop/dist ./public
RUN mkdir -p /data/files && chown -R node:node /data
USER node
VOLUME /data
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8787/api/info >/dev/null || exit 1
CMD ["node", "main.js"]
