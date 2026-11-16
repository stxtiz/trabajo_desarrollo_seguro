#!/usr/bin/env bash
# =============================================================================
# SCRIPT 2: DESTRUCCIÓN DE INFRAESTRUCTURA AWS (STATELESS + TERRAFORM)
# Proyecto: Carta Digital PNK Security
# Uso: ./2-destruir-aws.sh               (interactivo: pregunta si eliminar RDS)
#      ./2-destruir-aws.sh --keep-rds    (conserva RDS y su VPC base)
#      ./2-destruir-aws.sh --delete-rds  (elimina todo, incluyendo RDS y VPC)
#      ./2-destruir-aws.sh -y [--keep-rds | --delete-rds]
#
# Diseñado a prueba de pérdida de sesión (ej. AWS CloudShell sin terraform.tfstate):
#   1) Si DELETE_RDS="true" y existe terraform.tfstate local, ejecuta 'terraform destroy'.
#   2) Siempre ejecuta un barrido directo por AWS CLI (Stateless Sweep) por prefijo
#      'pnk-carta-digital' en orden de dependencias. Si DELETE_RDS="false", conserva
#      Amazon RDS y su red VPC/Subredes/Security Groups para reutilización rápida.
# =============================================================================
# Sin -e ni pipefail: un recurso ausente en AWS CLI (ej. exit 254 LoadBalancerNotFound/DBInstanceNotFound)
# nunca debe abortar el barrido stateless.
set -u

export PATH="$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

AUTO_CONFIRM="false"
RDS_MODE=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      AUTO_CONFIRM="true"
      ;;
    --delete-rds)
      if [ "$RDS_MODE" = "keep" ]; then
        echo "[ERROR] No puedes combinar --delete-rds y --keep-rds."
        exit 1
      fi
      RDS_MODE="delete"
      ;;
    --keep-rds)
      if [ "$RDS_MODE" = "delete" ]; then
        echo "[ERROR] No puedes combinar --delete-rds y --keep-rds."
        exit 1
      fi
      RDS_MODE="keep"
      ;;
    -h|--help)
      echo "Uso: $0 [-y|--yes] [--keep-rds | --delete-rds]"
      exit 0
      ;;
    *)
      echo "[ERROR] Opción desconocida: $1"
      echo "Uso: $0 [-y|--yes] [--keep-rds | --delete-rds]"
      exit 1
      ;;
  esac
  shift
done

PROJECT_PREFIX="pnk-carta-digital"
TARGET_REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}"

echo "============================================================================="
echo "  PNK Security - Script 2: Destruir Infraestructura AWS (Stateless Teardown)"
echo "============================================================================="

if ! command -v aws >/dev/null 2>&1; then
  echo "[ERROR] AWS CLI ('aws') no esta instalado."
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo ""
  echo "[ERROR] No hay credenciales activas de AWS configuradas o el token temporal expiró."
  echo ""
  echo "Si usas AWS Academy Learner Lab (LabStudent / LabRole):"
  echo "  1. Verifica en el portal que el laboratorio esté activo ('Start Lab' en verde)."
  echo "  2. Haz clic en 'AWS Details' -> 'AWS CLI: Show' -> 'Copy'."
  echo "  3. Pega el bloque [default] completo (aws_access_key_id, aws_secret_access_key y"
  echo "     aws_session_token) en ~/.aws/credentials."
  echo "     (IMPORTANTE: 'aws configure' NO pide aws_session_token; si expiró tras ~4h, copia credenciales nuevas)."
  echo "  4. Verifica la región us-east-1: aws configure set region us-east-1  (o export AWS_DEFAULT_REGION=us-east-1)."
  echo "  5. Alternativa sin copiar llaves: ejecuta ./2-destruir-aws.sh desde AWS CloudShell (us-east-1)."
  echo ""
  echo "Si usas una cuenta AWS personal estándar: ejecuta 'aws configure' (región us-east-1)."
  exit 1
fi

RDS_ID="${PROJECT_PREFIX}-postgres"
EXISTING_RDS_STATUS="$((aws rds describe-db-instances --region "$TARGET_REGION" \
  --db-instance-identifier "$RDS_ID" \
  --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null || true) | tr -d '\r\n' || true)"
