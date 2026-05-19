# Step-by-step — Acheter VPS OVH VPS-3 (gamme 2026)

Durée: ~15 min. Provisionnement: ~5 min après paiement.

> **Pourquoi VPS-3 ?** Gamme 2026 sortie récemment: 24 Go RAM / 8 vCore / 200 Go NVMe pour ~18€/mois TTC. Backup daily inclus. Multi-projet (n8n + cron Claude + APIs NestJS + Next.js + tennis-daemon + Postgres partagé) = aucune pression RAM.

## Avant de commencer

- CB ou PayPal
- Email valide (validation requise)
- Téléphone (SMS validation OVH anti-fraude)
- Clé SSH publique prête (`cat ~/.ssh/id_ed25519.pub`)
  - Si pas de clé: `ssh-keygen -t ed25519 -C "anis@laptop"` puis Enter × 3

---

## 1. Crée compte OVH (si pas déjà)

1. https://www.ovhcloud.com/fr/ → **Se connecter** → **Créer un compte**
2. Type compte: **Particulier** (ou Entreprise si SIRET)
3. Remplis nom/adresse/email/téléphone
4. Email validation → clique lien
5. SMS validation → entre code

⚠️ Adresse réelle obligatoire (facture). Anti-fraude possible pour 1er achat.

---

## 2. Choisis le VPS

1. https://www.ovhcloud.com/fr/vps/
2. Section **VPS-3** (gamme 2026) → bouton **Configurer**

URL directe: https://www.ovhcloud.com/fr/vps/

Specs ciblées:

| Champ | Valeur |
|-------|--------|
| RAM | 24 Go |
| vCore | 8 |
| Stockage | 200 Go NVMe |
| Bande passante | 1.5 Gbps illimité |
| Backup daily | ✅ inclus (rolling 7j) |
| Prix | ~$19.97 (~18-19€ TTC) |

---

## 3. Configure VPS

Page configuration — choisis dans cet ordre:

### Datacenter
**Gravelines (GRA)** ou **Strasbourg (SBG)** — France métropole.
- Ping plus bas depuis Mac FR
- IP FR évite geoblock Unibet/Winamax scraping

### OS
**Distributions** → **Debian 12** (recommandé) ou **Ubuntu 24.04 LTS**

Pas Plesk, pas Windows, pas cPanel.

### Options
- ✅ **Standard automatic backup** = INCLUS gratuit (daily, rolling 7j) — ne rien faire
- ⚠️ **Premium backup** (7j restore + S3 externe, ~3.70$/mois) — skip MVP, restic gratuit suffit
- ⚠️ **Snapshots** (0.60$ chacun) — skip MVP, prends-en 1 avant gros changement
- ❌ **IP additionnelle** — skip
- ✅ **Anti-DDoS** activé par défaut, rien à faire

### Engagement
- **Mensuel** (recommandé MVP — flexibilité)
- 12 mois = -10% (vise ça après 1 mois si tu gardes)
- 24 mois = -20%

---

## 4. Paiement

1. Récap → **Continuer**
2. Connexion compte
3. Moyens paiement: **CB** ou **PayPal**
4. ✅ Accepter CGU OVH
5. **Payer**

⚠️ Première fois: OVH peut demander **validation manuelle** (photo CB + pièce identité). Délai 2-24h. Anticipe.

---

## 5. Récupère credentials

Dans les 5-10 min après paiement validé:

1. Email reçu: **"Votre VPS est prêt"**
2. Manager OVH → **Bare Metal Cloud** → **VPS** → ton VPS
3. Onglet **Informations générales** → note:
   - **IP publique IPv4**: `XX.XX.XX.XX`
   - **IPv6** (bonus)
   - **Nom serveur**: `vpsXXXXX.ovh.net`
4. Email séparé contient **mot de passe root initial**

⚠️ Mot de passe root = **temporaire**. À changer immédiatement (étape provisionnement).

---

## 6. Ajoute ta clé SSH (recommandé)

Avant 1er login — Manager OVH:

1. VPS → onglet **Mes services** → **Clés SSH**
2. **Ajouter une clé** → colle `~/.ssh/id_ed25519.pub`
3. Reboot VPS depuis Manager (icône ⟳) pour appliquer

Sinon: login par mot de passe puis ajout manuel via `ssh-copy-id`.

---

## 7. Premier SSH

```bash
ssh root@<vps-ip>
# accepte fingerprint (yes)
# mot de passe = celui reçu par email
```

Si OK → tu vois `root@vpsXXXXX:~#`. Continue avec `docs/first-deploy.md`.

---

## 8. DNS (en parallèle pendant paiement)

Si tu as un domaine (recommandé sinon utilise IP brute):

**Cloudflare** (ou autre):
1. Login → ton domaine → **DNS**
2. Add record:
   - Type: **A**
   - Name: `lab` (ou `*` wildcard)
   - Content: `<vps-ip>`
   - Proxy: **OFF** orange cloud → gris (Traefik gère TLS)
   - TTL: Auto
3. Ajoute aussi: Name `*.lab` → même IP (wildcard subdomains)

Propagation DNS: 1-60 min. Test: `dig lab.tondomaine.fr`.

---

## Récap coût total mensuel

| Item | Coût |
|------|------|
| VPS-3 24 Go | ~$19.97 (~18-19€ TTC) |
| Domaine zanely.fr (OVH) | ~0.60€/mois (~7€/an) |
| Object Storage OVH (S3 redondance backup externe) | ~1€/mois |
| **Total** | **~20€/mois TTC** |

Upgrade VPS-3 → VPS-4/5/6 = 1 click Manager OVH, no migration, no IP change.
Backup daily inclus = pas besoin script restic au démarrage (mais on en garde 1 externe pour DR off-site).

---

## Next

→ `docs/first-deploy.md` — provisionne + déploie tennis daemon
