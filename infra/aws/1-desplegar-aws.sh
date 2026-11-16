#!/usr/bin/env bash
# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# Uso: ./1-desplegar-aws.sh                 (interactivo: pregunta por RDS)
#      ./1-desplegar-aws.sh -y              (no interactivo; reutiliza RDS si existe)
#      ./1-desplegar-aws.sh --keep-rds      (conserva y reutiliza RDS existente)
#      ./1-desplegar-aws.sh --delete-rds    (elimina RDS existente y recrea desde cero)
#      ./1-desplegar-aws.sh --without-rds   (despliega sin RDS, con PostgreSQL local en Docker)
# =============================================================================
set -euo pipefail

export PATH="$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

AUTO_CONFIRM="false"
RDS_PREF=""
CREATE_RDS_PREF=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      AUTO_CONFIRM="true"
      ;;
    --keep-rds)
      if [ "$RDS_PREF" = "delete" ]; then
        echo "[ERROR] No puedes combinar --keep-rds y --delete-rds."
        exit 1
      fi
      RDS_PREF="keep"
      ;;
    --delete-rds)
      if [ "$RDS_PREF" = "keep" ]; then
        echo "[ERROR] No puedes combinar --keep-rds y --delete-rds."
        exit 1
      fi
      RDS_PREF="delete"
      ;;
    --with-rds)
      if [ "$CREATE_RDS_PREF" = "false" ]; then
        echo "[ERROR] No puedes combinar --with-rds y --without-rds."
        exit 1
      fi
      CREATE_RDS_PREF="true"
      ;;
    --without-rds)
      if [ "$CREATE_RDS_PREF" = "true" ]; then
        echo "[ERROR] No puedes combinar --with-rds y --without-rds."
        exit 1
      fi
      CREATE_RDS_PREF="false"
      ;;
    -h|--help)
      echo "Uso: $0 [-y|--yes] [--keep-rds | --delete-rds] [--with-rds | --without-rds]"
      exit 0
      ;;
    *)
      echo "[ERROR] Opción desconocida: $1"
      echo "Uso: $0 [-y|--yes] [--keep-rds | --delete-rds] [--with-rds | --without-rds]"
      exit 1
      ;;
  esac
  shift
done

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
    TF_VER_OUT="$((terraform version -json 2>/dev/null || true) | (grep -o '"terraform_version":"[^"]*"' || true))"
    if [ -z "$TF_VER_OUT" ]; then
      TF_VER_OUT="$((terraform -version 2>/dev/null || true) | sed -n '1p')"
    fi
    echo "  Terraform ${TF_VER_OUT:-$TF_VER} instalado en $HOME/bin/terraform (persistente en CloudShell)."
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

# 2b. Verificar estado de Amazon RDS y recursos previos en AWS
HAS_LOCAL_STATE="false"
if [ -s "terraform.tfstate" ] && grep -q '"type":' terraform.tfstate 2>/dev/null; then
  HAS_LOCAL_STATE="true"
fi

RDS_ID="${PROJECT_PREFIX}-postgres"
EXISTING_RDS_STATUS="$(aws rds describe-db-instances --region "$TARGET_REGION" \
  --db-instance-identifier "$RDS_ID" \
  --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null || echo "")"
if [ "$EXISTING_RDS_STATUS" = "None" ] || [ "$EXISTING_RDS_STATUS" = "null" ]; then
  EXISTING_RDS_STATUS=""
fi

EXISTING_VPC="$(aws ec2 describe-vpcs --region "$TARGET_REGION" \
  --filters "Name=tag:Name,Values=${PROJECT_PREFIX}-vpc" "Name=state,Values=available" \
  --query "Vpcs[0].VpcId" --output text 2>/dev/null || echo "")"
if [ "$EXISTING_VPC" = "None" ] || [ "$EXISTING_VPC" = "null" ]; then
  EXISTING_VPC=""
fi

CREATE_RDS="true"
REUSE_EXISTING_RDS="false"
REUSE_DB_PASS=""

generate_rds_password() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 16
  elif command -v python3 >/dev/null 2>&1; then
    python3 -c "import secrets; print(secrets.token_hex(16))"
  else
    head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32
  fi
}