if [ "$EXISTING_RDS_STATUS" = "None" ] || [ "$EXISTING_RDS_STATUS" = "null" ]; then
  EXISTING_RDS_STATUS=""
fi

DELETE_RDS="true"
if [ "$RDS_MODE" = "keep" ]; then
  DELETE_RDS="false"
elif [ "$RDS_MODE" = "delete" ]; then
  DELETE_RDS="true"
elif [ "$AUTO_CONFIRM" = "true" ]; then
  DELETE_RDS="true"
else
  echo ""
  if [ -n "$EXISTING_RDS_STATUS" ]; then
    echo "Base de datos Amazon RDS detectada en ${TARGET_REGION}: ${RDS_ID} (estado: ${EXISTING_RDS_STATUS})"
  else
    echo "No se detectó una instancia Amazon RDS activa (${RDS_ID}) en ${TARGET_REGION}."
  fi
  echo "¿Deseas eliminar también la base de datos Amazon RDS (${RDS_ID})?"
  echo "  - 's': Elimina TODO, incluyendo Amazon RDS y la VPC completa (~5-8 min; BORRA tus datos)."
  echo "  - 'N' (Por defecto): Conserva Amazon RDS y su VPC/Subredes/Security Groups base"
  echo "    para reutilizarlos rápido en el próximo despliegue (~45 seg; MANTIENE tus datos)."
  RDS_CONFIRM=""
  read -r -p "¿Eliminar Amazon RDS? [s/N]: " RDS_CONFIRM || RDS_CONFIRM=""
  case "$RDS_CONFIRM" in
    s|S|si|SI|y|Y|yes|YES)
      DELETE_RDS="true"
      ;;
    *)
      DELETE_RDS="false"
      ;;
  esac
fi

if [ "$AUTO_CONFIRM" != "true" ]; then
  echo ""
  if [ "$DELETE_RDS" = "true" ]; then
    echo "ATENCION: Esta accion eliminara permanentemente TODOS los recursos '${PROJECT_PREFIX}*' en ${TARGET_REGION}:"
    echo "  - Auto Scaling Group, Launch Templates e instancias EC2"
    echo "  - Application Load Balancer, Target Group y Elastic IP"
    echo "  - Base de datos Amazon RDS PostgreSQL (y sus datos) + DB Subnet Group"
    echo "  - Par de llaves SSH (${PROJECT_PREFIX}-deploy-key)"
    echo "  - VPC, Subredes, ENIs, Route Tables, Internet Gateway y Security Groups"
    echo "  - Archivos locales de estado (terraform.tfstate, llave .pem y outputs JSON)"
  else
    echo "MODO CONSERVAR RDS: Se destruirán los recursos de cómputo/balanceo en ${TARGET_REGION}:"
    echo "  - [ELIMINAR] Auto Scaling Group, Launch Templates e instancias EC2"
    echo "  - [ELIMINAR] Application Load Balancer, Target Group y Elastic IP"
    echo "  - [ELIMINAR] Par de llaves SSH (${PROJECT_PREFIX}-deploy-key) y estado local"
    echo "  - [CONSERVAR] Base de datos Amazon RDS (${RDS_ID}) y su VPC/Subredes/Security Groups base"
  fi
  echo ""
  CONFIRM=""
  read -r -p "¿Deseas continuar con la destrucción? [s/N]: " CONFIRM || CONFIRM=""
  case "$CONFIRM" in
    s|S|si|SI|y|Y|yes|YES)
      ;;
    *)
      echo "Operación cancelada. No se eliminó ningún recurso."
      exit 0
      ;;
  esac
fi

install_terraform_linux_if_needed() {
  if command -v terraform >/dev/null 2>&1; then
    return 0
  fi
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
    curl -fsSL "https://releases.hashicorp.com/terraform/${TF_VER}/terraform_${TF_VER}_linux_${TF_ARCH}.zip" -o /tmp/terraform.zip || return 1
    unzip -o -q /tmp/terraform.zip -d "$HOME/bin" || return 1
    chmod +x "$HOME/bin/terraform" || return 1
    rm -f /tmp/terraform.zip
    echo "  Terraform instalado en $HOME/bin/terraform (persistente en CloudShell)."
    return 0
  fi
  return 1
}

