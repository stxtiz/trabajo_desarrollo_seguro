#!/usr/bin/env bash
# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO DESDE CERO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# Uso: ./1-desplegar-aws.sh      (despliegue interactivo si hay huerfanos)
#      ./1-desplegar-aws.sh -y   (limpia huerfanos sin terraform.tfstate automaticamente)
# =============================================================================
set -euo pipefail

export PATH="$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

AUTO_CONFIRM="false"
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then
  AUTO_CONFIRM="true"
fi

PROJECT_PREFIX="pnk-carta-digital"
TARGET_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

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
  if [ "$(uname -s)" = "Linux" ]; then
    echo "[INFO] Terraform no encontrado. Instalando automaticamente de forma persistente en $HOME/bin/terraform..."
    mkdir -p "$HOME/bin"
    ARCH="$(uname -m)"
    if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
      TF_ARCH="arm64"
    else
      TF_ARCH="amd64"
    fi
    TF_VER="1.11.2"
    curl -fsSL "https://releases.hashicorp.com/terraform/${TF_VER}/terraform_${TF_VER}_linux_${TF_ARCH}.zip" -o /tmp/terraform.zip
    unzip -o -q /tmp/terraform.zip -d "$HOME/bin"
    chmod +x "$HOME/bin/terraform"
    rm -f /tmp/terraform.zip
    echo "  Terraform $(terraform version -json 2>/dev/null | grep -o '"terraform_version":"[^"]*"' || terraform -version | head -n 1) instalado en $HOME/bin/terraform (persistente en CloudShell)."
  else
    echo "[ERROR] Terraform ('terraform') no esta instalado."
    echo "Instalalo desde: https://developer.hashicorp.com/terraform/install"
    exit 1
  fi
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

# 2b. Verificar si existen recursos huerfanos en AWS sin terraform.tfstate local (ej. CloudShell reiniciado)
HAS_LOCAL_STATE="false"
if [ -s "terraform.tfstate" ] && grep -q '"type":' terraform.tfstate 2>/dev/null; then
  HAS_LOCAL_STATE="true"
fi

if [ "$HAS_LOCAL_STATE" != "true" ]; then
  ORPHAN_LIST=""
  EXISTING_VPC="$(aws ec2 describe-vpcs --region "$TARGET_REGION" \
    --filters "Name=tag:Name,Values=${PROJECT_PREFIX}-vpc" \
    --query "Vpcs[0].VpcId" --output text 2>/dev/null || echo "")"
  if [ -n "$EXISTING_VPC" ] && [ "$EXISTING_VPC" != "None" ]; then
    ORPHAN_LIST="${ORPHAN_LIST} VPC(${EXISTING_VPC})"
  fi

  EXISTING_KEY="$(aws ec2 describe-key-pairs --region "$TARGET_REGION" \
    --key-names "${PROJECT_PREFIX}-deploy-key" \
    --query "KeyPairs[0].KeyName" --output text 2>/dev/null || echo "")"
  if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "None" ]; then
    ORPHAN_LIST="${ORPHAN_LIST} KeyPair(${EXISTING_KEY})"
  fi

  EXISTING_RDS="$(aws rds describe-db-instances --region "$TARGET_REGION" \
    --db-instance-identifier "${PROJECT_PREFIX}-postgres" \
    --query "DBInstances[0].DBInstanceIdentifier" --output text 2>/dev/null || echo "")"
  if [ -n "$EXISTING_RDS" ] && [ "$EXISTING_RDS" != "None" ]; then
    ORPHAN_LIST="${ORPHAN_LIST} RDS(${EXISTING_RDS})"
  fi

  EXISTING_ALB="$(aws elbv2 describe-load-balancers --region "$TARGET_REGION" \
    --names "${PROJECT_PREFIX}-alb" \
    --query "LoadBalancers[0].LoadBalancerName" --output text 2>/dev/null || echo "")"
  if [ -n "$EXISTING_ALB" ] && [ "$EXISTING_ALB" != "None" ]; then
    ORPHAN_LIST="${ORPHAN_LIST} ALB(${EXISTING_ALB})"
  fi

  EXISTING_ASG="$(aws autoscaling describe-auto-scaling-groups --region "$TARGET_REGION" \
    --auto-scaling-group-names "${PROJECT_PREFIX}-asg" \
    --query "AutoScalingGroups[0].AutoScalingGroupName" --output text 2>/dev/null || echo "")"
  if [ -n "$EXISTING_ASG" ] && [ "$EXISTING_ASG" != "None" ]; then
    ORPHAN_LIST="${ORPHAN_LIST} ASG(${EXISTING_ASG})"
  fi

  if [ -n "$ORPHAN_LIST" ]; then
    echo ""
    echo "[AVISO] No hay 'terraform.tfstate' local, pero ya existen recursos previos en AWS (${TARGET_REGION}):"
    echo "       ${ORPHAN_LIST}"
    echo "        (Esto ocurre si se perdió la sesión de CloudShell o se clonó el repo en otra carpeta.)"
    echo "        Terraform fallará con errores de recursos duplicados si no se limpian primero."
    if [ "$AUTO_CONFIRM" = "true" ]; then
      echo "  Limpiando automáticamente recursos huérfanos con ./2-destruir-aws.sh -y..."
      bash "$SCRIPT_DIR/2-destruir-aws.sh" -y
    else
      read -r -p "¿Deseas ejecutar './2-destruir-aws.sh -y' ahora para limpiar los recursos previos y continuar? [s/N]: " CLEAN_CONFIRM
      case "$CLEAN_CONFIRM" in
        s|S|si|SI|y|Y|yes|YES)
          bash "$SCRIPT_DIR/2-destruir-aws.sh" -y
          ;;
        *)
          echo "Despliegue cancelado. Ejecuta './2-destruir-aws.sh' manualmente antes de volver a desplegar."
          exit 1
          ;;
      esac
    fi
  fi
