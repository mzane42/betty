output "domain_root" {
  value       = var.domain_zone
  description = "Zone racine"
}

output "subdomains_provisioned" {
  value       = [for s in var.subdomains : "${s}.${var.domain_zone}"]
  description = "Liste FQDN provisionnés"
}

output "backup_bucket" {
  value       = openstack_objectstorage_container_v1.backup.name
  description = "Nom bucket Object Storage backup"
}

output "s3_endpoint" {
  value       = "s3.${lower(var.region)}.io.cloud.ovh.net"
  description = "Endpoint S3 OVH"
}

output "s3_access_key" {
  value       = ovh_cloud_project_user_s3_credential.s3.access_key_id
  description = "Access key S3 pour restic"
  sensitive   = true
}

output "s3_secret_key" {
  value       = ovh_cloud_project_user_s3_credential.s3.secret_access_key
  description = "Secret key S3 pour restic"
  sensitive   = true
}