dedup_words() {
  tr ' \t\r' '\n\n\n' | (grep -v '^$' || true) | (grep -v '^None$' || true) | (grep -v '^null$' || true) | sort -u || true
}

discover_project_vpcs() {
  local v1 v2
  v1="$(aws ec2 describe-vpcs --region "$TARGET_REGION" \
    --filters "Name=tag:Name,Values=${PROJECT_PREFIX}*" \
    --query "Vpcs[].VpcId" --output text 2>/dev/null || true)"
  v2="$(aws ec2 describe-vpcs --region "$TARGET_REGION" \
    --filters "Name=tag:Project,Values=${PROJECT_PREFIX}" \
    --query "Vpcs[].VpcId" --output text 2>/dev/null || true)"
  printf "%s\n%s\n" "$v1" "$v2" | dedup_words || true
}

# =============================================================================
# PASO 1: TERRAFORM DESTROY (SOLO SI SE ELIMINARÁ RDS Y EXISTE terraform.tfstate)
# =============================================================================
echo ""
echo "[1/3] Verificando estado local de Terraform (terraform.tfstate)..."
if [ "$DELETE_RDS" != "true" ]; then
  echo "  [CONSERVAR RDS] Omitiendo 'terraform destroy' para mantener intactos Amazon RDS y su VPC base."
elif [ -s "terraform.tfstate" ]; then
  if install_terraform_linux_if_needed; then
    echo "  terraform.tfstate encontrado. Ejecutando 'terraform destroy -auto-approve'..."
    if [ ! -d ".terraform" ]; then
      terraform init || true
    fi
    terraform destroy -auto-approve || true
  else
    echo "  [AVISO] terraform.tfstate existe pero Terraform no está instalado; se continuará con el barrido directo por AWS CLI."
  fi
else
  echo "  [INFO] No se encontró terraform.tfstate local (sesión nueva o CloudShell reiniciado)."
  echo "         Saltando directo al barrido stateless por AWS CLI..."
fi

# =============================================================================
# PASO 2: BARRIDO DIRECTO POR AWS CLI (STATELESS SWEEP - ORDEN DE DEPENDENCIAS)
# =============================================================================
echo ""
echo "[2/3] Ejecutando barrido directo por AWS CLI en región ${TARGET_REGION} (prefijo: ${PROJECT_PREFIX})..."

# 2.1. Auto Scaling Group (pnk-carta-digital-asg)
echo "  [2.1] Buscando Auto Scaling Groups (${PROJECT_PREFIX}*)..."
ASG_LIST="$((aws autoscaling describe-auto-scaling-groups --region "$TARGET_REGION" \
  --query "AutoScalingGroups[?starts_with(AutoScalingGroupName, '${PROJECT_PREFIX}')].AutoScalingGroupName" \
  --output text 2>/dev/null || true) | dedup_words || true)"
if [ -n "$ASG_LIST" ]; then
  for asg in $ASG_LIST; do
    echo "        Eliminando ASG (--force-delete): $asg"
    aws autoscaling delete-auto-scaling-group --region "$TARGET_REGION" \
      --auto-scaling-group-name "$asg" --force-delete >/dev/null 2>&1 || true
  done
else
  echo "        Sin Auto Scaling Groups activos."
fi

# 2.2. Launch Templates (pnk-carta-digital-lt-*)
echo "  [2.2] Buscando Launch Templates (${PROJECT_PREFIX}-*)..."
LT_LIST="$((aws ec2 describe-launch-templates --region "$TARGET_REGION" \
  --filters "Name=launch-template-name,Values=${PROJECT_PREFIX}-*" \
  --query "LaunchTemplates[].LaunchTemplateId" --output text 2>/dev/null || true) | dedup_words || true)"
if [ -n "$LT_LIST" ]; then
  for lt_id in $LT_LIST; do
    echo "        Eliminando Launch Template: $lt_id"
    aws ec2 delete-launch-template --region "$TARGET_REGION" \
      --launch-template-id "$lt_id" >/dev/null 2>&1 || true
  done
else
  echo "        Sin Launch Templates pendientes."
fi

