FROM oven/bun:1-debian AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    python3-venv \
    python3-setuptools \
    nodejs \
    npm \
    git \
    ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

COPY package.json bun.lock* package-lock.json* ./
RUN bun install --frozen-lockfile || bun install

COPY . .

RUN npm rebuild better-sqlite3 --build-from-source

ENV NODE_ENV=production \
    POKER_DB_PATH=/app/data/poker.db \
    TZ=Europe/Paris

VOLUME ["/app/data"]

CMD ["bun", "run", "src/cli/daemon.ts"]
