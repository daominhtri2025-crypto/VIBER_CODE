# Frontend: Next.js standalone server (BFF keeps tokens in httpOnly cookies).
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY web/package.json web/package-lock.json web/.npmrc ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY web .
# NEXT_PUBLIC_* values are inlined at build time
ARG NEXT_PUBLIC_BRAND_NAME="Toán từng bước"
ARG NEXT_PUBLIC_ORG_NAME="Minh Trí Academy"
ARG NEXT_PUBLIC_LOGO_URL=""
ARG NEXT_PUBLIC_GOOGLE_CLIENT_ID=""
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system web && useradd --system --gid web web
COPY --from=build --chown=web:web /app/.next/standalone ./
COPY --from=build --chown=web:web /app/.next/static .next/static
COPY --from=build --chown=web:web /app/public public
USER web
EXPOSE 3000
CMD ["node", "server.js"]
