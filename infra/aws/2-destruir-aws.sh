#!/usr/bin/env bash
# =============================================================================
# SCRIPT 2: DESTRUCCIÓN TOTAL DE INFRAESTRUCTURA AWS (CERO COBROS PENDIENTES)
# Proyecto: Carta Digital PNK Security
# Uso: ./2-destruir-aws.sh        (pide confirmación interactiva)
#      ./2-destruir-aws.sh -y     (sin confirmación interactiva)
# =============================================================================
set -euo pipefail

export PATH="$HOME/bin:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

AUTO_CONFIRM="false"
if [ "${1:-}" = "-y" ] || [ "${1:-}" = "--yes" ]; then
  AUTO_CONFIRM="true"
fi

echo "============================================================================="
echo "  PNK Security - Script 2: Destruir Infraestructura AWS (Teardown)"
echo "============================================================================="

if ! command -v aws >/dev/null 2>&1; then
  echo "[ERROR] AWS CLI ('aws') no esta instalado."
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

if [ "$AUTO_CONFIRM" != "true" ]; then
  echo ""
  echo "ATENCION: Esta accion eliminara permanentemente TODOS los recursos creados:"
  echo "  - VPC, Subredes, IGW y Security Groups"
  echo "  - Instancias EC2 del Auto Scaling Group, Elastic IP y Application Load Balancer"
  echo "  - Base de datos Amazon RDS PostgreSQL (y sus datos)"
  echo "  - Par de llaves SSH en AWS"
  echo ""
  read -r -p "¿Deseas continuar y destruir toda la infraestructura? [s/N]: " CONFIRM
  case "$CONFIRM" in
    s|S|si|SI|y|Y|yes|YES)
      ;;
    *)
      echo "Operación cancelada. No se eliminó ningún recurso."
      exit 0
      ;;
  esac
fi

echo ""
echo "[1/2] Ejecutando 'terraform destroy -auto-approve'..."
if [ ! -d ".terraform" ]; then
  terraform init
fi
terraform destroy -auto-approve

echo ""
echo "[2/2] Limpiando archivos locales generados (llave .pem y outputs JSON)..."
rm -f pnk-ec2-deploy-key.pem outputs-despliegue.json

echo ""
echo "============================================================================="
echo "  INFRAESTRUCTURA DESTRUIDA COMPLETAMENTE"
echo "  Todos los recursos (VPC, EC2, EIP, ALB, ASG, RDS) fueron eliminados."
echo "  Confirmado: \$0 en cargos continuos de AWS."
echo "============================================================================="
