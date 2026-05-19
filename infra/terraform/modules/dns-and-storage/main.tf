terraform {
  required_version = ">= 1.6"
  required_providers {
    ovh = {
      source  = "ovh/ovh"
      version = "~> 1.0"
    }
    openstack = {
      source  = "terraform-provider-openstack/openstack"
      version = "~> 3.0"
    }
  }
}

# NB: VPS Elite est produit legacy OVH → pas créable via Terraform.
# Ce module gère uniquement DNS (zanely.fr) + S3 backup bucket.
# Achat VPS = manuel via web (docs/ovh-buy-guide.md).
# IP du VPS = input variable (récupérée après provision web).

# 1. DNS records — un par sous-domaine
resource "ovh_domain_zone_record" "root" {
  zone      = var.domain_zone
  subdomain = ""
  fieldtype = "A"
  ttl       = 300
  target    = var.vps_ipv4
}

resource "ovh_domain_zone_record" "subdomains" {
  for_each  = toset(var.subdomains)
  zone      = var.domain_zone
  subdomain = each.value
  fieldtype = "A"
  ttl       = 300
  target    = var.vps_ipv4
}

resource "ovh_domain_zone_record" "wildcard" {
  zone      = var.domain_zone
  subdomain = "*"
  fieldtype = "A"
  ttl       = 300
  target    = var.vps_ipv4
}

# 2. Object Storage bucket pour backups restic
resource "ovh_cloud_project_user" "s3" {
  service_name = var.ovh_cloud_project_service
  description  = "${var.project_name}-backup-s3"
  role_name    = "objectstore_operator"
}

resource "ovh_cloud_project_user_s3_credential" "s3" {
  service_name = var.ovh_cloud_project_service
  user_id      = ovh_cloud_project_user.s3.id
}

resource "openstack_objectstorage_container_v1" "backup" {
  name   = "${var.project_name}-backup"
  region = var.region
}
