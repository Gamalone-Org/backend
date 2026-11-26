
# ==========================================
# BASE
# ==========================================
FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma


# ==========================================
# DEVELOPMENT
# ==========================================
FROM base AS development

ENV NODE_ENV=development

RUN npm ci

COPY . .

RUN npx prisma generate

EXPOSE 5000

CMD ["npm", "run", "dev"]


# ==========================================
# BUILDER
# ==========================================
FROM base AS builder

RUN npm ci

COPY . .

RUN npx prisma generate

RUN npm run build


# ==========================================
# PRODUCTION
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Prisma 7 custom generated client
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

RUN addgroup -S nodejs -g 1001 \
    && adduser -S nodejs -u 1001 \
    && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/v1/health', r => {if(r.statusCode !== 200) process.exit(1)}).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
