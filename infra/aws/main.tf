# =============================================================================
# LLAVE SSH ED25519 Y SECRETOS CRIPTOGRÁFICOS CSPRNG
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3 - V6.3 / V14.2)
# =============================================================================

# Par de llaves SSH ED25519 generado automáticamente (sin pasos manuales en consola AWS)
resource "tls_private_key" "deploy_key" {
  algorithm = "ED25519"
}

resource "aws_key_pair" "deploy_key" {
  key_name   = "${var.project_name}-deploy-key"
  public_key = tls_private_key.deploy_key.public_key_openssh

  tags = {
    Name = "${var.project_name}-deploy-key"
  }
}

resource "local_file" "private_key_pem" {
  content         = tls_private_key.deploy_key.private_key_openssh
  filename        = "${path.module}/pnk-ec2-deploy-key.pem"
  file_permission = "0600"
}

# Contraseña CSPRNG de alta entropía para Amazon RDS PostgreSQL (segura para URLs y .env)
resource "random_password" "db_password" {
  length  = 32
  special = false
}

# Pepper criptográfico CSPRNG de alta entropía compartido entre EC2 Primaria y ASG
resource "random_password" "password_pepper" {
  length  = 48
  special = false
}