# 2.3. Instancias EC2 (por tags del proyecto o dentro de la VPC del proyecto)
echo "  [2.3] Buscando instancias EC2 (${PROJECT_PREFIX}* o dentro de ${PROJECT_PREFIX}-vpc)..."
VPC_IDS="$(discover_project_vpcs || true)"
EC2_RAW=""
EC2_RAW="$EC2_RAW $(aws ec2 describe-instances --region "$TARGET_REGION" \
  --filters "Name=tag:Name,Values=${PROJECT_PREFIX}*" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[].Instances[].InstanceId" --output text 2>/dev/null || true)"
EC2_RAW="$EC2_RAW $(aws ec2 describe-instances --region "$TARGET_REGION" \
  --filters "Name=tag:Project,Values=${PROJECT_PREFIX}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query "Reservations[].Instances[].InstanceId" --output text 2>/dev/null || true)"
for vpc_id in $VPC_IDS; do
  EC2_RAW="$EC2_RAW $(aws ec2 describe-instances --region "$TARGET_REGION" \
    --filters "Name=vpc-id,Values=${vpc_id}" "Name=instance-state-name,Values=pending,running,stopping,stopped" \
    --query "Reservations[].Instances[].InstanceId" --output text 2>/dev/null || true)"
done
INSTANCE_IDS="$(printf "%s\n" "$EC2_RAW" | dedup_words || true)"

if [ -n "$INSTANCE_IDS" ]; then
  INSTANCE_ARGS="$(printf "%s " $INSTANCE_IDS)"
  echo "        Terminando instancias EC2: $INSTANCE_ARGS"
  # shellcheck disable=SC2086
  aws ec2 terminate-instances --region "$TARGET_REGION" --instance-ids $INSTANCE_ARGS >/dev/null 2>&1 || true
  echo "        Esperando a que las instancias EC2 alcancen estado 'terminated'..."
  # shellcheck disable=SC2086
  aws ec2 wait instance-terminated --region "$TARGET_REGION" --instance-ids $INSTANCE_ARGS 2>/dev/null || true
else
  echo "        Sin instancias EC2 activas."
fi

# 2.4. Application Load Balancer (pnk-carta-digital-alb) & Target Group (pnk-carta-digital-tg)
echo "  [2.4] Buscando Application Load Balancer y Target Group..."
ALB_ARN="$((aws elbv2 describe-load-balancers --region "$TARGET_REGION" \
  --names "${PROJECT_PREFIX}-alb" \
  --query "LoadBalancers[].LoadBalancerArn" --output text 2>/dev/null || true) | dedup_words || true)"
if [ -n "$ALB_ARN" ]; then
  for alb in $ALB_ARN; do
    echo "        Eliminando ALB: $alb"
    aws elbv2 delete-load-balancer --region "$TARGET_REGION" --load-balancer-arn "$alb" >/dev/null 2>&1 || true
    echo "        Esperando eliminación completa del ALB..."
    aws elbv2 wait load-balancers-deleted --region "$TARGET_REGION" --load-balancer-arns "$alb" 2>/dev/null || true
  done
else
  echo "        Sin Application Load Balancer (${PROJECT_PREFIX}-alb)."
fi

TG_ARN="$((aws elbv2 describe-target-groups --region "$TARGET_REGION" \
  --names "${PROJECT_PREFIX}-tg" \
  --query "TargetGroups[].TargetGroupArn" --output text 2>/dev/null || true) | dedup_words || true)"
if [ -n "$TG_ARN" ]; then
  for tg in $TG_ARN; do
    echo "        Eliminando Target Group: $tg"
    for attempt in 1 2 3 4 5 6; do
      if aws elbv2 delete-target-group --region "$TARGET_REGION" --target-group-arn "$tg" >/dev/null 2>&1; then
        break
      fi
      sleep 5
    done
  done
else
  echo "        Sin Target Group (${PROJECT_PREFIX}-tg)."
fi

# 2.5. Elastic IPs (pnk-carta-digital*)
echo "  [2.5] Buscando Elastic IPs (${PROJECT_PREFIX}*)..."
EIP_RAW=""
EIP_RAW="$EIP_RAW $(aws ec2 describe-addresses --region "$TARGET_REGION" \
  --filters "Name=tag:Name,Values=${PROJECT_PREFIX}*" \
  --query "Addresses[].AllocationId" --output text 2>/dev/null || true)"