if [ "$EXISTING_RDS_STATUS" = "deleting" ]; then
  echo ""
  echo "[AVISO] La instancia Amazon RDS '${RDS_ID}' está actualmente en estado 'deleting'."
  echo "        Esperando a que finalice su eliminación para continuar..."
  aws rds wait db-instance-deleted --region "$TARGET_REGION" --db-instance-identifier "$RDS_ID" || true
  EXISTING_RDS_STATUS=""
fi

if [ -n "$EXISTING_RDS_STATUS" ]; then
  echo ""
  echo "[RDS DETECTADO] Se encontró una instancia Amazon RDS existente: ${RDS_ID} (estado: ${EXISTING_RDS_STATUS})."

  RDS_ACTION=""
  if [ "$RDS_PREF" = "keep" ]; then
    RDS_ACTION="keep"
  elif [ "$RDS_PREF" = "delete" ]; then
    RDS_ACTION="delete"
  elif [ "$AUTO_CONFIRM" = "true" ]; then
    RDS_ACTION="keep"
    echo "  Modo automático (-y): conservando y reutilizando RDS existente (${RDS_ID})."
  else
    echo "¿Deseas ELIMINAR el RDS existente para recrearlo desde cero, o CONSERVARLO para reutilizarlo?"
    echo "  - 'N' (Por defecto - Recomendado): Conserva el RDS actual (mantiene tus datos) y su VPC,"
    echo "    limpia solo EC2/ALB/ASG previos y levanta todo rápido (~2-3 min)."
    echo "  - 's': Elimina el RDS actual y recrea toda la infraestructura desde cero (~10 min; BORRA datos)."
    RDS_DEL_CONFIRM=""
    read -r -p "¿Eliminar el RDS existente? [s/N]: " RDS_DEL_CONFIRM || RDS_DEL_CONFIRM=""
    case "$RDS_DEL_CONFIRM" in
      s|S|si|SI|y|Y|yes|YES)
        RDS_ACTION="delete"
        ;;
      *)
        RDS_ACTION="keep"
        ;;
    esac
  fi

  if [ "$RDS_ACTION" = "keep" ]; then
    ALB_SG_OK=""
    EC2_SG_OK=""
    PUB_SUBNET_COUNT="0"
    if [ -n "$EXISTING_VPC" ]; then
      ALB_SG_OK="$(aws ec2 describe-security-groups --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${EXISTING_VPC}" "Name=group-name,Values=${PROJECT_PREFIX}-alb-sg" \
        --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")"
      EC2_SG_OK="$(aws ec2 describe-security-groups --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${EXISTING_VPC}" "Name=group-name,Values=${PROJECT_PREFIX}-ec2-sg" \
        --query "SecurityGroups[0].GroupId" --output text 2>/dev/null || echo "")"
      PUB_SUBNET_COUNT="$(aws ec2 describe-subnets --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${EXISTING_VPC}" "Name=tag:Tier,Values=public" \
        --query "length(Subnets)" --output text 2>/dev/null || echo "0")"
    fi

    if [ -z "$EXISTING_VPC" ] || [ -z "$ALB_SG_OK" ] || [ "$ALB_SG_OK" = "None" ] || [ -z "$EC2_SG_OK" ] || [ "$EC2_SG_OK" = "None" ] || [ "${PUB_SUBNET_COUNT:-0}" -lt 2 ]; then
      echo "[AVISO] No se encontró la VPC o Security Groups completos necesarios para reutilizar ${RDS_ID}."
      if [ "$AUTO_CONFIRM" = "true" ]; then
        echo "[ERROR] Red base incompleta para reutilizar RDS en modo automático."
        exit 1
      fi
      RECREATE_CONFIRM=""
      read -r -p "¿Deseas ejecutar './2-destruir-aws.sh -y --delete-rds' para limpiar todo y recrear desde cero? [s/N]: " RECREATE_CONFIRM || RECREATE_CONFIRM=""
      case "$RECREATE_CONFIRM" in
        s|S|si|SI|y|Y|yes|YES)
          RDS_ACTION="delete"
          ;;
        *)
          echo "Despliegue cancelado."
          exit 1
          ;;
      esac
    fi
  fi

  if [ "$RDS_ACTION" = "keep" ]; then
    echo ""
    echo "  Preparando reutilización de Amazon RDS (${RDS_ID}) en VPC ${EXISTING_VPC}..."
    bash "$SCRIPT_DIR/2-destruir-aws.sh" -y --keep-rds

    CURR_RDS_STATUS="$(aws rds describe-db-instances --region "$TARGET_REGION" \
      --db-instance-identifier "$RDS_ID" \
      --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null || echo "")"
    if [ "$CURR_RDS_STATUS" != "available" ]; then
      echo "  Esperando a que Amazon RDS (${RDS_ID}) alcance estado 'available' (actual: ${CURR_RDS_STATUS})..."
      aws rds wait db-instance-available --region "$TARGET_REGION" --db-instance-identifier "$RDS_ID"
    fi

    REUSE_DB_PASS="$(generate_rds_password)"
    echo "  Sincronizando credencial de conexión en Amazon RDS (${RDS_ID})..."
    aws rds modify-db-instance \
      --region "$TARGET_REGION" \
      --db-instance-identifier "$RDS_ID" \
      --master-user-password "$REUSE_DB_PASS" \
      --apply-immediately >/dev/null
    echo "  Esperando confirmación de Amazon RDS (~30-45 seg)..."
    sleep 10
    aws rds wait db-instance-available --region "$TARGET_REGION" --db-instance-identifier "$RDS_ID"

    REUSE_EXISTING_RDS="true"
    CREATE_RDS="true"
  else
    echo "  Eliminando infraestructura previa (incluyendo RDS) antes de recrear desde cero..."
    bash "$SCRIPT_DIR/2-destruir-aws.sh" -y --delete-rds
    REUSE_EXISTING_RDS="false"
    if [ "$CREATE_RDS_PREF" = "false" ]; then
      CREATE_RDS="false"
    else
      CREATE_RDS="true"
    fi
  fi
