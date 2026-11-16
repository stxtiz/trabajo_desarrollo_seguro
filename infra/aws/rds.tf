# =============================================================================
# AMAZON RDS FOR POSTGRESQL 16 (SUBREDES PRIVADAS AISLADAS Y CIFRADO EN REPOSO)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================

resource "aws_db_subnet_group" "postgres" {
  count = var.create_rds && !var.reuse_existing_rds ? 1 : 0

  name        = "${var.project_name}-rds-subnet-group"
  description = "Subredes privadas aisladas para Amazon RDS PostgreSQL"
  subnet_ids  = aws_subnet.private[*].id

  tags = {
    Name = "${var.project_name}-rds-subnet-group"
  }
}

resource "aws_db_instance" "postgres" {
  count = var.create_rds && !var.reuse_existing_rds ? 1 : 0

  identifier              = "${var.project_name}-postgres"
  engine                  = "postgres"
  engine_version          = "16"
  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  storage_type            = "gp3"
  storage_encrypted       = true
  db_name                 = var.db_name
  username                = var.db_username
  password                = random_password.db_password.result
  db_subnet_group_name    = aws_db_subnet_group.postgres[0].name
  vpc_security_group_ids  = [aws_security_group.rds_sg[0].id]
  publicly_accessible     = false
  multi_az                = false
  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false
  apply_immediately       = true

  tags = {
    Name = "${var.project_name}-postgres"
  }
}

data "aws_db_instance" "existing_postgres" {
  count                  = var.create_rds && var.reuse_existing_rds ? 1 : 0
  db_instance_identifier = "${var.project_name}-postgres"
}

locals {
  rds_address = var.create_rds ? (
    var.reuse_existing_rds ? data.aws_db_instance.existing_postgres[0].address : aws_db_instance.postgres[0].address
  ) : ""
  rds_endpoint = var.create_rds ? (
    var.reuse_existing_rds ? data.aws_db_instance.existing_postgres[0].endpoint : aws_db_instance.postgres[0].endpoint
  ) : "local-docker-postgres:5432"
  effective_db_password = var.db_password_override != "" ? var.db_password_override : random_password.db_password.result
}