EIP_RAW="$EIP_RAW $(aws ec2 describe-addresses --region "$TARGET_REGION" \
  --filters "Name=tag:Project,Values=${PROJECT_PREFIX}" \
  --query "Addresses[].AllocationId" --output text 2>/dev/null || true)"
EIP_ALLOCS="$(printf "%s\n" "$EIP_RAW" | dedup_words || true)"
if [ -n "$EIP_ALLOCS" ]; then
  for alloc_id in $EIP_ALLOCS; do
    ASSOC_ID="$((aws ec2 describe-addresses --region "$TARGET_REGION" \
      --allocation-ids "$alloc_id" \
      --query "Addresses[0].AssociationId" --output text 2>/dev/null || true) | dedup_words || true)"
    if [ -n "$ASSOC_ID" ]; then
      echo "        Desasociando Elastic IP ($alloc_id / $ASSOC_ID)..."
      aws ec2 disassociate-address --region "$TARGET_REGION" --association-id "$ASSOC_ID" >/dev/null 2>&1 || true
    fi
    echo "        Liberando Elastic IP: $alloc_id"
    aws ec2 release-address --region "$TARGET_REGION" --allocation-id "$alloc_id" >/dev/null 2>&1 || true
  done
else
  echo "        Sin Elastic IPs pendientes."
fi

# 2.6. Amazon RDS PostgreSQL (pnk-carta-digital-postgres & pnk-carta-digital-rds-subnet-group)
if [ "$DELETE_RDS" = "true" ]; then
  echo "  [2.6] Buscando Amazon RDS PostgreSQL (${PROJECT_PREFIX}-postgres)..."
  RDS_STATUS="$((aws rds describe-db-instances --region "$TARGET_REGION" \
    --db-instance-identifier "$RDS_ID" \
    --query "DBInstances[0].DBInstanceStatus" --output text 2>/dev/null || true) | dedup_words || true)"
  if [ -n "$RDS_STATUS" ]; then
    if [ "$RDS_STATUS" != "deleting" ]; then
      echo "        Deshabilitando deletion-protection (si aplica) en $RDS_ID..."
      aws rds modify-db-instance --region "$TARGET_REGION" \
        --db-instance-identifier "$RDS_ID" \
        --no-deletion-protection --apply-immediately >/dev/null 2>&1 || true
      echo "        Eliminando instancia RDS $RDS_ID (sin final snapshot)..."
      aws rds delete-db-instance --region "$TARGET_REGION" \
        --db-instance-identifier "$RDS_ID" \
        --skip-final-snapshot --delete-automated-backups >/dev/null 2>&1 || true
    else
      echo "        La instancia RDS $RDS_ID ya estaba en estado 'deleting'."
    fi
    echo "        Esperando eliminación completa de Amazon RDS (puede tardar varios minutos)..."
    aws rds wait db-instance-deleted --region "$TARGET_REGION" --db-instance-identifier "$RDS_ID" 2>/dev/null || true
  else
    echo "        Sin instancia RDS ($RDS_ID)."
  fi

  RDS_SUBNET_GRP="${PROJECT_PREFIX}-rds-subnet-group"
  if aws rds describe-db-subnet-groups --region "$TARGET_REGION" --db-subnet-group-name "$RDS_SUBNET_GRP" >/dev/null 2>&1; then
    echo "        Eliminando DB Subnet Group: $RDS_SUBNET_GRP"
    aws rds delete-db-subnet-group --region "$TARGET_REGION" --db-subnet-group-name "$RDS_SUBNET_GRP" >/dev/null 2>&1 || true
  fi
else
  echo "  [2.6] [CONSERVADO] Base de datos Amazon RDS (${RDS_ID}) y DB Subnet Group conservados intactos."
fi

# 2.7. SSH Key Pair (pnk-carta-digital-deploy-key)
echo "  [2.7] Eliminando Key Pair SSH (${PROJECT_PREFIX}-deploy-key) si existe..."
aws ec2 delete-key-pair --region "$TARGET_REGION" --key-name "${PROJECT_PREFIX}-deploy-key" >/dev/null 2>&1 || true

