# First deploy — VPS Elite → tennis-daemon online

Pré-requis:
1. VPS Elite 16 Go acheté via `docs/ovh-buy-guide.md` → tu as l'IP
2. Terraform appliqué (`infra/terraform/environments/prod`) → DNS zanely.fr + sous-domaines + S3 bucket créés
3. SSH OK (clé OVH Manager + propagation initiale Debian)

## 1. Hardening + Docker (one-shot)

Sur ton Mac:

```bash
scp /Users/bubblz/poker/infra/scripts/provision.sh root@<vps-ip>:/root/
ssh root@<vps-ip>
bash /root/provision.sh
```

Le script:
- Update système
- Crée user `anis` (sudo + docker)
- Installe Docker + compose-plugin
- ufw firewall (22/80/443 only)
- fail2ban
- Désactive root SSH + password auth

⚠️ **Avant de relancer ssh root** → ouvre 2e terminal sur user `anis` pour test:
```bash
ssh anis@<vps-ip>   # doit marcher
sudo whoami         # doit dire root
```

Si OK → ferme session root. Désormais `ssh anis@<vps-ip>` only.

## 2. Clone repo

```bash
ssh anis@<vps-ip>
sudo mkdir -p /opt/stack && sudo chown anis:anis /opt/stack
cd /opt/stack
git clone https://github.com/<toi>/poker.git .
cd infra
```

## 3. Secrets

```bash
# Traefik
cp compose/traefik/.env.example compose/traefik/.env
nano compose/traefik/.env
# remplir: ACME_EMAIL, DOMAIN

# Tennis
cp compose/tennis/.env.example compose/tennis/.env
nano compose/tennis/.env
# remplir: ODDS_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_IDS, ANTHROPIC_API_KEY
```

⚠️ `.env` jamais committed (gitignore).

## 4. Réseau Docker partagé

```bash
docker network create traefik_proxy
```

## 5. Démarre Traefik

```bash
cd /opt/stack/infra
docker compose -f compose/traefik/docker-compose.yml up -d
docker logs -f traefik
```

Attends `Server configuration reloaded`. Browse `https://traefik.lab.tondomaine.fr` → dashboard (basic auth via .env).

## 6. Démarre tennis-daemon

```bash
docker compose -f compose/tennis/docker-compose.yml up -d
docker logs -f tennis-daemon
```

Attends `Signal daemon started — TZ=Europe/Paris`.

## 7. Test Telegram

DM ton bot:
```
/start
/picks
```

Doit répondre. Si pas de réponse → check logs daemon.

## 8. Test cron manuel

```bash
docker exec tennis-daemon bun run tennis-scan
docker exec tennis-daemon bun run tennis-sync-status
```

## 9. Backups

```bash
sudo cp /opt/stack/infra/scripts/backup.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/backup.sh
sudo crontab -e
# Ajouter:
# 0 4 * * * /usr/local/bin/backup.sh >> /var/log/backup.log 2>&1
```

Premier run manuel:
```bash
sudo /usr/local/bin/backup.sh
```

## 10. Done

- Tennis daemon tourne 24/7
- Mac peut être éteint
- Telegram = ta seule UI
- Cron firent à 03/08/11/21h Paris

## Next apps à ajouter

Chaque app = nouveau dossier dans `infra/compose/<app>/docker-compose.yml`.
Pattern:
```yaml
services:
  app:
    image: vaultwarden/server:latest
    networks: [traefik_proxy]
    labels:
      - traefik.enable=true
      - traefik.http.routers.app.rule=Host(`vault.lab.tondomaine.fr`)
      - traefik.http.routers.app.tls.certresolver=letsencrypt
networks:
  traefik_proxy:
    external: true
```

Puis: `docker compose -f compose/<app>/docker-compose.yml up -d`. Traefik route auto.

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `Permission denied` SSH après provision | Check `~/.ssh/authorized_keys` côté anis |
| Traefik 404 | DNS pas propagé — `dig <subdomain>` |
| Cert Let's Encrypt fail | Port 80 bloqué — vérif ufw + DNS |
| `better-sqlite3 ABI mismatch` | `docker compose build --no-cache tennis-daemon` |
| Telegram silent | Token wrong ou USER_IDS pas le tien — `/getme` |
