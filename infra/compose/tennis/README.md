# tennis-daemon container

Cron 24/7 + Telegram bot. Standalone, pas d'Electron.

## Prérequis code (TODO côté repo poker)

Créer `src/cli/daemon.ts`:

```ts
import { defaultDbPath, openDatabase } from '../db/index.js';
import { startSignalDaemon } from '../tennis/signal-daemon.js';
import { startTelegramBot } from '../tennis/telegram-bot.js';
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

loadDotenv({ path: resolve(process.cwd(), '.env.local'), override: false });
loadDotenv({ path: resolve(process.cwd(), '.env'), override: false });

const dbPath = process.env.POKER_DB_PATH ?? defaultDbPath();
const db = openDatabase({ dbPath });

const daemon = await startSignalDaemon(() => db);
console.log(`[daemon] enabled=${daemon.enabled} reason=${daemon.reason ?? 'OK'}`);

await startTelegramBot(db);
console.log('[telegram-bot] polling started');

process.on('SIGTERM', () => {
  daemon.stop();
  db.close();
  process.exit(0);
});

// keep alive — cron tient déjà l'event loop, mais filet de sécurité
setInterval(() => undefined, 60_000);
```

## Build + run

```bash
cd /opt/stack
docker compose -f infra/compose/tennis/docker-compose.yml build
docker compose -f infra/compose/tennis/docker-compose.yml up -d
docker logs -f tennis-daemon
```

## Migration DB existante

Copie ta `~/.poker-coach/poker.db` locale → VPS:

```bash
scp ~/.poker-coach/poker.db anis@<vps-ip>:/opt/stack/data/tennis/poker.db
```

Container monte `/opt/stack/data/tennis/` → `/app/data/`.

## Logs

```bash
docker logs -f tennis-daemon
docker exec tennis-daemon ls -la /app/data
```

## Run job manuel

```bash
docker exec tennis-daemon bun run tennis-scan
docker exec tennis-daemon bun run tennis-sync-status
docker exec tennis-daemon bun run tennis-telegram-test
```