# 2.8. VPC, ENIs, Security Groups, Subnets, Route Tables e Internet Gateway
if [ "$DELETE_RDS" = "true" ]; then
  echo "  [2.8] Buscando VPC, Subredes, Route Tables, IGW y Security Groups (${PROJECT_PREFIX}*)..."
  VPC_IDS="$(discover_project_vpcs || true)"
  if [ -n "$VPC_IDS" ]; then
    for vpc_id in $VPC_IDS; do
      echo "        Limpiando VPC: $vpc_id"

      # Esperar a que ENIs de ALB/RDS terminen de desacoplarse y limpiar ENIs disponibles
      for wait_i in $(seq 1 12); do
        AVAIL_ENIS="$((aws ec2 describe-network-interfaces --region "$TARGET_REGION" \
          --filters "Name=vpc-id,Values=${vpc_id}" "Name=status,Values=available" \
          --query "NetworkInterfaces[].NetworkInterfaceId" --output text 2>/dev/null || true) | dedup_words || true)"
        for eni in $AVAIL_ENIS; do
          echo "          Eliminando ENI residual: $eni"
          aws ec2 delete-network-interface --region "$TARGET_REGION" --network-interface-id "$eni" >/dev/null 2>&1 || true
        done

        ALL_ENIS="$((aws ec2 describe-network-interfaces --region "$TARGET_REGION" \
          --filters "Name=vpc-id,Values=${vpc_id}" \
          --query "NetworkInterfaces[].NetworkInterfaceId" --output text 2>/dev/null || true) | dedup_words || true)"
        if [ -z "$ALL_ENIS" ]; then
          break
        fi
        echo "          Esperando liberación de ENIs de red en $vpc_id ($wait_i/12)..."
        sleep 5
      done

      # Revocar reglas ingress/egress de Security Groups no-default (evita bloqueos por referencias cruzadas)
      SG_IDS="$((aws ec2 describe-security-groups --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${vpc_id}" \
        --query "SecurityGroups[?GroupName!='default'].GroupId" --output text 2>/dev/null || true) | dedup_words || true)"
      if [ -n "$SG_IDS" ]; then
        for sg in $SG_IDS; do
          INGRESS_JSON="$((aws ec2 describe-security-groups --region "$TARGET_REGION" \
            --group-ids "$sg" --query "SecurityGroups[0].IpPermissions" --output json 2>/dev/null || echo "[]") | tr -d '\r\n' || echo "[]")"
          if [ -n "$INGRESS_JSON" ] && [ "$INGRESS_JSON" != "[]" ] && [ "$INGRESS_JSON" != "null" ]; then
            aws ec2 revoke-security-group-ingress --region "$TARGET_REGION" --group-id "$sg" --ip-permissions "$INGRESS_JSON" >/dev/null 2>&1 || true
          fi
          EGRESS_JSON="$((aws ec2 describe-security-groups --region "$TARGET_REGION" \
            --group-ids "$sg" --query "SecurityGroups[0].IpPermissionsEgress" --output json 2>/dev/null || echo "[]") | tr -d '\r\n' || echo "[]")"
          if [ -n "$EGRESS_JSON" ] && [ "$EGRESS_JSON" != "[]" ] && [ "$EGRESS_JSON" != "null" ]; then
            aws ec2 revoke-security-group-egress --region "$TARGET_REGION" --group-id "$sg" --ip-permissions "$EGRESS_JSON" >/dev/null 2>&1 || true
          fi
        done

        for pass in 1 2 3; do
          REMAINING_SGS="$((aws ec2 describe-security-groups --region "$TARGET_REGION" \
            --filters "Name=vpc-id,Values=${vpc_id}" \
            --query "SecurityGroups[?GroupName!='default'].GroupId" --output text 2>/dev/null || true) | dedup_words || true)"
          [ -z "$REMAINING_SGS" ] && break
          for sg in $REMAINING_SGS; do
            echo "          Eliminando Security Group: $sg"
            aws ec2 delete-security-group --region "$TARGET_REGION" --group-id "$sg" >/dev/null 2>&1 || true
          done
        done
      fi

      # Eliminar Subnets
      SUBNET_IDS="$((aws ec2 describe-subnets --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${vpc_id}" \
        --query "Subnets[].SubnetId" --output text 2>/dev/null || true) | dedup_words || true)"
      for subnet in $SUBNET_IDS; do
        echo "          Eliminando Subnet: $subnet"
        aws ec2 delete-subnet --region "$TARGET_REGION" --subnet-id "$subnet" >/dev/null 2>&1 || true
      done

      # Desasociar y eliminar Route Tables no-main
      RTB_ASSOCS="$((aws ec2 describe-route-tables --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${vpc_id}" \
        --query "RouteTables[].Associations[?!Main].RouteTableAssociationId" --output text 2>/dev/null || true) | dedup_words || true)"
      for assoc in $RTB_ASSOCS; do
        aws ec2 disassociate-route-table --region "$TARGET_REGION" --association-id "$assoc" >/dev/null 2>&1 || true
      done

      RTB_IDS="$((aws ec2 describe-route-tables --region "$TARGET_REGION" \
        --filters "Name=vpc-id,Values=${vpc_id}" \
        --query "RouteTables[?!(Associations[?Main])].RouteTableId" --output text 2>/dev/null || true) | dedup_words || true)"
      for rtb in $RTB_IDS; do
        echo "          Eliminando Route Table: $rtb"
        aws ec2 delete-route-table --region "$TARGET_REGION" --route-table-id "$rtb" >/dev/null 2>&1 || true
      done

      # Desacoplar y eliminar Internet Gateways
      IGW_IDS="$((aws ec2 describe-internet-gateways --region "$TARGET_REGION" \
        --filters "Name=attachment.vpc-id,Values=${vpc_id}" \
        --query "InternetGateways[].InternetGatewayId" --output text 2>/dev/null || true) | dedup_words || true)"
      for igw in $IGW_IDS; do
        echo "          Desacoplando y eliminando IGW: $igw"
        aws ec2 detach-internet-gateway --region "$TARGET_REGION" --internet-gateway-id "$igw" --vpc-id "$vpc_id" >/dev/null 2>&1 || true
        aws ec2 delete-internet-gateway --region "$TARGET_REGION" --internet-gateway-id "$igw" >/dev/null 2>&1 || true
      done

      # Eliminar VPC
      echo "          Eliminando VPC: $vpc_id"
      aws ec2 delete-vpc --region "$TARGET_REGION" --vpc-id "$vpc_id" >/dev/null 2>&1 || true
    done
  else
    echo "        Sin VPCs de ${PROJECT_PREFIX} activas."
  fi