fi

# 3. Inicializar y validar Terraform
echo ""
echo "[2/4] Inicializando proveedores de Terraform..."
terraform init

echo ""
echo "[3/4] Validando configuracion de Terraform..."
terraform validate

# 4. Detectar Instance Profile (AWS Academy LabInstanceProfile vs cuenta personal) y aplicar
echo ""
echo "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
echo "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)"

IAM_PROFILE_VAR=""
if echo "$CALLER_ARN" | grep -qE "voclabs|LabRole"; then
  echo "  Entorno AWS Academy detectado: usando iam_instance_profile=LabInstanceProfile."
elif aws iam get-instance-profile --instance-profile-name LabInstanceProfile >/dev/null 2>&1; then
  echo "  Instance Profile 'LabInstanceProfile' encontrado."
else
  echo "  Cuenta personal sin 'LabInstanceProfile': usando iam_instance_profile=\"\"."
  IAM_PROFILE_VAR="-var=iam_instance_profile="
fi

if [ -n "$IAM_PROFILE_VAR" ]; then
  terraform apply -auto-approve "$IAM_PROFILE_VAR"
else
  terraform apply -auto-approve
fi

# Guardar outputs en JSON
terraform output -json > outputs-despliegue.json

if [ -f "pnk-ec2-deploy-key.pem" ]; then
  chmod 600 pnk-ec2-deploy-key.pem
fi

EIP="$(terraform output -raw elastic_ip)"
EIP_ALLOC_ID="$(terraform output -raw elastic_ip_allocation_id)"
ASG_NAME="$(terraform output -raw autoscaling_group_name)"
CF_ORIGIN_EIP="$(terraform output -raw cloudflare_origin_url_eip)"
ALB_DNS="$(terraform output -raw load_balancer_dns)"
CF_ORIGIN_ALB="$(terraform output -raw cloudflare_origin_url_alb)"
RDS_ENDPOINT="$(terraform output -raw rds_endpoint)"
SSH_KEY_PATH="infra/aws/pnk-ec2-deploy-key.pem"
SSH_CMD="ssh -i ${SSH_KEY_PATH} ubuntu@${EIP}"

