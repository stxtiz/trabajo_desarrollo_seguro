# =============================================================================
# OUTPUTS DEL DESPLIEGUE AWS - CARTA DIGITAL PNK SECURITY
# =============================================================================

output "elastic_ip" {
  description = "Elastic IP pública asignada a la instancia EC2 primaria (usar en AWS_EC2_HOST)"
  value       = aws_eip.primary.public_ip
}

output "cloudflare_origin_url_eip" {
  description = "URL de origen directa vía sslip.io para la variable EC2_ORIGIN_URL de Cloudflare Worker"
  value       = "http://${aws_eip.primary.public_ip}.sslip.io"
}

output "load_balancer_dns" {
  description = "DNS público del Application Load Balancer (ALB)"
  value       = aws_lb.main.dns_name
}

output "cloudflare_origin_url_alb" {
  description = "URL de origen balanceada (ALB + ASG) para la variable EC2_ORIGIN_URL de Cloudflare Worker"
  value       = "http://${aws_lb.main.dns_name}"
}

output "rds_endpoint" {
  description = "Endpoint privado de Amazon RDS PostgreSQL (solo accesible desde las EC2)"
  value       = aws_db_instance.postgres.endpoint
}

output "ssh_private_key_path" {
  description = "Ruta local de la llave privada SSH ED25519 generada automáticamente"
  value       = local_file.private_key_pem.filename
}

output "ssh_command" {
  description = "Comando SSH listo para conectarse a la instancia EC2 primaria"
  value       = "ssh -i ${local_file.private_key_pem.filename} ubuntu@${aws_eip.primary.public_ip}"
}

output "vpc_id" {
  description = "ID de la VPC creada"
  value       = aws_vpc.main.id
}

output "autoscaling_group_name" {
  description = "Nombre del Auto Scaling Group"
  value       = aws_autoscaling_group.app.name
}
