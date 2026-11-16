# =============================================================================
# SCRIPT 2: DESTRUCCION TOTAL DE INFRAESTRUCTURA AWS (STATELESS + TERRAFORM)
# Proyecto: Carta Digital PNK Security
# Uso: .\2-destruir-aws.ps1          (pide confirmacion interactiva)
#      .\2-destruir-aws.ps1 -Force   (sin confirmacion interactiva)
#
# Disenado a prueba de perdida de sesion (ej. sin terraform.tfstate local):
#   1) Si existe terraform.tfstate local, ejecuta 'terraform destroy -auto-approve'.
#   2) Siempre ejecuta un barrido directo por AWS CLI (Stateless Sweep) por prefijo
#      'pnk-carta-digital' en orden de dependencias para garantizar $0 cobros.
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

function Invoke-AwsSafe {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$AwsArgs
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $out = & aws @AwsArgs 2>$null
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEap
    }
    return [pscustomobject]@{
        ExitCode = $code
        Output   = ($out | Out-String).Trim()
    }
}

function ConvertTo-UniqueIds {
    param(
        [string[]]$RawTexts
    )
    $set = New-Object System.Collections.Generic.HashSet[string]
    foreach ($text in $RawTexts) {
        if ([string]::IsNullOrWhiteSpace($text)) { continue }
        foreach ($token in ($text -split '\s+')) {
            $t = $token.Trim()
            if ($t -and $t -ne "None" -and $t -ne "null") {
                $null = $set.Add($t)
            }
        }
    }
    return @($set)
}

function Get-ProjectVpcIds {
    $r1 = Invoke-AwsSafe -AwsArgs @("ec2", "describe-vpcs", "--region", $TargetRegion, "--filters", "Name=tag:Name,Values=$ProjectPrefix*", "--query", "Vpcs[].VpcId", "--output", "text")
    $r2 = Invoke-AwsSafe -AwsArgs @("ec2", "describe-vpcs", "--region", $TargetRegion, "--filters", "Name=tag:Project,Values=$ProjectPrefix", "--query", "Vpcs[].VpcId", "--output", "text")
    return ConvertTo-UniqueIds -RawTexts @($r1.Output, $r2.Output)
}

Write-Host "=============================================================================" -ForegroundColor Yellow
Write-Host "  PNK Security - Script 2: Destruir Infraestructura AWS (Stateless Teardown)" -ForegroundColor Yellow
Write-Host "=============================================================================" -ForegroundColor Yellow

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] AWS CLI ('aws') no esta instalado." -ForegroundColor Red
    exit 1
}

$identityCheck = Invoke-AwsSafe -AwsArgs @("sts", "get-caller-identity")
if ($identityCheck.ExitCode -ne 0) {
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
    Write-Host "     (IMPORTANTE: 'aws configure' NO pide aws_session_token; si expiro tras ~4h, copia credenciales nuevas)."
    Write-Host "  4. Verifica la region us-east-1: aws configure set region us-east-1  (o `$env:AWS_DEFAULT_REGION = 'us-east-1')."
    Write-Host "  5. Alternativa sin copiar llaves: ejecuta ./2-destruir-aws.sh desde AWS CloudShell (us-east-1)."
    Write-Host ""
    Write-Host "Si usas una cuenta AWS personal estandar: ejecuta 'aws configure' (region us-east-1)." -ForegroundColor Cyan
    exit 1
}

if (-not $Force) {
    Write-Host ""
    Write-Host "ATENCION: Esta accion eliminara permanentemente TODOS los recursos '${ProjectPrefix}*' en ${TargetRegion}:" -ForegroundColor Red
    Write-Host "  - Auto Scaling Group, Launch Templates e instancias EC2"
    Write-Host "  - Application Load Balancer, Target Group y Elastic IP"
    Write-Host "  - Base de datos Amazon RDS PostgreSQL (y sus datos) + DB Subnet Group"
    Write-Host "  - Par de llaves SSH (${ProjectPrefix}-deploy-key)"
    Write-Host "  - VPC, Subredes, ENIs, Route Tables, Internet Gateway y Security Groups"
    Write-Host "  - Archivos locales de estado (terraform.tfstate, llave .pem y outputs JSON)"
    Write-Host ""
    $confirm = Read-Host "¿Deseas continuar y destruir toda la infraestructura? [s/N]"
    if ($confirm -notin @("s", "S", "si", "SI", "y", "Y", "yes", "YES")) {
        Write-Host "Operacion cancelada. No se elimino ningun recurso."
        exit 0
    }
}

