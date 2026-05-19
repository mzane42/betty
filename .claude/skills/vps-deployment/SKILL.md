---
name: vps-deployment
description: Use when deploying tennis-daemon to OVH VPS Elite, adding new self-hosted Docker app, running Terraform for zanely.fr DNS, or troubleshooting prod. Documents infra/ layout, provision flow, Traefik routing.
---

# VPS Deployment — OVH VPS-3 (2026) + Docker stack zanely.fr

Mono-host Docker stack vivant à `/opt/stack`. Reverse-proxy Traefik + apps multiples sous `*.zanely.fr`. Cible: **VPS-3 gamme 2026** — 24 Go RAM / 8 vCore / 200 Go NVMe / 1.5 Gbps / backup daily inclus (~$19.97 ≈ 18-19€ TTC/mois).

## Layout repo

```
infra/
├─ compose/<app>/docker-compose.yml    une app = un dossier
├─ scripts/provision.sh                 hardening Debian one-shot
├─ scripts/backup.sh                    restic → OVH S3
├─ terraform/
│   ├─ modules/dns-and-storage/         DNS zanely.fr + S3 bucket
│   └─ environments/prod/               main.tf + tfvars
└─ docs/{ovh-buy-guide,first-deploy}.md
```

## Workflow complet

```
1. Achat VPS Elite manuel via web        (web — produit legacy non Terraformable)
2. terraform apply                         → DNS + S3 bucket
3. provision.sh sur VPS                    → Debian hardening + Docker
4. docker compose up                       → Traefik + apps
```

## Bootstrap nouveau VPS

1. Achat: `infra/docs/ovh-buy-guide.md` (VPS Comfort 8 Go, Debian 12, Gravelines)
2. Provision: `bash provision.sh` en tant que root → crée `anis`, installe Docker, ufw, fail2ban, hard SSH
3. Network: `docker network create traefik_proxy`
4. Traefik up: `docker compose -f compose/traefik/docker-compose.yml up -d`
5. Tennis up: `docker compose -f compose/tennis/docker-compose.yml up -d`

Détail dans `infra/docs/first-deploy.md`.

## Pattern nouvelle app

```yaml
services:
  app:
    image: <image>
    container_name: <name>
    restart: unless-stopped
    networks: [traefik_proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.<name>.rule=Host(`<sub>.${DOMAIN}`)
      - traefik.http.routers.<name>.entrypoints=websecure
      - traefik.http.routers.<name>.tls.certresolver=letsencrypt
      - traefik.http.services.<name>.loadbalancer.server.port=<port>
networks:
  traefik_proxy:
    external: true
```

DNS: ajouter `<sub>.${DOMAIN}` → IP VPS (ou wildcard `*.lab.tondomaine.fr`).

## Tennis daemon prérequis code

Container tourne `bun run src/cli/daemon.ts` qui n'existe **pas encore**. À créer:

```ts
// src/cli/daemon.ts
import { defaultDbPath, openDatabase } from '../db/index.js';
import { startSignalDaemon } from '../tennis/signal-daemon.js';
import { startTelegramBot } from '../tennis/telegram-bot.js';

const db = openDatabase({ dbPath: process.env.POKER_DB_PATH ?? defaultDbPath() });
await startSignalDaemon(() => db);
await startTelegramBot(db);
setInterval(() => undefined, 60_000); // keep-alive
```

Pas d'`app.getPath()` Electron côté serveur — `POKER_DB_PATH` env obligatoire.

## ABI Docker

Dockerfile rebuild `better-sqlite3` pour Node 22 ABI dans le container (pas Electron — pas d'UI). Voir skill `electron-sqlite` pour le contexte ABI mismatch.

## Secrets

- Jamais committed
- `.env` par compose (`compose/<app>/.env`)
- `.env.example` track la liste des clés requises
- Pour prod sérieux: migrer vers `sops` + `age` chiffré dans git

## Backup

- `scripts/backup.sh` → SQLite `.backup` snapshot + restic vers OVH Object Storage
- Crontab `0 4 * * *`
- Retention 7d / 4w / 6m

## Logs / monitoring

- `compose/monitoring/` ship Uptime Kuma + Dozzle (logs UI web)
- `docker logs -f <container>` direct
- Pour Sentry/Grafana → ajouter compose séparé

## Coût

VPS-3 (2026, 24 Go) ~$20 + domaine 0.60€ + S3 externe 1€ = **~20€/mois TTC**. Upgrade VPS-3 → VPS-4/5/6 = 1 click si serre.

## Compliance

- Pas d'auto-bet sur opérateur FR depuis VPS (cf skill `tennis-pipeline`).
- Scraping reste sur endpoints publics.
- IP française OVH = pas de geoblock Unibet.
