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
    Write-Host "[ERROR] No hay credenciales activas de AWS configuradas o el token temporal expiro." -ForegroundColor Red
    Write-Host ""
    Write-Host "Si usas AWS Academy Learner Lab (LabStudent / LabRole):" -ForegroundColor Yellow
    Write-Host "  1. Verifica en el portal que el laboratorio este activo ('Start Lab' en verde)."
    Write-Host "  2. Haz clic en 'AWS Details' -> 'AWS CLI: Show' -> 'Copy'."
    Write-Host "  3. Pega el bloque [default] completo (aws_access_key_id, aws_secret_access_key y"
    Write-Host "     aws_session_token) en: $env:USERPROFILE\.aws\credentials"
    Write-Host "     Comando rapido en PowerShell:"
    Write-Host "       New-Item -ItemType Directory -Force -Path `$env:USERPROFILE\.aws | Out-Null; notepad `$env:USERPROFILE\.aws\credentials"
    Write-Host "     (IMPORTANTE: 'aws configure' NO pide aws_session_token; sin el falla con InvalidClientTokenId)."
    Write-Host "     (Si aparecio ExpiredToken tras ~4h, vuelve a copiar credenciales frescas desde AWS Details)."
    Write-Host "  4. Verifica que la region sea us-east-1 (requerida por Learner Lab):"
    Write-Host "       aws configure set region us-east-1"
    Write-Host "       `$env:AWS_DEFAULT_REGION = 'us-east-1'"
    Write-Host "  5. Alternativa sin copiar llaves: ejecuta ./1-desplegar-aws.sh desde AWS CloudShell (us-east-1)."
    Write-Host ""
    Write-Host "Si usas una cuenta AWS personal estandar: ejecuta 'aws configure' (region us-east-1)." -ForegroundColor Cyan
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

# 4. Detectar Instance Profile (AWS Academy LabInstanceProfile vs cuenta personal) y aplicar
Write-Host ""
Write-Host "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
Write-Host "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)" -ForegroundColor Yellow