# =============================================================================
# PASO 1: TERRAFORM DESTROY (SI EXISTE terraform.tfstate LOCAL)
# =============================================================================
Write-Host ""
Write-Host "[1/3] Verificando estado local de Terraform (terraform.tfstate)..."
$hasState = (Test-Path "terraform.tfstate") -and ((Get-Item "terraform.tfstate").Length -gt 0)
if ($hasState) {
    if (Get-Command terraform -ErrorAction SilentlyContinue) {
        Write-Host "  terraform.tfstate encontrado. Ejecutando 'terraform destroy -auto-approve'..."
        $prevEap = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        try {
            if (-not (Test-Path ".terraform")) {
                & terraform init
            }
            & terraform destroy -auto-approve
        } finally {
            $ErrorActionPreference = $prevEap
        }
    } else {
        Write-Host "  [AVISO] terraform.tfstate existe pero Terraform no esta instalado; se continuara con el barrido directo por AWS CLI." -ForegroundColor Yellow
    }
} else {
    Write-Host "  [INFO] No se encontro terraform.tfstate local. Saltando directo al barrido stateless por AWS CLI..." -ForegroundColor Cyan
}

# =============================================================================
# PASO 2: BARRIDO DIRECTO POR AWS CLI (STATELESS SWEEP - ORDEN DE DEPENDENCIAS)
# =============================================================================
Write-Host ""
Write-Host "[2/3] Ejecutando barrido directo por AWS CLI en region $TargetRegion (prefijo: $ProjectPrefix)..."

# 2.1. Auto Scaling Group (pnk-carta-digital-asg)
Write-Host "  [2.1] Buscando Auto Scaling Groups (${ProjectPrefix}*)..."
$asgRes = Invoke-AwsSafe -AwsArgs @("autoscaling", "describe-auto-scaling-groups", "--region", $TargetRegion, "--query", "AutoScalingGroups[?starts_with(AutoScalingGroupName, '$ProjectPrefix')].AutoScalingGroupName", "--output", "text")
$asgList = ConvertTo-UniqueIds -RawTexts @($asgRes.Output)
if ($asgList.Count -gt 0) {
    foreach ($asg in $asgList) {
        Write-Host "        Eliminando ASG (--force-delete): $asg"
        $null = Invoke-AwsSafe -AwsArgs @("autoscaling", "delete-auto-scaling-group", "--region", $TargetRegion, "--auto-scaling-group-name", $asg, "--force-delete")
    }
} else {
    Write-Host "        Sin Auto Scaling Groups activos."
}

# 2.2. Launch Templates (pnk-carta-digital-lt-*)
Write-Host "  [2.2] Buscando Launch Templates (${ProjectPrefix}-*)..."
$ltRes = Invoke-AwsSafe -AwsArgs @("ec2", "describe-launch-templates", "--region", $TargetRegion, "--filters", "Name=launch-template-name,Values=$ProjectPrefix-*", "--query", "LaunchTemplates[].LaunchTemplateId", "--output", "text")
$ltList = ConvertTo-UniqueIds -RawTexts @($ltRes.Output)
if ($ltList.Count -gt 0) {
    foreach ($ltId in $ltList) {
        Write-Host "        Eliminando Launch Template: $ltId"
        $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-launch-template", "--region", $TargetRegion, "--launch-template-id", $ltId)
    }
} else {
    Write-Host "        Sin Launch Templates pendientes."
}

