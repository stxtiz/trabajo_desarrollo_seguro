# =============================================================================
# SCRIPT 2: DESTRUCCIÓN TOTAL DE INFRAESTRUCTURA AWS (CERO COBROS PENDIENTES)
# Proyecto: Carta Digital PNK Security
# Uso: .\2-destruir-aws.ps1          (pide confirmación interactiva)
#      .\2-destruir-aws.ps1 -Force   (sin confirmación interactiva)
# =============================================================================
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=============================================================================" -ForegroundColor Yellow
Write-Host "  PNK Security - Script 2: Destruir Infraestructura AWS (Teardown)" -ForegroundColor Yellow
Write-Host "=============================================================================" -ForegroundColor Yellow

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] AWS CLI ('aws') no esta instalado." -ForegroundColor Red
    exit 1
}

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Terraform ('terraform') no esta instalado." -ForegroundColor Red
    exit 1
}

$null = aws sts get-caller-identity 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] No hay credenciales activas de AWS configuradas. Ejecuta 'aws configure'." -ForegroundColor Red
    exit 1
}

if (-not $Force) {
    Write-Host ""
    Write-Host "ATENCION: Esta accion eliminara permanentemente TODOS los recursos creados:" -ForegroundColor Red
    Write-Host "  - VPC, Subredes, IGW y Security Groups"
    Write-Host "  - Instancia EC2 Primaria, Elastic IP, ALB y Auto Scaling Group"
    Write-Host "  - Base de datos Amazon RDS PostgreSQL (y sus datos)"
    Write-Host "  - Par de llaves SSH en AWS"
    Write-Host ""
    $confirm = Read-Host "¿Deseas continuar y destruir toda la infraestructura? [s/N]"
    if ($confirm -notin @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
        Write-Host "Operacion cancelada. No se elimino ningun recurso."
        exit 0
    }
}

Write-Host ""
Write-Host "[1/2] Ejecutando 'terraform destroy -auto-approve'..."
if (-not (Test-Path ".terraform")) {
    terraform init
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
terraform destroy -auto-approve
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "[2/2] Limpiando archivos locales generados (llave .pem y outputs JSON)..."
Remove-Item -Path "pnk-ec2-deploy-key.pem", "outputs-despliegue.json" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host "  INFRAESTRUCTURA DESTRUIDA COMPLETAMENTE" -ForegroundColor Green
Write-Host "  Todos los recursos (VPC, EC2, EIP, ALB, ASG, RDS) fueron eliminados." -ForegroundColor Green
Write-Host "  Confirmado: `$0 en cargos continuos de AWS." -ForegroundColor Green
Write-Host "=============================================================================" -ForegroundColor Green
