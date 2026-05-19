variable "project_name" {
  type    = string
  default = "zanely"
}

variable "ovh_cloud_project_service" {
  type        = string
  description = "UUID Cloud Project OVH (pour Object Storage backups)"
  sensitive   = true
}

variable "region" {
  type    = string
  default = "GRA"
}

variable "domain_zone" {
  type        = string
  description = "Zone DNS racine (ex: zanely.fr)"
  default     = "zanely.fr"
}

variable "vps_ipv4" {
  type        = string
  description = "IP publique du VPS Elite (récupérée après achat web)"
}

variable "subdomains" {
  type        = list(string)
  description = "Sous-domaines à pointer vers VPS"
  default = [
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
