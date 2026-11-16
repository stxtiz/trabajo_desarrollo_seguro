# =============================================================================
# GRUPOS DE SEGURIDAD (FIREWALL) - OWASP ASVS v5.0 NIVEL 3 (V14)
# NOTA CRÍTICA DE SEGURIDAD:
#   - Puerto 3000 (Backend API) NUNCA se expone al exterior; solo es accesible
#     internamente dentro de la red Docker (edge_net) vía proxy del Frontend.
#   - Puerto 5432 (PostgreSQL RDS) NUNCA se expone al exterior; solo acepta
#     tráfico desde ec2_sg dentro de las subredes privadas aisladas.
# =============================================================================

data "aws_security_group" "existing_alb_sg" {
  count  = var.reuse_existing_rds ? 1 : 0
  vpc_id = local.vpc_id
  name   = "${var.project_name}-alb-sg"
}

data "aws_security_group" "existing_ec2_sg" {
  count  = var.reuse_existing_rds ? 1 : 0
  vpc_id = local.vpc_id
  name   = "${var.project_name}-ec2-sg"
}

locals {
  alb_sg_id = var.reuse_existing_rds ? data.aws_security_group.existing_alb_sg[0].id : aws_security_group.alb_sg[0].id
  ec2_sg_id = var.reuse_existing_rds ? data.aws_security_group.existing_ec2_sg[0].id : aws_security_group.ec2_sg[0].id
}

# --- Security Group para Application Load Balancer (ALB) ---
resource "aws_security_group" "alb_sg" {
  count = local.manage_network ? 1 : 0

  name        = "${var.project_name}-alb-sg"
  description = "ASVS v5.0 L3: Permite HTTP 80 entrante hacia el ALB y salida solo hacia ec2_sg"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTP desde Internet / Cloudflare Worker hacia el ALB"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description     = "Salida HTTP unicamente hacia instancias EC2 en ec2_sg"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2_sg[0].id]
  }

  tags = {
    Name = "${var.project_name}-alb-sg"
  }
}

# --- Security Group para Instancias EC2 del Auto Scaling Group ---
resource "aws_security_group" "ec2_sg" {
  count = local.manage_network ? 1 : 0

  name        = "${var.project_name}-ec2-sg"
  description = "ASVS v5.0 L3: Solo HTTP 80 (ALB / sslip.io) y SSH 22 (llave ED25519). Puertos 3000 y 5432 nunca expuestos"
  vpc_id      = local.vpc_id

  ingress {
    description = "HTTP 80 para ALB y origen directo Cloudflare Worker (sslip.io)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "SSH 22 autenticado exclusivamente con llave ED25519 generada por Terraform"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_allowed_cidr]
  }

  # IMPORTANTE: No agregar reglas de entrada para los puertos 3000 (Backend) ni 5432 (PostgreSQL).

  egress {
    description = "Salida para descargar imagenes Docker, clonar GitHub, bundle SSL RDS y conectar a RDS 5432"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${var.project_name}-ec2-sg"
  }
}

# --- Security Group para Amazon RDS PostgreSQL (Privado y Aislado) ---
resource "aws_security_group" "rds_sg" {
  count = local.manage_network && var.create_rds ? 1 : 0

  name        = "${var.project_name}-rds-sg"
  description = "ASVS v5.0 L3: Acceso PostgreSQL 5432 exclusivamente desde ec2_sg (cero acceso publico)"
  vpc_id      = local.vpc_id

  ingress {
    description     = "PostgreSQL 5432 unicamente desde instancias en ec2_sg"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ec2_sg[0].id]
  }

  tags = {
    Name = "${var.project_name}-rds-sg"
  }
}
