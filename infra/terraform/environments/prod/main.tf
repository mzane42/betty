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

provider "ovh" {
  endpoint           = "ovh-eu"
  application_key    = var.ovh_application_key
  application_secret = var.ovh_application_secret
  consumer_key       = var.ovh_consumer_key
}

provider "openstack" {
  auth_url    = "https://auth.cloud.ovh.net/v3"
  domain_name = "default"
  tenant_id   = var.ovh_cloud_project_service
  user_name   = var.openstack_user
  password    = var.openstack_password
  region      = "GRA"
}

module "infra" {
  source = "../../modules/dns-and-storage"

  project_name              = "zanely"
  domain_zone               = "zanely.fr"
  vps_ipv4                  = var.vps_ipv4
  ovh_cloud_project_service = var.ovh_cloud_project_service
  region                    = "GRA"

  subdomains = [
    "lab",
    "traefik",
    "logs",
    "uptime",
    "tennis",
    "n8n",
    "api",
    "admin",
    "app",
    "blog",
    "coach"
  ]
}

output "fqdns" {
  value = module.infra.subdomains_provisioned
}

output "backup_bucket" {
  value = module.infra.backup_bucket
}

output "s3_endpoint" {
  value = module.infra.s3_endpoint
}

output "s3_credentials" {
  value = {
    access_key = module.infra.s3_access_key
    secret_key = module.infra.s3_secret_key
  }
  sensitive = true
}