$tfApplyArgs = @("apply", "-auto-approve")
if ($identity.Arn -match "voclabs|LabRole") {
    Write-Host "  Entorno AWS Academy detectado: usando iam_instance_profile=LabInstanceProfile." -ForegroundColor Gray
} else {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $null = aws iam get-instance-profile --instance-profile-name LabInstanceProfile 2>$null
    $iamCheckExit = $LASTEXITCODE
    $ErrorActionPreference = $prevEap

    if ($iamCheckExit -eq 0) {
        Write-Host "  Instance Profile 'LabInstanceProfile' encontrado." -ForegroundColor Gray
    } else {
        Write-Host "  Cuenta personal sin 'LabInstanceProfile': usando iam_instance_profile=`"`"." -ForegroundColor Gray
        $tfApplyArgs += "-var=iam_instance_profile="
    }
}

& terraform @tfApplyArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# Guardar outputs en JSON
$outputsJson = terraform output -json
$outputsJson | Set-Content -Path "outputs-despliegue.json" -Encoding UTF8

$EIP = (terraform output -raw elastic_ip).Trim()
$EIP_ALLOC_ID = (terraform output -raw elastic_ip_allocation_id).Trim()
$ASG_NAME = (terraform output -raw autoscaling_group_name).Trim()
$CF_ORIGIN_EIP = (terraform output -raw cloudflare_origin_url_eip).Trim()
$ALB_DNS = (terraform output -raw load_balancer_dns).Trim()
$CF_ORIGIN_ALB = (terraform output -raw cloudflare_origin_url_alb).Trim()
$RDS_ENDPOINT = (terraform output -raw rds_endpoint).Trim()
$SSH_KEY_PATH = "infra/aws/pnk-ec2-deploy-key.pem"
$SSH_CMD = "ssh -i $SSH_KEY_PATH ubuntu@$EIP"

# Asociar inmediatamente la Elastic IP a la primera instancia running del Auto Scaling Group
$prevEap = $ErrorActionPreference
$ErrorActionPreference = "Continue"
$ASG_INSTANCE_ID = (aws ec2 describe-instances `
    --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG_NAME" "Name=instance-state-name,Values=running" `
    --query "Reservations[0].Instances[0].InstanceId" `
    --output text 2>$null)
$describeExit = $LASTEXITCODE
$ErrorActionPreference = $prevEap

if ($describeExit -eq 0 -and -not [string]::IsNullOrWhiteSpace($ASG_INSTANCE_ID) -and $ASG_INSTANCE_ID.Trim() -ne "None") {
    $ASG_INSTANCE_ID = $ASG_INSTANCE_ID.Trim()
    Write-Host "  Asociando Elastic IP ($EIP / $EIP_ALLOC_ID) a instancia activa del ASG ($ASG_INSTANCE_ID)..." -ForegroundColor Cyan
    $null = aws ec2 associate-address --instance-id $ASG_INSTANCE_ID --allocation-id $EIP_ALLOC_ID --allow-reassociation
} else {
    $ASG_INSTANCE_ID = "pendiente"
    Write-Host "  Aviso: No se encontro aun una instancia 'running' en $ASG_NAME; user_data asociara la EIP al iniciar." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host "  DESPLIEGUE AWS COMPLETADO EXITOSAMENTE" -ForegroundColor Green
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  RESUMEN DE RECURSOS Y URLs:"
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  [PRINCIPAL] EC2_ORIGIN_URL (ALB): $CF_ORIGIN_ALB" -ForegroundColor Cyan
Write-Host "    -> DNS permanente del Load Balancer (NUNCA cambia aunque termines/reemplaces EC2)"
Write-Host "    -> Distribuye trafico con CERO downtime entre 2 instancias EC2 (2 AZs) del ASG ($ASG_NAME)"
Write-Host "  Load Balancer URL (/carta)      : http://$ALB_DNS/carta"
Write-Host "  Elastic IP fija (EIP, ASG)      : $EIP (instancia actual: $ASG_INSTANCE_ID)"
Write-Host "  [Alternativa] Origin via EIP    : $CF_ORIGIN_EIP"
Write-Host "  Amazon RDS Endpoint             : $RDS_ENDPOINT"
Write-Host "  Llave SSH Privada (.pem)        : $SSH_KEY_PATH"
Write-Host "  Comando SSH                     : $SSH_CMD"
Write-Host "  Archivo de Outputs JSON         : infra/aws/outputs-despliegue.json"
Write-Host ""
Write-Host "  VARIABLE PRINCIPAL PARA CLOUDFLARE WORKER (Settings -> Variables and Secrets):" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  EC2_ORIGIN_URL                  = $CF_ORIGIN_ALB" -ForegroundColor Green
Write-Host "  (IMPORTANTE: Con esta URL del ALB, JAMAS tendras que cambiar DNS ni reconfigurar"
Write-Host "   Cloudflare si terminas o reemplazas una instancia EC2 en Auto Scaling.)"
Write-Host "  (Alternativa secundaria EIP)    = $CF_ORIGIN_EIP"
Write-Host ""
Write-Host "  SECRETOS PARA GITHUB ACTIONS (Settings -> Secrets and variables -> Actions):" -ForegroundColor Cyan
Write-Host "  ---------------------------------------------------------------------------"
Write-Host "  AWS_EC2_HOST                    = $EIP"
Write-Host "  AWS_EC2_USER                    = ubuntu"
Write-Host "  AWS_EC2_SSH_KEY                 = <contenido completo de infra/aws/pnk-ec2-deploy-key.pem>"
Write-Host ""
Write-Host "  NOTA: Las EC2 tardan ~3-5 min adicionales en compilar Docker e iniciar." -ForegroundColor Yellow
Write-Host "  Verifica el estado con:"
Write-Host "    curl.exe -i http://$ALB_DNS/health"
Write-Host "    curl.exe -i http://$EIP/health"
Write-Host "=============================================================================" -ForegroundColor Green