# Asociar inmediatamente la Elastic IP a la primera instancia running del Auto Scaling Group
ASG_INSTANCE_ID="$(aws ec2 describe-instances \
  --filters "Name=tag:aws:autoscaling:groupName,Values=${ASG_NAME}" "Name=instance-state-name,Values=running" \
  --query "Reservations[0].Instances[0].InstanceId" \
  --output text 2>/dev/null || echo "")"

if [ -n "$ASG_INSTANCE_ID" ] && [ "$ASG_INSTANCE_ID" != "None" ]; then
  echo "  Asociando Elastic IP ($EIP / $EIP_ALLOC_ID) a instancia activa del ASG ($ASG_INSTANCE_ID)..."
  aws ec2 associate-address \
    --instance-id "$ASG_INSTANCE_ID" \
    --allocation-id "$EIP_ALLOC_ID" \
    --allow-reassociation >/dev/null
else
  echo "  Aviso: No se encontró aún una instancia 'running' en $ASG_NAME; user_data asociará la EIP al iniciar."
fi

echo ""
echo "============================================================================="
echo "  DESPLIEGUE AWS COMPLETADO EXITOSAMENTE"
echo "============================================================================="
echo ""
echo "  RESUMEN DE RECURSOS Y URLs:"
echo "  ---------------------------------------------------------------------------"
echo "  [PRINCIPAL] EC2_ORIGIN_URL (ALB): $CF_ORIGIN_ALB"
echo "    -> DNS permanente del Load Balancer (NUNCA cambia aunque termines/reemplaces EC2)"
echo "    -> Distribuye trafico con CERO downtime entre 2 instancias EC2 (2 AZs) del ASG ($ASG_NAME)"
echo "  Load Balancer URL (/carta)      : http://${ALB_DNS}/carta"
echo "  Elastic IP fija (EIP, ASG)      : $EIP (instancia actual: ${ASG_INSTANCE_ID:-pendiente})"
echo "  [Alternativa] Origin via EIP    : $CF_ORIGIN_EIP"
echo "  Amazon RDS Endpoint             : $RDS_ENDPOINT"
echo "  Llave SSH Privada (.pem)        : $SSH_KEY_PATH"
echo "  Comando SSH                     : $SSH_CMD"
echo "  Archivo de Outputs JSON         : infra/aws/outputs-despliegue.json"
echo ""
echo "  VARIABLE PRINCIPAL PARA CLOUDFLARE WORKER (Settings -> Variables and Secrets):"
echo "  ---------------------------------------------------------------------------"
echo "  EC2_ORIGIN_URL                  = $CF_ORIGIN_ALB"
echo "  (IMPORTANTE: Con esta URL del ALB, JAMAS tendras que cambiar DNS ni reconfigurar"
echo "   Cloudflare si terminas o reemplazas una instancia EC2 en Auto Scaling.)"
echo "  (Alternativa secundaria EIP)    = $CF_ORIGIN_EIP"
echo ""
echo "  SECRETOS PARA GITHUB ACTIONS (Settings -> Secrets and variables -> Actions):"
echo "  ---------------------------------------------------------------------------"
echo "  AWS_EC2_HOST                    = $EIP"
echo "  AWS_EC2_USER                    = ubuntu"
echo "  AWS_EC2_SSH_KEY                 = <contenido completo de infra/aws/pnk-ec2-deploy-key.pem>"
echo ""
echo "  NOTA: Las EC2 tardan ~3-5 min adicionales en compilar Docker e iniciar."
echo "  Verifica el estado con:"
echo "    curl -i http://${ALB_DNS}/health"
echo "    curl -i http://${EIP}/health"
echo "============================================================================="
