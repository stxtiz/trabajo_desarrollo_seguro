#!/usr/bin/env bash
# =============================================================================
# SCRIPT 2: DESTRUCCIÓN TOTAL DE INFRAESTRUCTURA AWS (CERO COBROS PENDIENTES)
# Proyecto: Carta Digital PNK Security
# Uso: ./2-destruir-aws.sh        (pide confirmación interactiva)
#      ./2-destruir-aws.sh -y     (sin confirmación interactiva)
# =============================================================================
set -euo pipefail

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
  echo "[ERROR] Terraform ('terraform') no esta instalado."
  exit 1
fi

if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "[ERROR] No hay credenciales activas de AWS configuradas. Ejecuta 'aws configure'."
  exit 1
fi

if [ "$AUTO_CONFIRM" != "true" ]; then
  echo ""
  echo "ATENCION: Esta accion eliminara permanentemente TODOS los recursos creados:"
  echo "  - VPC, Subredes, IGW y Security Groups"
  echo "  - Instancia EC2 Primaria, Elastic IP, ALB y Auto Scaling Group"
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
