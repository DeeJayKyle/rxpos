# PharmaPOS Hub: sync server + web app, for Coolify or any Docker host.
# Data lives in /data; mount a persistent volume there.
FROM node:20-alpine AS build
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8686 PHARMAPOS_DATA=/data
COPY --from=build /app/dist ./dist
COPY server ./server
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 8686
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8686/api/health || exit 1
USER node
CMD ["node", "server/hub.mjs"]
