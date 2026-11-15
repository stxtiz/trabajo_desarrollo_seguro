# =============================================================================
# VARIABLES CONFIGURABLES - INFRAESTRUCTURA AWS
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================

variable "aws_region" {
  description = "Región de AWS donde se desplegará toda la infraestructura"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefijo para nombrar recursos AWS del proyecto"
  type        = string
  default     = "pnk-carta-digital"
}

variable "environment" {
  description = "Nombre del ambiente de despliegue"
  type        = string
  default     = "produccion"
}

variable "vpc_cidr" {
  description = "Bloque CIDR principal de la VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDRs de las 2 subredes públicas (ALB, EC2 Primaria y ASG)"
  type        = list(string)
  default     = ["10.20.1.0/24", "10.20.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDRs de las 2 subredes privadas aisladas (Amazon RDS PostgreSQL)"
  type        = list(string)
  default     = ["10.20.11.0/24", "10.20.12.0/24"]
}

variable "instance_type" {
  description = "Tipo de instancia EC2 (t3.micro elegible para Free Tier)"
  type        = string
  default     = "t3.micro"
}

variable "root_volume_size" {
  description = "Tamaño en GiB del volumen raíz EBS gp3 para cada EC2"
  type        = number
  default     = 20
}

variable "db_instance_class" {
  description = "Clase de instancia Amazon RDS PostgreSQL (db.t3.micro elegible para Free Tier)"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Almacenamiento en GiB asignado a Amazon RDS PostgreSQL"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Nombre de la base de datos PostgreSQL inicial en RDS"
  type        = string
  default     = "pnk_security"
}

variable "db_username" {
  description = "Usuario maestro de PostgreSQL en Amazon RDS"
  type        = string
  default     = "pnk_prod_user"
}

variable "ssh_allowed_cidr" {
  description = "CIDR permitido para acceso SSH (puerto 22). Recomendado restringir a tu IP pública /32 en producción real"
  type        = string
  default     = "0.0.0.0/0"
}

variable "git_repo_url" {
  description = "URL del repositorio Git a clonar en las instancias EC2"
  type        = string
  default     = "https://github.com/stxtiz/trabajo_desarrollo_seguro.git"
}

variable "git_branch" {
  description = "Rama Git de despliegue en producción"
  type        = string
  default     = "produccion"
}

variable "cors_origin" {
  description = "Orígenes permitidos para CORS_ORIGIN en el backend"
  type        = string
  default     = "*"
}

variable "asg_min_size" {
  description = "Cantidad mínima de instancias en el Auto Scaling Group"
  type        = number
  default     = 1
}

variable "asg_desired_capacity" {
  description = "Cantidad deseada de instancias en el Auto Scaling Group"
  type        = number
  default     = 1
}

variable "asg_max_size" {
  description = "Cantidad máxima de instancias en el Auto Scaling Group"
  type        = number
  default     = 3
}