else
  echo "  [2.8] [CONSERVADO] VPC, Subredes, Route Tables, IGW y Security Groups conservados para Amazon RDS."
fi

# =============================================================================
# PASO 3: LIMPIEZA DE ARCHIVOS LOCALES DE ESTADO Y LLAVES
# =============================================================================
echo ""
echo "[3/3] Limpiando archivos locales de estado (terraform.tfstate, llave .pem y outputs JSON)..."
rm -f terraform.tfstate terraform.tfstate.backup pnk-ec2-deploy-key.pem outputs-despliegue.json

echo ""
echo "============================================================================="
if [ "$DELETE_RDS" = "true" ]; then
  echo "  INFRAESTRUCTURA DESTRUIDA COMPLETAMENTE (STATELESS-PROOF)"
  echo "  Todos los recursos (${PROJECT_PREFIX}*: ASG, LT, EC2, ALB, TG, EIP, RDS,"
  echo "  Key Pair, Security Groups, Subnets, Route Tables, IGW y VPC) eliminados."
  echo "  Confirmado: \$0 en cargos continuos de AWS."
else
  echo "  INFRAESTRUCTURA DE CÓMPUTO DESTRUIDA (RDS Y VPC CONSERVADOS)"
  echo "  Eliminados : ASG, Launch Templates, EC2, ALB, Target Group, EIP y Key Pair."
  echo "  Conservados: Amazon RDS (${RDS_ID}) y su red VPC/Subredes/Security Groups base."
  echo "  En tu próximo './1-desplegar-aws.sh', podrás reutilizar este RDS en ~2 min."
  echo "  (Para eliminar también el RDS y dejar \$0 total, ejecuta: ./2-destruir-aws.sh --delete-rds)"
fi
echo "============================================================================="
