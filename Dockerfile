
# ==========================================
# BUILD STAGE
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

# Generate Prisma Client and compile TypeScript
RUN npm run build


# ==========================================
# PRODUCTION STAGE
# ==========================================

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Copy package files
COPY package*.json ./

# Copy Prisma schema
COPY --from=builder /app/prisma ./prisma

# Install production dependencies
RUN npm ci --omit=dev

# Copy compiled application
COPY --from=builder /app/dist ./dist

# Copy generated Prisma Client
COPY --from=builder /app/src/generated/prisma ./src/generated/prisma

# Create non-root user
RUN addgroup -S nodejs -g 1001 \
    && adduser -S nodejs -u 1001 \
    && chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/v1/health', r => {if(r.statusCode !== 200) process.exit(1)}).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