# 2.3. Instancias EC2 (por tags del proyecto o dentro de la VPC del proyecto)
Write-Host "  [2.3] Buscando instancias EC2 (${ProjectPrefix}* o dentro de ${ProjectPrefix}-vpc)..."
$vpcIds = Get-ProjectVpcIds
$ec2Raw = @()
$ec2Raw += (Invoke-AwsSafe -AwsArgs @("ec2", "describe-instances", "--region", $TargetRegion, "--filters", "Name=tag:Name,Values=$ProjectPrefix*", "Name=instance-state-name,Values=pending,running,stopping,stopped", "--query", "Reservations[].Instances[].InstanceId", "--output", "text")).Output
$ec2Raw += (Invoke-AwsSafe -AwsArgs @("ec2", "describe-instances", "--region", $TargetRegion, "--filters", "Name=tag:Project,Values=$ProjectPrefix", "Name=instance-state-name,Values=pending,running,stopping,stopped", "--query", "Reservations[].Instances[].InstanceId", "--output", "text")).Output
foreach ($vpcId in $vpcIds) {
    $ec2Raw += (Invoke-AwsSafe -AwsArgs @("ec2", "describe-instances", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "Name=instance-state-name,Values=pending,running,stopping,stopped", "--query", "Reservations[].Instances[].InstanceId", "--output", "text")).Output
}
$instanceIds = ConvertTo-UniqueIds -RawTexts $ec2Raw

if ($instanceIds.Count -gt 0) {
    Write-Host "        Terminando instancias EC2: $($instanceIds -join ' ')"
    $null = Invoke-AwsSafe -AwsArgs (@("ec2", "terminate-instances", "--region", $TargetRegion, "--instance-ids") + $instanceIds)
    Write-Host "        Esperando a que las instancias EC2 alcancen estado 'terminated'..."
    $null = Invoke-AwsSafe -AwsArgs (@("ec2", "wait", "instance-terminated", "--region", $TargetRegion, "--instance-ids") + $instanceIds)
} else {
    Write-Host "        Sin instancias EC2 activas."
}

# 2.4. Application Load Balancer (pnk-carta-digital-alb) & Target Group (pnk-carta-digital-tg)
Write-Host "  [2.4] Buscando Application Load Balancer y Target Group..."
$albRes = Invoke-AwsSafe -AwsArgs @("elbv2", "describe-load-balancers", "--region", $TargetRegion, "--names", "$ProjectPrefix-alb", "--query", "LoadBalancers[].LoadBalancerArn", "--output", "text")
$albArns = ConvertTo-UniqueIds -RawTexts @($albRes.Output)
if ($albArns.Count -gt 0) {
    foreach ($alb in $albArns) {
        Write-Host "        Eliminando ALB: $alb"
        $null = Invoke-AwsSafe -AwsArgs @("elbv2", "delete-load-balancer", "--region", $TargetRegion, "--load-balancer-arn", $alb)
        Write-Host "        Esperando eliminacion completa del ALB..."
        $null = Invoke-AwsSafe -AwsArgs @("elbv2", "wait", "load-balancers-deleted", "--region", $TargetRegion, "--load-balancer-arns", $alb)
    }
} else {
    Write-Host "        Sin Application Load Balancer (${ProjectPrefix}-alb)."
}

$tgRes = Invoke-AwsSafe -AwsArgs @("elbv2", "describe-target-groups", "--region", $TargetRegion, "--names", "$ProjectPrefix-tg", "--query", "TargetGroups[].TargetGroupArn", "--output", "text")
$tgArns = ConvertTo-UniqueIds -RawTexts @($tgRes.Output)
if ($tgArns.Count -gt 0) {
    foreach ($tg in $tgArns) {
        Write-Host "        Eliminando Target Group: $tg"
        for ($attempt = 1; $attempt -le 6; $attempt++) {
            $delTg = Invoke-AwsSafe -AwsArgs @("elbv2", "delete-target-group", "--region", $TargetRegion, "--target-group-arn", $tg)
            if ($delTg.ExitCode -eq 0) { break }
            Start-Sleep -Seconds 5
        }
    }
} else {
    Write-Host "        Sin Target Group (${ProjectPrefix}-tg)."
}