else
  if [ "$HAS_LOCAL_STATE" != "true" ]; then
    ORPHAN_LIST=""
    if [ -n "$EXISTING_VPC" ]; then
      ORPHAN_LIST="${ORPHAN_LIST} VPC(${EXISTING_VPC})"
    fi

    EXISTING_KEY="$(aws ec2 describe-key-pairs --region "$TARGET_REGION" \
      --key-names "${PROJECT_PREFIX}-deploy-key" \
      --query "KeyPairs[0].KeyName" --output text 2>/dev/null || echo "")"
    if [ -n "$EXISTING_KEY" ] && [ "$EXISTING_KEY" != "None" ]; then
      ORPHAN_LIST="${ORPHAN_LIST} KeyPair(${EXISTING_KEY})"
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
        echo "  Limpiando automáticamente recursos huérfanos con ./2-destruir-aws.sh -y --delete-rds..."
        bash "$SCRIPT_DIR/2-destruir-aws.sh" -y --delete-rds
      else
        CLEAN_CONFIRM=""
        read -r -p "¿Deseas ejecutar './2-destruir-aws.sh -y --delete-rds' ahora para limpiar los recursos previos y continuar? [s/N]: " CLEAN_CONFIRM || CLEAN_CONFIRM=""
        case "$CLEAN_CONFIRM" in
          s|S|si|SI|y|Y|yes|YES)
            bash "$SCRIPT_DIR/2-destruir-aws.sh" -y --delete-rds
            ;;
          *)
            echo "Despliegue cancelado. Ejecuta './2-destruir-aws.sh' manualmente antes de volver a desplegar."
            exit 1
            ;;
        esac
      fi
    fi
  fi

  if [ "$CREATE_RDS_PREF" = "false" ]; then
    CREATE_RDS="false"
  elif [ "$CREATE_RDS_PREF" = "true" ]; then
    CREATE_RDS="true"
  elif [ "$AUTO_CONFIRM" = "true" ]; then
    CREATE_RDS="true"
  else
    echo ""
    echo "No se detectó una instancia Amazon RDS activa (${RDS_ID}) en ${TARGET_REGION}."
    echo "¿Deseas crear la base de datos Amazon RDS PostgreSQL en este despliegue?"
    echo "  - 'S' (Por defecto - Recomendado): Crea Amazon RDS PostgreSQL 16 en subred privada (~6-10 min)."
    echo "  - 'n': Despliega SIN Amazon RDS usando PostgreSQL en contenedor Docker local en EC2 (~2 min)."
    echo "         (Nota: sin RDS, cada EC2 usa su propia BD local en lugar de una BD compartida.)"
    CREATE_RDS_CONFIRM=""
    read -r -p "¿Crear Amazon RDS PostgreSQL? [S/n]: " CREATE_RDS_CONFIRM || CREATE_RDS_CONFIRM=""
    case "$CREATE_RDS_CONFIRM" in
      n|N|no|NO)
        CREATE_RDS="false"
        ;;
      *)
        CREATE_RDS="true"
        ;;
    esac
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
if [ "$REUSE_EXISTING_RDS" = "true" ]; then
  echo "[4/4] Reutilizando VPC y Amazon RDS (${RDS_ID}); creando EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
  echo "      (Despliegue rápido: suele tardar entre 2 y 3 minutos)"
