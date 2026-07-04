FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci


FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 py3-pip ffmpeg deno
# Pinned: yt-dlp's error strings drive lib/ytdlp.ts's error classification,
# and unpinned upgrades have silently broken that matching before.
RUN pip install yt-dlp==2026.06.09 bgutil-ytdlp-pot-provider==1.3.1 --break-system-packages

ENV NODE_ENV=production
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