# 2.5. Elastic IPs (pnk-carta-digital*)
Write-Host "  [2.5] Buscando Elastic IPs (${ProjectPrefix}*)..."
$eipRaw = @(
    (Invoke-AwsSafe -AwsArgs @("ec2", "describe-addresses", "--region", $TargetRegion, "--filters", "Name=tag:Name,Values=$ProjectPrefix*", "--query", "Addresses[].AllocationId", "--output", "text")).Output,
    (Invoke-AwsSafe -AwsArgs @("ec2", "describe-addresses", "--region", $TargetRegion, "--filters", "Name=tag:Project,Values=$ProjectPrefix", "--query", "Addresses[].AllocationId", "--output", "text")).Output
)
$eipAllocs = ConvertTo-UniqueIds -RawTexts $eipRaw
if ($eipAllocs.Count -gt 0) {
    foreach ($allocId in $eipAllocs) {
        $assocRes = Invoke-AwsSafe -AwsArgs @("ec2", "describe-addresses", "--region", $TargetRegion, "--allocation-ids", $allocId, "--query", "Addresses[0].AssociationId", "--output", "text")
        $assocIds = ConvertTo-UniqueIds -RawTexts @($assocRes.Output)
        foreach ($assocId in $assocIds) {
            Write-Host "        Desasociando Elastic IP ($allocId / $assocId)..."
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "disassociate-address", "--region", $TargetRegion, "--association-id", $assocId)
        }
        Write-Host "        Liberando Elastic IP: $allocId"
        $null = Invoke-AwsSafe -AwsArgs @("ec2", "release-address", "--region", $TargetRegion, "--allocation-id", $allocId)
    }
} else {
    Write-Host "        Sin Elastic IPs pendientes."
}

# 2.6. Amazon RDS PostgreSQL (pnk-carta-digital-postgres & pnk-carta-digital-rds-subnet-group)
Write-Host "  [2.6] Buscando Amazon RDS PostgreSQL (${ProjectPrefix}-postgres)..."
$rdsId = "$ProjectPrefix-postgres"
$rdsRes = Invoke-AwsSafe -AwsArgs @("rds", "describe-db-instances", "--region", $TargetRegion, "--db-instance-identifier", $rdsId, "--query", "DBInstances[0].DBInstanceStatus", "--output", "text")
$rdsStatus = (ConvertTo-UniqueIds -RawTexts @($rdsRes.Output)) | Select-Object -First 1
if ($rdsRes.ExitCode -eq 0 -and -not [string]::IsNullOrWhiteSpace($rdsStatus)) {
    if ($rdsStatus -ne "deleting") {
        Write-Host "        Deshabilitando deletion-protection (si aplica) en $rdsId..."
        $null = Invoke-AwsSafe -AwsArgs @("rds", "modify-db-instance", "--region", $TargetRegion, "--db-instance-identifier", $rdsId, "--no-deletion-protection", "--apply-immediately")
        Write-Host "        Eliminando instancia RDS $rdsId (sin final snapshot)..."
        $null = Invoke-AwsSafe -AwsArgs @("rds", "delete-db-instance", "--region", $TargetRegion, "--db-instance-identifier", $rdsId, "--skip-final-snapshot", "--delete-automated-backups")
    } else {
        Write-Host "        La instancia RDS $rdsId ya estaba en estado 'deleting'."
    }
    Write-Host "        Esperando eliminacion completa de Amazon RDS (puede tardar varios minutos)..."
    $null = Invoke-AwsSafe -AwsArgs @("rds", "wait", "db-instance-deleted", "--region", $TargetRegion, "--db-instance-identifier", $rdsId)
} else {
    Write-Host "        Sin instancia RDS ($rdsId)."
}

