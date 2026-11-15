#!/usr/bin/env bash
# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO DESDE CERO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================================================="
echo "  PNK Security - Script 1: Despliegue Completo de Infraestructura AWS"
echo "============================================================================="

# 1. Verificar herramientas requeridas
if ! command -v aws >/dev/null 2>&1; then
  echo "[ERROR] AWS CLI ('aws') no esta instalado."
  echo "Instálalo desde: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "[ERROR] Terraform ('terraform') no esta instalado."
  echo "Instálalo desde: https://developer.hashicorp.com/terraform/install"
  exit 1
fi

# 2. Verificar sesión activa en AWS CLI
echo "[1/4] Verificando credenciales activas de AWS CLI..."
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo ""
  echo "[ERROR] No hay credenciales activas de AWS configuradas o el token temporal expiró."
  echo ""
  echo "Si usas AWS Academy Learner Lab (LabStudent / LabRole):"
  echo "  1. Verifica en el portal que el laboratorio esté activo ('Start Lab' en verde)."
  echo "  2. Haz clic en 'AWS Details' -> 'AWS CLI: Show' -> 'Copy'."
  echo "  3. Pega el bloque [default] completo (aws_access_key_id, aws_secret_access_key y"
  echo "     aws_session_token) en ~/.aws/credentials (mkdir -p ~/.aws && chmod 600 ~/.aws/credentials)."
  echo "     (IMPORTANTE: 'aws configure' NO pide aws_session_token; sin él falla con InvalidClientTokenId)."
  echo "     (Si apareció ExpiredToken tras ~4h, vuelve a copiar credenciales frescas desde AWS Details)."
  echo "  4. Verifica que la región sea us-east-1 (requerida por Learner Lab):"
  echo "       aws configure set region us-east-1"
  echo "       export AWS_DEFAULT_REGION=us-east-1"
  echo "  5. Alternativa sin copiar llaves: ejecuta ./1-desplegar-aws.sh desde AWS CloudShell (us-east-1)."
  echo ""
  echo "Si usas una cuenta AWS personal estándar: ejecuta 'aws configure' (región us-east-1)."
  exit 1
fi

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
CALLER_ARN="$(aws sts get-caller-identity --query Arn --output text)"
echo "  Cuenta AWS verificada: $ACCOUNT_ID ($CALLER_ARN)"

# 3. Inicializar y validar Terraform
echo ""
echo "[2/4] Inicializando proveedores de Terraform..."
terraform init

echo ""
echo "[3/4] Validando configuracion de Terraform..."
terraform validate

# 4. Aplicar infraestructura
echo ""
echo "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EC2, EIP, ALB y ASG..."
echo "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)"
terraform apply -auto-approve

# Guardar outputs en JSON
terraform output -json > outputs-despliegue.json

if [ -f "pnk-ec2-deploy-key.pem" ]; then
  chmod 600 pnk-ec2-deploy-key.pem
fi

EIP="$(terraform output -raw elastic_ip)"
CF_ORIGIN_EIP="$(terraform output -raw cloudflare_origin_url_eip)"
ALB_DNS="$(terraform output -raw load_balancer_dns)"
CF_ORIGIN_ALB="$(terraform output -raw cloudflare_origin_url_alb)"
RDS_ENDPOINT="$(terraform output -raw rds_endpoint)"
SSH_KEY_PATH="infra/aws/pnk-ec2-deploy-key.pem"
SSH_CMD="ssh -i ${SSH_KEY_PATH} ubuntu@${EIP}"

echo ""
echo "============================================================================="
echo "  DESPLIEGUE AWS COMPLETADO EXITOSAMENTE"
echo "============================================================================="
echo ""
echo "  RESUMEN DE RECURSOS Y URLs:"
echo "  ---------------------------------------------------------------------------"
echo "  Elastic IP (EIP)             : $EIP"
echo "  EC2_ORIGIN_URL (via EIP)     : $CF_ORIGIN_EIP"
echo "  EC2_ORIGIN_URL (via ALB)     : $CF_ORIGIN_ALB"
echo "  Load Balancer URL (/carta)   : http://${ALB_DNS}/carta"
echo "  Amazon RDS Endpoint          : $RDS_ENDPOINT"
echo "  Llave SSH Privada (.pem)     : $SSH_KEY_PATH"
echo "  Comando SSH                  : $SSH_CMD"
echo "  Archivo de Outputs JSON      : infra/aws/outputs-despliegue.json"
echo ""
echo "  VARIABLES PARA CLOUDFLARE WORKER (Workers & Pages -> Settings -> Variables):"
echo "  ---------------------------------------------------------------------------"
echo "  EC2_ORIGIN_URL               = $CF_ORIGIN_ALB"
echo "  (Alternativa directa EIP)    = $CF_ORIGIN_EIP"
echo ""
echo "  SECRETOS PARA GITHUB ACTIONS (Settings -> Secrets and variables -> Actions):"
echo "  ---------------------------------------------------------------------------"
echo "  AWS_EC2_HOST                 = $EIP"
echo "  AWS_EC2_USER                 = ubuntu"
echo "  AWS_EC2_SSH_KEY              = <contenido completo de infra/aws/pnk-ec2-deploy-key.pem>"
echo ""
echo "  NOTA: La EC2 tarda ~3-5 min adicionales en compilar Docker e iniciar."
echo "  Verifica el estado con:"
echo "    curl -i http://${EIP}/health"
echo "    curl -i http://${ALB_DNS}/health"
echo "============================================================================="
