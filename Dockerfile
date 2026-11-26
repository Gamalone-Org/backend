
# ==========================================
# BASE
# ==========================================
FROM node:22-alpine AS base

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma


# ==========================================
# BUILDER
# ==========================================
FROM base AS builder

RUN npm ci

COPY . .

RUN npx prisma generate

CMD ["sh", "-c", "npx prisma migrate deploy && npm run dev"]

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
# PRODUCTION
# ==========================================
FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

# Copy startup script
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x docker-entrypoint.sh \
    && addgroup -S nodejs -g 1001 \
    && adduser -S nodejs -u 1001 \
    && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

ENTRYPOINT ["./docker-entrypoint.sh"]