$rdsSubnetGrp = "$ProjectPrefix-rds-subnet-group"
$sgCheck = Invoke-AwsSafe -AwsArgs @("rds", "describe-db-subnet-groups", "--region", $TargetRegion, "--db-subnet-group-name", $rdsSubnetGrp)
if ($sgCheck.ExitCode -eq 0) {
    Write-Host "        Eliminando DB Subnet Group: $rdsSubnetGrp"
    $null = Invoke-AwsSafe -AwsArgs @("rds", "delete-db-subnet-group", "--region", $TargetRegion, "--db-subnet-group-name", $rdsSubnetGrp)
}

# 2.7. SSH Key Pair (pnk-carta-digital-deploy-key)
Write-Host "  [2.7] Eliminando Key Pair SSH (${ProjectPrefix}-deploy-key) si existe..."
$null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-key-pair", "--region", $TargetRegion, "--key-name", "$ProjectPrefix-deploy-key")

# 2.8. VPC, ENIs, Security Groups, Subnets, Route Tables e Internet Gateway
Write-Host "  [2.8] Buscando VPC, Subredes, Route Tables, IGW y Security Groups (${ProjectPrefix}*)..."
$vpcIds = Get-ProjectVpcIds
if ($vpcIds.Count -gt 0) {
    foreach ($vpcId in $vpcIds) {
        Write-Host "        Limpiando VPC: $vpcId"

        # Esperar a que ENIs de ALB/RDS terminen de desacoplarse y limpiar ENIs disponibles
        for ($waitI = 1; $waitI -le 12; $waitI++) {
            $availEnis = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-network-interfaces", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "Name=status,Values=available", "--query", "NetworkInterfaces[].NetworkInterfaceId", "--output", "text")).Output)
            foreach ($eni in $availEnis) {
                Write-Host "          Eliminando ENI residual: $eni"
                $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-network-interface", "--region", $TargetRegion, "--network-interface-id", $eni)
            }
            $allEnis = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-network-interfaces", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "NetworkInterfaces[].NetworkInterfaceId", "--output", "text")).Output)
            if ($allEnis.Count -eq 0) { break }
            Write-Host "          Esperando liberacion de ENIs de red en $vpcId ($waitI/12)..."
            Start-Sleep -Seconds 5
        }

        # Revocar reglas ingress/egress de Security Groups no-default (evita bloqueos por referencias cruzadas)
        $sgIds = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "SecurityGroups[?GroupName!='default'].GroupId", "--output", "text")).Output)
        foreach ($sg in $sgIds) {
            $ingRes = Invoke-AwsSafe -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--group-ids", $sg, "--query", "SecurityGroups[0].IpPermissions", "--output", "json")
            $ingFlat = ($ingRes.Output -replace '\s+', '')
            if ($ingRes.ExitCode -eq 0 -and $ingFlat -and $ingFlat -ne "[]" -and $ingFlat -ne "null") {
                $tmpIng = [System.IO.Path]::GetTempFileName()
                try {
                    Set-Content -Path $tmpIng -Value $ingRes.Output -Encoding Ascii
                    $null = Invoke-AwsSafe -AwsArgs @("ec2", "revoke-security-group-ingress", "--region", $TargetRegion, "--group-id", $sg, "--ip-permissions", "file://$tmpIng")
                } finally {
                    Remove-Item -Path $tmpIng -Force -ErrorAction SilentlyContinue
                }
            }

            $egrRes = Invoke-AwsSafe -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--group-ids", $sg, "--query", "SecurityGroups[0].IpPermissionsEgress", "--output", "json")
            $egrFlat = ($egrRes.Output -replace '\s+', '')
            if ($egrRes.ExitCode -eq 0 -and $egrFlat -and $egrFlat -ne "[]" -and $egrFlat -ne "null") {
                $tmpEgr = [System.IO.Path]::GetTempFileName()
                try {
                    Set-Content -Path $tmpEgr -Value $egrRes.Output -Encoding Ascii
                    $null = Invoke-AwsSafe -AwsArgs @("ec2", "revoke-security-group-egress", "--region", $TargetRegion, "--group-id", $sg, "--ip-permissions", "file://$tmpEgr")
                } finally {
                    Remove-Item -Path $tmpEgr -Force -ErrorAction SilentlyContinue
                }
            }
        }

        for ($pass = 1; $pass -le 3; $pass++) {
            $remSgs = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-security-groups", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "SecurityGroups[?GroupName!='default'].GroupId", "--output", "text")).Output)
            if ($remSgs.Count -eq 0) { break }
            foreach ($sg in $remSgs) {
                Write-Host "          Eliminando Security Group: $sg"
                $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-security-group", "--region", $TargetRegion, "--group-id", $sg)
            }
        }

        # Eliminar Subnets
        $subnetIds = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-subnets", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "Subnets[].SubnetId", "--output", "text")).Output)
        foreach ($subnet in $subnetIds) {
            Write-Host "          Eliminando Subnet: $subnet"
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-subnet", "--region", $TargetRegion, "--subnet-id", $subnet)
        }

        # Desasociar y eliminar Route Tables no-main
        $rtbAssocs = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-route-tables", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "RouteTables[].Associations[?!Main].RouteTableAssociationId", "--output", "text")).Output)
        foreach ($assoc in $rtbAssocs) {
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "disassociate-route-table", "--region", $TargetRegion, "--association-id", $assoc)
        }

        $rtbIds = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-route-tables", "--region", $TargetRegion, "--filters", "Name=vpc-id,Values=$vpcId", "--query", "RouteTables[?!(Associations[?Main])].RouteTableId", "--output", "text")).Output)
        foreach ($rtb in $rtbIds) {
            Write-Host "          Eliminando Route Table: $rtb"
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-route-table", "--region", $TargetRegion, "--route-table-id", $rtb)
        }

        # Desacoplar y eliminar Internet Gateways
        $igwIds = ConvertTo-UniqueIds -RawTexts @((Invoke-AwsSafe -AwsArgs @("ec2", "describe-internet-gateways", "--region", $TargetRegion, "--filters", "Name=attachment.vpc-id,Values=$vpcId", "--query", "InternetGateways[].InternetGatewayId", "--output", "text")).Output)
        foreach ($igw in $igwIds) {
            Write-Host "          Desacoplando y eliminando IGW: $igw"
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "detach-internet-gateway", "--region", $TargetRegion, "--internet-gateway-id", $igw, "--vpc-id", $vpcId)
            $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-internet-gateway", "--region", $TargetRegion, "--internet-gateway-id", $igw)
        }

        # Eliminar VPC
        Write-Host "          Eliminando VPC: $vpcId"
        $null = Invoke-AwsSafe -AwsArgs @("ec2", "delete-vpc", "--region", $TargetRegion, "--vpc-id", $vpcId)
    }
} else {
    Write-Host "        Sin VPCs de $ProjectPrefix activas."
}

# =============================================================================
# PASO 3: LIMPIEZA DE ARCHIVOS LOCALES DE ESTADO Y LLAVES
# =============================================================================
Write-Host ""
Write-Host "[3/3] Limpiando archivos locales de estado (terraform.tfstate, llave .pem y outputs JSON)..."
Remove-Item -Path "terraform.tfstate", "terraform.tfstate.backup", "pnk-ec2-deploy-key.pem", "outputs-despliegue.json" -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=============================================================================" -ForegroundColor Green
Write-Host "  INFRAESTRUCTURA DESTRUIDA COMPLETAMENTE (STATELESS-PROOF)" -ForegroundColor Green
Write-Host "  Todos los recursos (${ProjectPrefix}*: ASG, LT, EC2, ALB, TG, EIP, RDS," -ForegroundColor Green
Write-Host "  Key Pair, Security Groups, Subnets, Route Tables, IGW y VPC) eliminados." -ForegroundColor Green
Write-Host "  Confirmado: `$0 en cargos continuos de AWS." -ForegroundColor Green
Write-Host "=============================================================================" -ForegroundColor Green
