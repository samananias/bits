FROM node:22-alpine

WORKDIR /app

# Install native packages required by node-zklib, sharp, and timezone data
RUN apk add --no-cache python3 py3-pip make g++ tzdata postgresql-client bash curl && \
    cp /usr/share/zoneinfo/Asia/Manila /etc/localtime && \
    echo "Asia/Manila" > /etc/timezone

# 1. Build Simulator Submodule
WORKDIR /app/simulator
COPY simulator/package*.json ./
RUN npm install
COPY simulator/ ./
RUN npm run build

# 2. Build Backend
WORKDIR /app/backend
COPY backend/package*.json ./
COPY backend/prisma ./prisma
COPY backend/patches ./patches
RUN npm install
RUN npx prisma generate
COPY backend/ ./
RUN npm run build

# 3. Setup root working directory and startup script
WORKDIR /app
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

# Environment defaults
ENV NODE_ENV=production \
    PORT=3001 \
    ZK_HOST=127.0.0.1 \
    ZK_PORT=4370 \
    ZK_TCP_PORT=4370 \
    ZK_HTTP_PORT=3030 \
    SIMULATOR_HTTP_PORT=3030 \
    TZ=Asia/Manila

EXPOSE 3001 4370 3030

CMD ["/app/entrypoint.sh"]
