# ── Stage 1: Build frontend ──────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js tailwind.config.js postcss.config.js ./
COPY src/ src/
RUN npm run build

# ── Stage 2: Production API ─────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy backend source
COPY backend/ backend/

# Copy built frontend from stage 1
COPY --from=frontend-build /app/dist dist/

# Copy Tesseract trained data (used by invoice scanner OCR)
COPY eng.traineddata ./

# Non-root user for security
RUN addgroup -S blockerp && adduser -S blockerp -G blockerp
USER blockerp

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "backend/src/server.js"]
