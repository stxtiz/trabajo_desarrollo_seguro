# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO DESDE CERO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# =============================================================================
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=============================================================================" -ForegroundColor Cyan
Write-Host "  PNK Security - Script 1: Despliegue Completo de Infraestructura AWS" -ForegroundColor Cyan
Write-Host "=============================================================================" -ForegroundColor Cyan

# 1. Verificar herramientas requeridas
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] AWS CLI ('aws') no esta instalado." -ForegroundColor Red
    Write-Host "Instalalo desde: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html"
    exit 1
}

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Terraform ('terraform') no esta instalado." -ForegroundColor Red
    Write-Host "Instalalo desde: https://developer.hashicorp.com/terraform/install"
    exit 1
}

# 2. Verificar sesion activa en AWS CLI
Write-Host "[1/4] Verificando credenciales activas de AWS CLI..."
$identityJson = aws sts get-caller-identity 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] No hay credenciales activas de AWS configuradas." -ForegroundColor Red
    Write-Host "Ejecuta 'aws configure' e ingresa:"
    Write-Host "  - AWS Access Key ID:     <tu Access Key de IAM>"
    Write-Host "  - AWS Secret Access Key: <tu Secret Key de IAM>"
    Write-Host "  - Default region name:   us-east-1"
    Write-Host "  - Default output format: json"
    exit 1
}
$identity = $identityJson | ConvertFrom-Json
Write-Host "  Cuenta AWS verificada: $($identity.Account) ($($identity.Arn))" -ForegroundColor Green

# 3. Inicializar y validar Terraform
Write-Host ""
Write-Host "[2/4] Inicializando proveedores de Terraform..."
terraform init
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "[3/4] Validando configuracion de Terraform..."
terraform validate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# 4. Aplicar infraestructura
Write-Host ""
Write-Host "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EC2, EIP, ALB y ASG..."
Write-Host "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)" -ForegroundColor Yellow
terraform apply -auto-approve
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Guardar outputs en JSON
$outputsJson = terraform output -json
$outputsJson | Set-Content -Path "outputs-despliegue.json" -Encoding UTF8

$EIP = (terraform output -raw elastic_ip).Trim()
$CF_ORIGIN_EIP = (terraform output -raw cloudflare_origin_url_eip).Trim()
$ALB_DNS = (terraform output -raw load_balancer_dns).Trim()
$CF_ORIGIN_ALB = (terraform output -raw cloudflare_origin_url_alb).Trim()
$RDS_ENDPOINT = (terraform output -raw rds_endpoint).Trim()
$SSH_KEY_PATH = "infra/aws/pnk-ec2-deploy-key.pem"
$SSH_CMD = "ssh -i $SSH_KEY_PATH ubuntu@$EIP"

Write-Host ""
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host "  DESPLIEGUE AWS COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  RESUMEN DE RECURSOS Y URLs:"
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  Elastic IP (EIP)             : $EIP"
Write-Host "  EC2_ORIGIN_URL (via EIP)     : $CF_ORIGIN_EIP"
Write-Host "  EC2_ORIGIN_URL (via ALB)     : $CF_ORIGIN_ALB"
Write-Host "  Load Balancer URL (/carta)   : http://$ALB_DNS/carta"
Write-Host "  Amazon RDS Endpoint          : $RDS_ENDPOINT"
Write-Host "  Llave SSH Privada (.pem)     : $SSH_KEY_PATH"
Write-Host "  Comando SSH                  : $SSH_CMD"
Write-Host "  Archivo de Outputs JSON      : infra/aws/outputs-despliegue.json"
Write-Host ""
Write-Host "  VARIABLES PARA CLOUDFLARE WORKER (Workers & Pages -> Settings -> Variables):" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  EC2_ORIGIN_URL               = $CF_ORIGIN_ALB"
Write-Host "  (Alternativa directa EIP)    = $CF_ORIGIN_EIP"
Write-Host ""
Write-Host "  SECRETOS PARA GITHUB ACTIONS (Settings -> Secrets and variables -> Actions):" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  AWS_EC2_HOST                 = $EIP"
Write-Host "  AWS_EC2_USER                 = ubuntu"
Write-Host "  AWS_EC2_SSH_KEY              = <contenido completo de infra/aws/pnk-ec2-deploy-key.pem>"
Write-Host ""
Write-Host "  NOTA: La EC2 tarda ~3-5 min adicionales en compilar Docker e iniciar." -ForegroundColor Yellow
Write-Host "  Verifica el estado con:"
Write-Host "    curl.exe -i http://$EIP/health"
Write-Host "    curl.exe -i http://$ALB_DNS/health"
Write-Host "=============================================================================" -ForegroundColor Green
