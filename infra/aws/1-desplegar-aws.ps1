# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO DESDE CERO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# Uso: .\1-desplegar-aws.ps1          (pide confirmacion si hay recursos huerfanos)
#      .\1-desplegar-aws.ps1 -Force   (limpia huerfanos sin terraform.tfstate automaticamente)
# =============================================================================
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$ProjectPrefix = "pnk-carta-digital"
$TargetRegion = if (-not [string]::IsNullOrWhiteSpace($env:AWS_REGION)) {
    $env:AWS_REGION
} elseif (-not [string]::IsNullOrWhiteSpace($env:AWS_DEFAULT_REGION)) {
    $env:AWS_DEFAULT_REGION
} else {
    "us-east-1"
}

function Invoke-AwsCheck {
    param([string[]]$AwsArgs)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & aws @AwsArgs 2>$null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
    if ($code -ne 0) { return "" }
    $txt = ($out | Out-String).Trim()
    if ($txt -eq "None" -or $txt -eq "null") { return "" }
    return $txt
}

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

# 2b. Verificar si existen recursos huerfanos en AWS sin terraform.tfstate local
$hasLocalState = (Test-Path "terraform.tfstate") -and ((Get-Item "terraform.tfstate").Length -gt 0) -and (Select-String -Path "terraform.tfstate" -Pattern '"type":' -Quiet)
if (-not $hasLocalState) {
    $orphans = @()
    $existingVpc = Invoke-AwsCheck -AwsArgs @("ec2", "describe-vpcs", "--region", $TargetRegion, "--filters", "Name=tag:Name,Values=$ProjectPrefix-vpc", "--query", "Vpcs[0].VpcId", "--output", "text")
    if ($existingVpc) { $orphans += "VPC($existingVpc)" }

    $existingKey = Invoke-AwsCheck -AwsArgs @("ec2", "describe-key-pairs", "--region", $TargetRegion, "--key-names", "$ProjectPrefix-deploy-key", "--query", "KeyPairs[0].KeyName", "--output", "text")
    if ($existingKey) { $orphans += "KeyPair($existingKey)" }

    $existingRds = Invoke-AwsCheck -AwsArgs @("rds", "describe-db-instances", "--region", $TargetRegion, "--db-instance-identifier", "$ProjectPrefix-postgres", "--query", "DBInstances[0].DBInstanceIdentifier", "--output", "text")
    if ($existingRds) { $orphans += "RDS($existingRds)" }

    $existingAlb = Invoke-AwsCheck -AwsArgs @("elbv2", "describe-load-balancers", "--region", $TargetRegion, "--names", "$ProjectPrefix-alb", "--query", "LoadBalancers[0].LoadBalancerName", "--output", "text")
    if ($existingAlb) { $orphans += "ALB($existingAlb)" }

    $existingAsg = Invoke-AwsCheck -AwsArgs @("autoscaling", "describe-auto-scaling-groups", "--region", $TargetRegion, "--auto-scaling-group-names", "$ProjectPrefix-asg", "--query", "AutoScalingGroups[0].AutoScalingGroupName", "--output", "text")
    if ($existingAsg) { $orphans += "ASG($existingAsg)" }

    if ($orphans.Count -gt 0) {
        Write-Host ""
        Write-Host "[AVISO] No hay 'terraform.tfstate' local, pero ya existen recursos previos en AWS ($TargetRegion):" -ForegroundColor Yellow
        Write-Host "        $($orphans -join ', ')" -ForegroundColor Yellow
        Write-Host "        (Esto ocurre si se perdio la sesion anterior o se clono el repo en otra carpeta.)"
        Write-Host "        Terraform fallara con errores de recursos duplicados si no se limpian primero."
        if ($Force) {
            Write-Host "  Limpiando automaticamente recursos huerfanos con .\2-destruir-aws.ps1 -Force..." -ForegroundColor Cyan
            & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        } else {
            $cleanConfirm = Read-Host "¿Deseas ejecutar '.\2-destruir-aws.ps1 -Force' ahora para limpiar los recursos previos y continuar? [s/N]"
            if ($cleanConfirm -in @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
                & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force
                if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            } else {
                Write-Host "Despliegue cancelado. Ejecuta '.\2-destruir-aws.ps1' manualmente antes de volver a desplegar."
                exit 1
            }
        }
    }
}

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