elif [ "$CREATE_RDS" = "true" ]; then
  echo "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
  echo "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)"
else
  echo "[4/4] Creando VPC, Security Groups, EIP, ALB y Auto Scaling Group sin Amazon RDS (PostgreSQL local en Docker)..."
  echo "      (Despliegue rápido: suele tardar entre 2 y 3 minutos)"
fi

TF_APPLY_ARGS=(
  "apply"
  "-auto-approve"
  "-var=create_rds=${CREATE_RDS}"
  "-var=reuse_existing_rds=${REUSE_EXISTING_RDS}"
)
if [ -n "$REUSE_DB_PASS" ]; then
  TF_APPLY_ARGS+=("-var=db_password_override=${REUSE_DB_PASS}")
fi

if [[ "$CALLER_ARN" =~ (voclabs|LabRole) ]]; then
  echo "  Entorno AWS Academy detectado: usando iam_instance_profile=LabInstanceProfile."
elif aws iam get-instance-profile --instance-profile-name LabInstanceProfile >/dev/null 2>&1; then
  echo "  Instance Profile 'LabInstanceProfile' encontrado."
else
  echo "  Cuenta personal sin 'LabInstanceProfile': usando iam_instance_profile=\"\"."
  TF_APPLY_ARGS+=("-var=iam_instance_profile=")
fi

terraform "${TF_APPLY_ARGS[@]}"

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
  if ! aws ec2 associate-address \
    --instance-id "$ASG_INSTANCE_ID" \
    --allocation-id "$EIP_ALLOC_ID" \
    --allow-reassociation >/dev/null 2>&1; then
    echo "  Aviso: No se pudo asociar la Elastic IP aún; user_data la asociará al iniciar."
  fi
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
if [ "$CREATE_RDS" != "true" ]; then
  echo "  Base de datos PostgreSQL        : Contenedor Docker local en EC2 (sin Amazon RDS)"
elif [ "$REUSE_EXISTING_RDS" = "true" ]; then
  echo "  Amazon RDS Endpoint (REUTILIZADO): $RDS_ENDPOINT"
else
  echo "  Amazon RDS Endpoint             : $RDS_ENDPOINT"
fi
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
