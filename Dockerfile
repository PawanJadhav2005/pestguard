# PestGuard server image for Google Cloud Run (also works on any Docker host).
# Builds the admin website, then runs the API + live updates + admin website on $PORT (Cloud Run sets 8080).

FROM node:22-slim AS admin
WORKDIR /app/admin-web
COPY admin-web/package*.json ./
RUN npm ci --no-audit --no-fund
COPY admin-web/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=admin /app/admin-web/dist /app/admin-web/dist
USER node
EXPOSE 8080
# Creates/updates tables and demo accounts (never deletes data), then starts the server
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seed.js && node src/index.js"]
