# =============================================================================
# SCRIPT 1: DESPLIEGUE COMPLETO EN AWS (TERRAFORM + AWS CLI)
# Proyecto: Carta Digital PNK Security (OWASP ASVS v5.0 Nivel 3)
# Uso: .\1-desplegar-aws.ps1               (interactivo: pregunta por RDS)
#      .\1-desplegar-aws.ps1 -Force        (no interactivo; reutiliza RDS si existe)
#      .\1-desplegar-aws.ps1 -KeepRds      (conserva y reutiliza RDS existente)
#      .\1-desplegar-aws.ps1 -DeleteRds    (elimina RDS existente y recrea desde cero)
#      .\1-desplegar-aws.ps1 -WithoutRds   (despliega sin RDS, con PostgreSQL local en Docker)
# =============================================================================
param(
    [switch]$Force,
    [switch]$KeepRds,
    [switch]$DeleteRds,
    [switch]$WithRds,
    [switch]$WithoutRds
)

if ($KeepRds -and $DeleteRds) {
    Write-Host "[ERROR] No puedes usar -KeepRds y -DeleteRds al mismo tiempo." -ForegroundColor Red
    exit 1
}
if ($WithRds -and $WithoutRds) {
    Write-Host "[ERROR] No puedes usar -WithRds y -WithoutRds al mismo tiempo." -ForegroundColor Red
    exit 1
}

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
    $hasNativePref = Test-Path variable:PSNativeCommandUseErrorActionPreference
    $prevNativePref = if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference } else { $false }
    $ErrorActionPreference = "Continue"
    if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $false }
    try {
        $out = & aws @AwsArgs 2>$null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
        if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $prevNativePref }
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
$prevEap = $ErrorActionPreference
$hasNativePref = Test-Path variable:PSNativeCommandUseErrorActionPreference
$prevNativePref = if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference } else { $false }
$ErrorActionPreference = "Continue"
if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $false }
try {
    $identityJson = aws sts get-caller-identity 2>$null
    $identityExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $prevEap
    if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $prevNativePref }
}
if ($identityExit -ne 0) {
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

# 2b. Verificar estado de Amazon RDS y recursos previos en AWS
$hasLocalState = (Test-Path "terraform.tfstate") -and ((Get-Item "terraform.tfstate").Length -gt 0) -and (Select-String -Path "terraform.tfstate" -Pattern '"type":' -Quiet)

$rdsId = "$ProjectPrefix-postgres"
$existingRdsStatus = Invoke-AwsCheck -AwsArgs @("rds", "describe-db-instances", "--region", $TargetRegion, "--db-instance-identifier", $rdsId, "--query", "DBInstances[0].DBInstanceStatus", "--output", "text")
$existingVpc = Invoke-AwsCheck -AwsArgs @("ec2", "describe-vpcs", "--region", $TargetRegion, "--filters", "Name=tag:Name,Values=$ProjectPrefix-vpc", "Name=state,Values=available", "--query", "Vpcs[0].VpcId", "--output", "text")

$createRds = $true
$reuseExistingRds = $false
$reuseDbPass = ""

function New-RdsSyncPassword {
    $bytes = New-Object byte[] 16
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return (-join ($bytes | ForEach-Object { $_.ToString("x2") }))
}

if ($existingRdsStatus -eq "deleting") {
    Write-Host ""
    Write-Host "[AVISO] La instancia Amazon RDS '$rdsId' esta actualmente en estado 'deleting'." -ForegroundColor Yellow
    Write-Host "        Esperando a que finalice su eliminacion para continuar..."
    $null = Invoke-AwsCheck -AwsArgs @("rds", "wait", "db-instance-deleted", "--region", $TargetRegion, "--db-instance-identifier", $rdsId)
    $existingRdsStatus = ""
}

if (-not [string]::IsNullOrWhiteSpace($existingRdsStatus)) {
    Write-Host ""
    Write-Host "[RDS DETECTADO] Se encontro una instancia Amazon RDS existente: $rdsId (estado: $existingRdsStatus)." -ForegroundColor Cyan

    $rdsAction = ""
    if ($KeepRds) {
        $rdsAction = "keep"
    } elseif ($DeleteRds) {
        $rdsAction = "delete"
    } elseif ($Force) {
        $rdsAction = "keep"
        Write-Host "  Modo automatico (-Force): conservando y reutilizando RDS existente ($rdsId)." -ForegroundColor Green
    } else {
        Write-Host "¿Deseas ELIMINAR el RDS existente para recrearlo desde cero, o CONSERVARLO para reutilizarlo?" -ForegroundColor Yellow
        Write-Host "  - 'N' (Por defecto - Recomendado): Conserva el RDS actual (mantiene tus datos) y su VPC,"
        Write-Host "    limpia solo EC2/ALB/ASG previos y levanta todo rapido (~2-3 min)."
        Write-Host "  - 's': Elimina el RDS actual y recrea toda la infraestructura desde cero (~10 min; BORRA datos)."
        $rdsDelConfirm = Read-Host "¿Eliminar el RDS existente? [s/N]"
        if ($rdsDelConfirm -in @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
            $rdsAction = "delete"
        } else {
            $rdsAction = "keep"
        }
    }

    if ($rdsAction -eq "keep") {
        $albSgOk = ""
        $ec2SgOk = ""
        $pubSubnetCount = 0
        if ($existingVpc) {
            $albSgOk = Invoke-AwsCheck -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$existingVpc", "Name=group-name,Values=$ProjectPrefix-alb-sg", "--query", "SecurityGroups[0].GroupId", "--output", "text")
            $ec2SgOk = Invoke-AwsCheck -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$existingVpc", "Name=group-name,Values=$ProjectPrefix-ec2-sg", "--query", "SecurityGroups[0].GroupId", "--output", "text")
            $cntTxt = Invoke-AwsCheck -AwsArgs @("ec2", "describe-subnets", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$existingVpc", "Name=tag:Tier,Values=public", "--query", "length(Subnets)", "--output", "text")
            if ($cntTxt -match '^\d+$') { $pubSubnetCount = [int]$cntTxt }
        }

        if (-not $existingVpc -or -not $albSgOk -or -not $ec2SgOk -or $pubSubnetCount -lt 2) {
            Write-Host "[AVISO] No se encontro la VPC o Security Groups completos necesarios para reutilizar $rdsId." -ForegroundColor Yellow
            if ($Force) {
                Write-Host "[ERROR] Red base incompleta para reutilizar RDS en modo automatico." -ForegroundColor Red
                exit 1
            }
            $recreateConfirm = Read-Host "¿Deseas ejecutar '.\2-destruir-aws.ps1 -Force -DeleteRds' para limpiar todo y recrear desde cero? [s/N]"
            if ($recreateConfirm -in @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
                $rdsAction = "delete"
            } else {
                Write-Host "Despliegue cancelado."
                exit 1
            }
        }
    }

    if ($rdsAction -eq "keep") {
        Write-Host ""
        Write-Host "  Preparando reutilizacion de Amazon RDS ($rdsId) en VPC $existingVpc..." -ForegroundColor Cyan
        & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force -KeepRds
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        $currRdsStatus = Invoke-AwsCheck -AwsArgs @("rds", "describe-db-instances", "--region", $TargetRegion, "--db-instance-identifier", $rdsId, "--query", "DBInstances[0].DBInstanceStatus", "--output", "text")
        if ($currRdsStatus -ne "available") {
            Write-Host "  Esperando a que Amazon RDS ($rdsId) alcance estado 'available' (actual: $currRdsStatus)..."
            $null = & aws rds wait db-instance-available --region $TargetRegion --db-instance-identifier $rdsId
            if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        }

        $reuseDbPass = New-RdsSyncPassword
        Write-Host "  Sincronizando credencial de conexion en Amazon RDS ($rdsId)..."
        $null = & aws rds modify-db-instance --region $TargetRegion --db-instance-identifier $rdsId --master-user-password $reuseDbPass --apply-immediately
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        Write-Host "  Esperando confirmacion de Amazon RDS (~30-45 seg)..."
        Start-Sleep -Seconds 10
        $null = & aws rds wait db-instance-available --region $TargetRegion --db-instance-identifier $rdsId
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

        $reuseExistingRds = $true
        $createRds = $true
    } else {
        Write-Host "  Eliminando infraestructura previa (incluyendo RDS) antes de recrear desde cero..." -ForegroundColor Yellow
        & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force -DeleteRds
        if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
        $reuseExistingRds = $false
        $createRds = (-not $WithoutRds)
    }
} else {
    if (-not $hasLocalState) {
        $orphans = @()
        if ($existingVpc) { $orphans += "VPC($existingVpc)" }

        $existingKey = Invoke-AwsCheck -AwsArgs @("ec2", "describe-key-pairs", "--region", $TargetRegion, "--key-names", "$ProjectPrefix-deploy-key", "--query", "KeyPairs[0].KeyName", "--output", "text")
        if ($existingKey) { $orphans += "KeyPair($existingKey)" }

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
                Write-Host "  Limpiando automaticamente recursos huerfanos con .\2-destruir-aws.ps1 -Force -DeleteRds..." -ForegroundColor Cyan
                & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force -DeleteRds
                if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
            } else {
                $cleanConfirm = Read-Host "¿Deseas ejecutar '.\2-destruir-aws.ps1 -Force -DeleteRds' ahora para limpiar los recursos previos y continuar? [s/N]"
                if ($cleanConfirm -in @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
                    & (Join-Path $PSScriptRoot "2-destruir-aws.ps1") -Force -DeleteRds
                    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
                } else {
                    Write-Host "Despliegue cancelado. Ejecuta '.\2-destruir-aws.ps1' manualmente antes de volver a desplegar."
                    exit 1
                }
            }
        }
    }

    if ($WithoutRds) {
        $createRds = $false
    } elseif ($WithRds) {
        $createRds = $true
    } elseif ($Force) {
        $createRds = $true
    } else {
        Write-Host ""
        Write-Host "No se detecto una instancia Amazon RDS activa ($rdsId) en $TargetRegion." -ForegroundColor Cyan
        Write-Host "¿Deseas crear la base de datos Amazon RDS PostgreSQL en este despliegue?" -ForegroundColor Yellow
        Write-Host "  - 'S' (Por defecto - Recomendado): Crea Amazon RDS PostgreSQL 16 en subred privada (~6-10 min)."
        Write-Host "  - 'n': Despliega SIN Amazon RDS usando PostgreSQL en contenedor Docker local en EC2 (~2 min)."
        Write-Host "         (Nota: sin RDS, cada EC2 usa su propia BD local en lugar de una BD compartida.)"
        $createRdsConfirm = Read-Host "¿Crear Amazon RDS PostgreSQL? [S/n]"
        $createRds = ($createRdsConfirm -notin @("n", "N", "no", "NO"))
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
if ($reuseExistingRds) {
    Write-Host "[4/4] Reutilizando VPC y Amazon RDS ($rdsId); creando EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
    Write-Host "      (Despliegue rapido: suele tardar entre 2 y 3 minutos)" -ForegroundColor Yellow
} elseif ($createRds) {
    Write-Host "[4/4] Creando VPC, Security Groups, RDS PostgreSQL 16, EIP, ALB y Auto Scaling Group (2 EC2 en 2 AZs)..."
    Write-Host "      (Esto suele tardar entre 6 y 10 minutos principalmente por Amazon RDS)" -ForegroundColor Yellow
} else {
    Write-Host "[4/4] Creando VPC, Security Groups, EIP, ALB y Auto Scaling Group sin Amazon RDS (PostgreSQL local en Docker)..."
    Write-Host "      (Despliegue rapido: suele tardar entre 2 y 3 minutos)" -ForegroundColor Yellow
}

$createRdsTf = if ($createRds) { "true" } else { "false" }
$reuseRdsTf = if ($reuseExistingRds) { "true" } else { "false" }
$tfApplyArgs = @(
    "apply",
    "-auto-approve",
    "-var=create_rds=$createRdsTf",
    "-var=reuse_existing_rds=$reuseRdsTf"
)
if (-not [string]::IsNullOrWhiteSpace($reuseDbPass)) {
    $tfApplyArgs += "-var=db_password_override=$reuseDbPass"
}
if ($identity.Arn -match "voclabs|LabRole") {
    Write-Host "  Entorno AWS Academy detectado: usando iam_instance_profile=LabInstanceProfile." -ForegroundColor Gray
} else {
    $prevEap = $ErrorActionPreference
    $hasNativePref = Test-Path variable:PSNativeCommandUseErrorActionPreference
    $prevNativePref = if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference } else { $false }
    $ErrorActionPreference = "Continue"
    if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $false }
    try {
        $null = aws iam get-instance-profile --instance-profile-name LabInstanceProfile 2>$null
        $iamCheckExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
        if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $prevNativePref }
    }

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
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
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
$hasNativePref = Test-Path variable:PSNativeCommandUseErrorActionPreference
$prevNativePref = if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference } else { $false }
$ErrorActionPreference = "Continue"
if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $false }
try {
    $ASG_INSTANCE_ID = (aws ec2 describe-instances `
        --filters "Name=tag:aws:autoscaling:groupName,Values=$ASG_NAME" "Name=instance-state-name,Values=running" `
        --query "Reservations[0].Instances[0].InstanceId" `
        --output text 2>$null)
    $describeExit = $LASTEXITCODE
} finally {
    $ErrorActionPreference = $prevEap
    if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $prevNativePref }
}

if ($describeExit -eq 0 -and -not [string]::IsNullOrWhiteSpace($ASG_INSTANCE_ID) -and $ASG_INSTANCE_ID.Trim() -ne "None") {
    $ASG_INSTANCE_ID = $ASG_INSTANCE_ID.Trim()
    Write-Host "  Asociando Elastic IP ($EIP / $EIP_ALLOC_ID) a instancia activa del ASG ($ASG_INSTANCE_ID)..." -ForegroundColor Cyan
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $false }
    try {
        $null = aws ec2 associate-address --instance-id $ASG_INSTANCE_ID --allocation-id $EIP_ALLOC_ID --allow-reassociation 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Aviso: No se pudo asociar la Elastic IP aun; user_data la asociara al iniciar." -ForegroundColor Yellow
        }
    } finally {
        $ErrorActionPreference = $prevEap
        if ($hasNativePref) { $PSNativeCommandUseErrorActionPreference = $prevNativePref }
    }
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
if (-not $createRds) {
    Write-Host "  Base de datos PostgreSQL        : Contenedor Docker local en EC2 (sin Amazon RDS)"
} elseif ($reuseExistingRds) {
    Write-Host "  Amazon RDS Endpoint (REUTILIZADO): $RDS_ENDPOINT" -ForegroundColor Green
} else {
    Write-Host "  Amazon RDS Endpoint             : $RDS_ENDPOINT"
}
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
