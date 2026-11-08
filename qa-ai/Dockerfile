# =============================================================================
# DOCKERFILE QA AI AGENT - GITHUB COPILOT / MODELS AUDITOR (ASVS v5.0 L3)
# =============================================================================
FROM node:22-alpine
WORKDIR /app

RUN mkdir -p /app/reports && chown -R node:node /app
COPY --chown=node:node package.json run-qa-ai.js ./

USER node
CMD ["node", "run-qa-ai.js"]
