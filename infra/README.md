# Infra — Self-hosted stack OVH

Mono-VPS Docker stack: Traefik + tennis-daemon + future self-hosted apps.

## Layout

```
infra/
├─ compose/
│  ├─ traefik/         reverse-proxy + Let's Encrypt
│  ├─ tennis/          poker-coach tennis daemon (24/7 cron + bot)
│  └─ monitoring/      uptime-kuma + grafana + prometheus
├─ scripts/
│  ├─ provision.sh     base hardening + Docker install
│  └─ backup.sh        restic → OVH S3
└─ docs/
   ├─ ovh-buy-guide.md      step-by-step achat VPS Comfort
   └─ first-deploy.md       provisionne + déploie tennis
```

## Pré-requis

- VPS OVH **VPS-3** (gamme 2026) — 24 Go RAM / 8 vCore / 200 Go NVMe (~$19.97 / ~18-19€ TTC) — voir `docs/ovh-buy-guide.md`
- Domaine `zanely.fr` (OVH ou Cloudflare DNS)
- Wildcard `*.zanely.fr` → IP VPS

## Quick start

```bash
# 1. Achète VPS — docs/ovh-buy-guide.md
# 2. SSH + provisionne
ssh root@<vps-ip>
curl -fsSL https://raw.githubusercontent.com/<toi>/poker/main/infra/scripts/provision.sh | bash

# 3. Deploy
cd /opt/stack
docker compose -f compose/traefik/docker-compose.yml up -d
docker compose -f compose/tennis/docker-compose.yml up -d
```

## Secrets

`.env.local` par compose (gitignored). Liste exhaustive dans chaque `compose/*/README.md`.
