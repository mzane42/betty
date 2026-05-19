# Terraform — zanely.fr infra

Provisionne **DNS records** (zanely.fr + sous-domaines) + **Object Storage bucket** (backups restic).

## Pourquoi pas l'instance VPS ?

VPS Elite = produit "legacy" OVH → **pas exposé** dans le provider Terraform. Public Cloud Instance le serait, mais ratio €/RAM moins bon pour always-on multi-projet (cf analyse multi-projet).

Achat VPS Elite = **manuel via web** (5 min). Tout le reste = Terraform.

## Layout

```
terraform/
├─ modules/
│  └─ dns-and-storage/          DNS records + S3 bucket + S3 creds
├─ environments/
│  └─ prod/                     main.tf + tfvars zanely.fr
└─ README.md
```

## Workflow complet

```
┌───────────────────────────────────────────────────────────────┐
│ 1. Achat VPS Elite via web (infra/docs/ovh-buy-guide.md)      │
│    → IP fixe X.X.X.X                                          │
│                                                               │
│ 2. terraform apply → DNS zanely.fr → IP + S3 bucket creds     │
│                                                               │
│ 3. ssh anis@<ip>  + bash provision.sh → hardening + Docker    │
│                                                               │
│ 4. docker compose up → Traefik + apps                         │
└───────────────────────────────────────────────────────────────┘
```

## Setup credentials

### 1. OVH API token

https://api.ovh.com/createToken/

Application name: `zanely-terraform`
Description: `Terraform DNS + S3`
Validity: **Unlimited**

Permissions:
```
GET    /cloud/*
POST   /cloud/*
PUT    /cloud/*
DELETE /cloud/*
GET    /domain/zone/*
POST   /domain/zone/*
PUT    /domain/zone/*
DELETE /domain/zone/*
```

Récupère: `application_key` + `application_secret` + `consumer_key`.

### 2. Cloud Project + OpenStack creds

Manager OVH → **Public Cloud** → **Créer un projet** (gratuit, sans instance — sert juste à héberger l'Object Storage).

Note l'**UUID du projet** (apparait dans l'URL après création).

Dans le projet:
- **Users & Roles** → **Add user** → role `Administrator`
- Note `user-XXXXX` + password généré

### 3. Variables

```bash
cd infra/terraform/environments/prod
cp terraform.tfvars.example terraform.tfvars
# Remplir avec les creds + vps_ipv4
```

## Run

```bash
cd infra/terraform/environments/prod
terraform init
terraform plan       # check ce qui sera créé
terraform apply      # tape "yes"
terraform output     # affiche FQDNs + bucket
```

Sortie typique:
```
fqdns = [
  "lab.zanely.fr",
  "tennis.zanely.fr",
  "n8n.zanely.fr",
  ...
]
backup_bucket = "zanely-backup"
s3_endpoint = "s3.gra.io.cloud.ovh.net"
```

S3 creds:
```bash
terraform output -json s3_credentials
# Copie dans compose/tennis/.env et /usr/local/bin/backup.sh côté VPS
```

## Modifier sous-domaines

Édite `environments/prod/main.tf` → liste `subdomains` → `terraform apply`. Records DNS ajoutés/retirés.

## State

MVP: state local (`.terraform/` ignoré git). Migrer vers S3 OVH backend pour collab/CI:

```hcl
terraform {
  backend "s3" {
    endpoints = { s3 = "https://s3.gra.io.cloud.ovh.net" }
    bucket    = "zanely-tf-state"
    key       = "prod.tfstate"
    region    = "gra"
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
  }
}
```

## Reload après changement IP VPS

Si tu migres VPS (Elite → Power 32, ou autre data-center):
```bash
# Édite terraform.tfvars → nouvelle vps_ipv4
terraform apply   # met à jour tous les records DNS
```

Propagation: 5-10 min (TTL 300s).
