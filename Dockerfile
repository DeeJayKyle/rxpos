# RxPOS Hub: sync server + web app, for Coolify or any Docker host.
# Data lives in /data; mount a persistent volume there.
FROM node:22-alpine AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
# the hub runs the cloud's code on Node's built-in SQLite (Node 22.13+). Behind Coolify's proxy, so the device's own
# address (X-Forwarded-For) counts for the sign-in limits.
ENV NODE_ENV=production PORT=8686 RXPOS_DATA=/data RXPOS_TRUST_PROXY=1
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8686
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8686/api/health || exit 1
USER node
CMD ["node", "server/hub.mjs"]
