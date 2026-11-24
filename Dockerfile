# ---- 1. Build the single-page application (presentation tier) ----
FROM node:22-alpine AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- 2. API server (application tier); it also serves the compiled SPA ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/public
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/src ./src
COPY server/migrations ./migrations
COPY server/test ./test
COPY --from=client /client/dist ./public
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
