# =============================================================================
# DOCKERFILE BACKEND - NODE.JS + EXPRESS (OWASP ASVS v5.0 NIVEL 3)
# Multi-stage build, non-root user, minimal attack surface
# =============================================================================
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

# Crear directorio de logs/tmp seguro y ajustar permisos para usuario sin privilegios 'node' (UID 1000)
RUN apk add --no-cache curl dumb-init && \
    mkdir -p /app/logs && \
    chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node src ./src
COPY --chown=node:node package.json ./package.json

USER node

EXPOSE 3000

HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
