variable "ovh_application_key" {
  type      = string
  sensitive = true
}

variable "ovh_application_secret" {
  type      = string
  sensitive = true
}

variable "ovh_consumer_key" {
  type      = string
  sensitive = true
}

variable "ovh_cloud_project_service" {
  type        = string
  sensitive   = true
  description = "UUID Cloud Project OVH (Public Cloud → projet créé pour S3)"
}

variable "openstack_user" {
  type      = string
  sensitive = true
}

variable "openstack_password" {
  type      = string
  sensitive = true
}

variable "vps_ipv4" {
  type        = string
  description = "IP publique du VPS Elite (depuis Manager OVH après achat)"
}
