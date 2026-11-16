# =============================================================================
# RED VIRTUAL (VPC), SUBREDES PÚBLICAS/PRIVADAS, IGW Y TABLAS DE RUTAS
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_vpc" "existing" {
  count = var.reuse_existing_rds ? 1 : 0

  filter {
    name   = "tag:Name"
    values = ["${var.project_name}-vpc"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

data "aws_subnets" "existing_public" {
  count = var.reuse_existing_rds ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.existing[0].id]
  }

  filter {
    name   = "tag:Tier"
    values = ["public"]
  }
}

locals {
  manage_network    = !var.reuse_existing_rds
  vpc_id            = var.reuse_existing_rds ? data.aws_vpc.existing[0].id : aws_vpc.main[0].id
  public_subnet_ids = var.reuse_existing_rds ? sort(data.aws_subnets.existing_public[0].ids) : aws_subnet.public[*].id
}

resource "aws_vpc" "main" {
  count = local.manage_network ? 1 : 0

  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "${var.project_name}-vpc"
  }
}

resource "aws_internet_gateway" "main" {
  count = local.manage_network ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  tags = {
    Name = "${var.project_name}-igw"
  }
}

# --- 2 Subredes Públicas en 2 Zonas de Disponibilidad (ALB y Auto Scaling Group) ---
resource "aws_subnet" "public" {
  count = local.manage_network ? 2 : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name = "${var.project_name}-public-${count.index + 1}"
    Tier = "public"
  }
}

resource "aws_route_table" "public" {
  count = local.manage_network ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = {
    Name = "${var.project_name}-public-rt"
  }
}

resource "aws_route_table_association" "public" {
  count = local.manage_network ? 2 : 0

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# --- 2 Subredes Privadas Aisladas en 2 AZs (Cero acceso a Internet para Amazon RDS) ---
resource "aws_subnet" "private" {
  count = local.manage_network ? 2 : 0

  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = var.private_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = false

  tags = {
    Name = "${var.project_name}-private-${count.index + 1}"
    Tier = "private-isolated"
  }
}

resource "aws_route_table" "private" {
  count = local.manage_network ? 1 : 0

  vpc_id = aws_vpc.main[0].id

  # Sin ruta hacia IGW ni NAT Gateway: aislamiento total de red para Amazon RDS (ASVS v5.0 V14)
  tags = {
    Name = "${var.project_name}-private-rt"
  }
}

resource "aws_route_table_association" "private" {
  count = local.manage_network ? 2 : 0

  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[0].id
}
