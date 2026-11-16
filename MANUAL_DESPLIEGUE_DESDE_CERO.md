# Manual Completo de Despliegue desde Cero (AWS + Cloudflare + Docker)

**Proyecto:** Carta Digital PNK Security (v3.0)  
**Stack:** React 19 + Vite + Express + pnpm + PostgreSQL 16 + Docker + Cloudflare Worker + AWS (VPC, ALB, ASG, EC2, RDS)  
**Estándar de Seguridad:** OWASP ASVS v5.0 — Nivel 3

> [!NOTE]
> Este manual está diseñado para que **cualquier persona externa al proyecto, partiendo completamente desde cero**, pueda levantar toda la infraestructura en AWS con **un solo comando**, conectarla a HTTPS gratuito en Cloudflare (sin comprar dominio), probar la aplicación completa (Selector de Restaurantes + 6 CRUDs) y **destruir todo con otro comando** para evitar cobros en AWS.

---

## Índice

1. [Arquitectura del Proyecto y Seguridad (OWASP ASVS v5.0 Nivel 3)](#1-arquitectura-del-proyecto-y-seguridad-owasp-asvs-v50-nivel-3)
2. [Prerrequisitos desde Cero (AWS Academy LabRole y Herramientas)](#2-prerrequisitos-desde-cero-aws-academy-labrole-y-herramientas)
3. [Paso 1: Desplegar toda la Infraestructura AWS con Script 1](#3-paso-1-desplegar-toda-la-infraestructura-aws-con-script-1)
4. [Paso 2: Configurar Cloudflare Worker Manualmente desde Cero (HTTPS Gratis, Sin Dominio)](#4-paso-2-configurar-cloudflare-worker-manualmente-desde-cero-https-gratis-sin-dominio)
5. [Paso 3: Probar la Aplicación Desplegada (`/carta`, `/carrito`, `/admin` y los 6 CRUDs)](#5-paso-3-probar-la-aplicación-desplegada-carta-carrito-admin-y-los-6-cruds)
6. [Opcional: Configurar Secretos de GitHub Actions para CI/CD Automático](#6-opcional-configurar-secretos-de-github-actions-para-cicd-automático)
7. [Paso 4: Destruir toda la Infraestructura AWS con Script 2 (Cero Cobros)](#7-paso-4-destruir-toda-la-infraestructura-aws-con-script-2-cero-cobros)
8. [Solución de Problemas Frecuentes (Troubleshooting)](#8-solución-de-problemas-frecuentes-troubleshooting)

---

## 1. Arquitectura del Proyecto y Seguridad (OWASP ASVS v5.0 Nivel 3)

La aplicación separa físicamente el **Front-End** (SPA en React 19 + Vite, servida por un Express endurecido en el puerto interno `8080`) y el **Back-End MVC** (API REST en Node.js + Express en el puerto interno `3000`, nunca expuesto a Internet), conectados a una base de datos **Amazon RDS PostgreSQL 16** cifrada y aislada en subredes privadas sin acceso desde Internet.

### Diagrama de Arquitectura

```mermaid
flowchart TB
    User["Usuario Final (Navegador Web)"] -->|"HTTPS TLS 1.3"| CF["Cloudflare Worker Gratuito (*.workers.dev)<br/>WAF Borde + Cabeceras ASVS 5.0<br/>Variable: EC2_ORIGIN_URL"]

    subgraph AWS["AWS Cloud - VPC 10.20.0.0/16 (pnk-carta-digital-vpc)"]
        IGW["Internet Gateway (IGW)"]
        CF -->|"HTTP Puerto 80"| IGW

        subgraph PublicSubnets["Subredes Públicas (10.20.1.0/24 y 10.20.2.0/24)"]
            ALB["Application Load Balancer (pnk-carta-digital-alb)<br/>SG: alb_sg (HTTP :80) -> Healthcheck /health"]
            IGW --> ALB
            IGW -->|"Opción directa *.sslip.io o SSH :22"| EC2P

            subgraph EC2P["EC2 Primaria Ubuntu 24.04 (t3.micro + Elastic IP)"]
                FE1["Contenedor frontend-prod<br/>React 19 + Vite + Express (:80 -> :8080)"] -->|"/api interno (edge_net)"| BE1["Contenedor backend-prod<br/>Node.js MVC (:3000 no expuesto)"]
            end

            subgraph ASG["Auto Scaling Group (1 a 3 nodos, CPU 70%)"]
                FE2["Contenedor frontend-prod (:80 -> :8080)"] -->|"/api interno (edge_net)"| BE2["Contenedor backend-prod (:3000)"]
            end

            ALB -->|"HTTP :80"| EC2P
            ALB -->|"HTTP :80"| ASG
        end

        subgraph PrivateSubnets["Subredes Privadas Aisladas (10.20.11.0/24 y 10.20.12.0/24)"]
            RDS[("Amazon RDS PostgreSQL 16 (db.t3.micro)<br/>SG: rds_sg (:5432 SOLO desde ec2_sg)<br/>Cifrado en reposo + SSL verify-full")]
        end

        BE1 -->|"TCP 5432 + TLS RDS Bundle"| RDS
        BE2 -->|"TCP 5432 + TLS RDS Bundle"| RDS
    end
```

### Controles Clave Implementados (ASVS v5.0 Nivel 3)

- **Ofuscación criptográfica de URLs e IDs:** El navegador nunca ve parámetros `?id=` o `?keyid=` ni carpetas internas; las rutas son `/carta`, `/carrito` y `/admin`, y los identificadores viajan cifrados/autenticados (`AES-256-CTR + HMAC-SHA256`).
- **Aislamiento estricto de red (V14):**
  - El puerto `3000` (Backend) **jamás** se abre en ningún Security Group.
  - El puerto `5432` (RDS PostgreSQL) **jamás** se expone a Internet (`publicly_accessible = false`) y `rds_sg` solo acepta conexiones provenientes de `ec2_sg`.
  - Las instancias EC2 exigen **IMDSv2** (`http_tokens = "required"`).
- **Autenticación y sesiones en servidor:** Contraseñas con PBKDF2-HMAC-SHA512 / Argon2id + `PASSWORD_PEPPER` de 256+ bits generado aleatoriamente, protección CSRF (*Synchronizer Token Pattern*) y RBAC estricto para los 6 CRUDs en `/admin`.

---

## 2. Prerrequisitos desde Cero (AWS Academy LabRole y Herramientas)

Para ejecutar la automatización necesitas:
1. Acceso a **AWS Academy Learner Lab** (rol **`LabRole` / `LabStudent`**) o una cuenta estándar de AWS.
2. **AWS CloudShell** (en el navegador, sin instalar nada) o **Git, AWS CLI v2 y Terraform** instalados en tu PC.

> [!IMPORTANT]
> **Si usas AWS Academy Learner Lab (`LabRole` / `LabStudent`):**
> - **NO entres a IAM ni intentes crear usuarios (`IAM -> Users -> Create user`).** En Learner Lab la acción `iam:CreateUser` está prohibida y siempre arrojará **`AccessDenied`**.
> - Tampoco necesitas crear roles IAM: la infraestructura en `infra/aws/` **crea cero recursos `aws_iam_*`** (solo incluye la variable opcional `iam_instance_profile = ""`, que puedes fijar en `"LabInstanceProfile"` únicamente si algún caso futuro lo exigiera).
> - La región obligatoria en AWS Academy Learner Lab es **`us-east-1` (N. Virginia)**.

---

### 2.1. Iniciar AWS Academy Learner Lab (`us-east-1`)

1. Entra a tu curso en **AWS Academy**, abre **Learner Lab** y haz clic en **Start Lab**.
2. Espera a que el indicador circular junto a **`AWS`** se ponga en **verde** (puede tardar 1-2 minutos la primera vez).
3. Haz clic en **`AWS`** para abrir la Consola de AWS y verifica arriba a la derecha que la región seleccionada sea **`us-east-1` (N. Virginia)**.

Ahora elige **una de las dos opciones** para ejecutar el despliegue:

---

### 2.2. Opción A (Más rápida, dentro del navegador): AWS CloudShell

**AWS CloudShell** es una terminal Linux gratuita dentro de la Consola de AWS que **hereda automáticamente tus credenciales temporales de `LabRole`** (no necesitas copiar llaves ni configurar `~/.aws/credentials`) y ya trae **`git`** y **`aws` CLI** instalados.

1. En la Consola de AWS (asegurando que la región arriba a la derecha sea **`us-east-1`**), haz clic en el ícono **`>_` (CloudShell)** en la barra superior.
2. Instala **`terraform`** en CloudShell:
   ```bash
   sudo yum install -y yum-utils
   sudo yum-config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo
   sudo yum -y install terraform
   terraform -version
   ```
3. Comprueba que ya estás autenticado con `LabRole`:
   ```bash
   aws sts get-caller-identity
   ```
   Verás un JSON con `"Arn": "arn:aws:sts::<ACCOUNT_ID>:assumed-role/voclabs/user..."`.
4. Salta directo al **[Paso 1 (Desplegar con Script 1)](#3-paso-1-desplegar-toda-la-infraestructura-aws-con-script-1)** usando los comandos de Linux/Bash (`./1-desplegar-aws.sh`).

---

### 2.3. Opción B (Desde tu PC en Windows PowerShell o Linux/macOS): Credenciales temporales con `aws_session_token`

#### Paso B.1. Instalar Git, AWS CLI v2 y Terraform en tu PC

Elige tu sistema operativo:

<details>
<summary><strong>Windows (PowerShell)</strong></summary>

Abre **PowerShell** como usuario normal y ejecuta:

```powershell
winget install --id Git.Git -e
winget install --id Amazon.AWSCLI -e
winget install --id Hashicorp.Terraform -e
```

> **Importante:** Después de instalar, **cierra y vuelve a abrir PowerShell** para que reconozca los comandos `git`, `aws` y `terraform`.

Verifica las versiones:
```powershell
git --version
aws --version
terraform -version
```

</details>

<details>
<summary><strong>Linux (Ubuntu / Debian)</strong></summary>

```bash
# 1. Git, curl y unzip
sudo apt-get update
sudo apt-get install -y git curl unzip gnupg software-properties-common

# 2. AWS CLI v2
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip -q awscliv2.zip
sudo ./aws/install
rm -rf aws awscliv2.zip

# 3. Terraform (repositorio oficial de HashiCorp)
wget -O- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt-get update && sudo apt-get install -y terraform

# Verificar
git --version && aws --version && terraform -version
```

</details>

<details>
<summary><strong>macOS (Homebrew)</strong></summary>

```bash
brew install git awscli terraform
git --version && aws --version && terraform -version
```

</details>

#### Paso B.2. Copiar `[default]` desde "AWS Details -> AWS CLI: Show" hacia `~/.aws/credentials`

> [!WARNING]
> **¿Por qué NO debes usar solo `aws configure` en AWS Academy?**  
> El comando `aws configure` únicamente solicita `aws_access_key_id` y `aws_secret_access_key`, pero **NO pide `aws_session_token`**. En AWS Academy Learner Lab las credenciales son temporales (empiezan por `ASIA...`) y **sin `aws_session_token` AWS CLI falla con `InvalidClientTokenId`**.

1. Regresa a la pestaña del portal **AWS Academy Learner Lab** (donde presionaste **Start Lab**) y haz clic en **AWS Details**.
2. En la fila **AWS CLI:**, haz clic en **Show** y luego en **Copy** para copiar todo el bloque `[default]`:
   ```ini
   [default]
   aws_access_key_id=ASIA...
   aws_secret_access_key=...
   aws_session_token=...
   ```
3. Pega ese bloque completo en tu archivo local de credenciales de AWS:
   - **Windows (PowerShell):** ejecuta este comando de una sola línea para crear/abrir `C:\Users\<TuUsuario>\.aws\credentials`, borra cualquier contenido viejo, pega el bloque `[default]` y guarda (`Ctrl+S`):
     ```powershell
     New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\.aws" | Out-Null; notepad "$env:USERPROFILE\.aws\credentials"
     ```
   - **Linux / macOS:** abre `~/.aws/credentials`, pega el bloque `[default]`, guarda y protege los permisos:
     ```bash
     mkdir -p ~/.aws && chmod 700 ~/.aws && nano ~/.aws/credentials && chmod 600 ~/.aws/credentials
     ```
4. Configura la región obligatoria **`us-east-1`** y formato JSON:
   ```bash
   aws configure set region us-east-1
   aws configure set output json
   ```
   *(Opcionalmente en la sesión actual: `$env:AWS_DEFAULT_REGION = "us-east-1"` en PowerShell o `export AWS_DEFAULT_REGION=us-east-1` en Bash).*
5. Verifica que la conexión con AWS funciona:
   ```bash
   aws sts get-caller-identity
   ```
   Debe responder un JSON con `"Account"`, `"UserId"` y `"Arn"` (`arn:aws:sts::<ACCOUNT_ID>:assumed-role/voclabs/user...`).

> [!NOTE]
> **Expiración de sesión (~4 horas) en AWS Academy:**  
> Las credenciales temporales de Learner Lab expiran tras ~4 horas (o cuando termina el temporizador del laboratorio). Si en algún momento aparece **`ExpiredToken`**, vuelve a hacer clic en **Start Lab** (si se detuvo), abre **AWS Details -> AWS CLI: Show -> Copy** y reemplaza el contenido de `~/.aws/credentials` con el bloque fresco.

---

<details>
<summary><strong>¿Usas una cuenta AWS personal estándar (fuera de AWS Academy)? Ver pasos aquí</strong></summary>

Si trabajas con una cuenta AWS personal propia (con Capa Gratuita / *Free Tier*):
1. Entra a [https://console.aws.amazon.com/](https://console.aws.amazon.com/), abre **IAM -> Users -> Create user** (ej. `pnk-deploy-admin`) y adjunta `AdministratorAccess` (o permisos para VPC, EC2, RDS, ELB y ASG).
2. En **Security credentials -> Access keys -> Create access key** (tipo CLI), copia tu `AKIA...` y su Secret Key.
3. Configura AWS CLI en tu terminal con `aws configure` (región `us-east-1`, formato `json`), o bien usa **AWS CloudShell** directamente en el navegador.
4. Valida con `aws sts get-caller-identity`.

</details>

---

## 3. Paso 1: Desplegar toda la Infraestructura AWS con Script 1

### 3.1. Clonar el repositorio (rama `produccion`) y entrar a `infra/aws`

En tu terminal (o en AWS CloudShell):

```bash
git clone -b produccion --single-branch https://github.com/stxtiz/trabajo_desarrollo_seguro.git
cd trabajo_desarrollo_seguro/infra/aws
```

> [!IMPORTANT]
> La rama por defecto en GitHub (`main`) contiene únicamente la versión antigua en PHP y **no** incluye `infra/aws/` ni la arquitectura moderna. **Debes clonar indicando `-b produccion`** (o ejecutar `git checkout produccion` si ya clonaste el repositorio completo sin `--single-branch`) para obtener `infra/aws/` y el stack moderno (React + Node + Docker).

### 3.2. Ejecutar Script 1

Elige el script según tu terminal:

- **Linux / macOS / AWS CloudShell / Git Bash:**
  ```bash
  chmod +x 1-desplegar-aws.sh 2-destruir-aws.sh
  ./1-desplegar-aws.sh
  ```

- **Windows (PowerShell):**
  ```powershell
  .\1-desplegar-aws.ps1
  ```
  *(Si PowerShell bloquea la ejecución por política de scripts locales, ejecuta primero en esa misma ventana: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` y vuelve a ejecutar `.\1-desplegar-aws.ps1`).*

### 3.3. ¿Qué crea Script 1 automáticamente?

Script 1 ejecuta `terraform init`, `terraform validate` y `terraform apply -auto-approve`. Tardará entre **6 y 10 minutos** (principalmente mientras Amazon RDS aprovisiona el motor PostgreSQL 16) y creará de forma automática:

1. **Red aislada (`vpc.tf`):**
   - VPC `pnk-carta-digital-vpc` (`10.20.0.0/16`) e Internet Gateway (`pnk-carta-digital-igw`).
   - 2 Subredes Públicas (`10.20.1.0/24`, `10.20.2.0/24`) con ruta a Internet.
   - 2 Subredes Privadas Aisladas (`10.20.11.0/24`, `10.20.12.0/24`) sin ruta a Internet.
2. **Firewalls OWASP ASVS v5.0 Nivel 3 (`security.tf`):**
   - `alb_sg`: recibe HTTP `:80` y solo reenvía hacia `ec2_sg`.
   - `ec2_sg`: recibe HTTP `:80` y SSH `:22`. Los puertos `3000` (Backend) y `5432` (PostgreSQL) **nunca se exponen**.
   - `rds_sg`: acepta TCP `:5432` **exclusivamente** desde `ec2_sg`.
3. **Llaves y Secretos Criptográficos (`main.tf`):**
   - Par de llaves SSH **ED25519** guardado localmente en `infra/aws/pnk-ec2-deploy-key.pem` (con permisos `0600`).
   - Contraseña aleatoria de 32 caracteres para RDS (`db_password`) y `password_pepper` de 48 caracteres compartidos entre RDS, EC2 primaria y Auto Scaling Group.
4. **Base de datos Amazon RDS PostgreSQL 16 (`rds.tf`):**
   - Instancia `db.t3.micro` con 20 GiB `gp3`, cifrado en reposo (`storage_encrypted = true`), `publicly_accessible = false`, BD `pnk_security` y usuario `pnk_prod_user`.
5. **Cómputo, Balanceo y Escalado (`compute_alb_asg.tf` + `templates/user_data.sh.tftpl`):**
   - **EC2 Primaria Ubuntu 24.04 LTS (`t3.micro`)** + **Elastic IP** fija + **IMDSv2 obligatorio**.
   - **Application Load Balancer (`pnk-carta-digital-alb`)** + Target Group con healthcheck `/health` (`HTTP 200`).
   - **Auto Scaling Group (`pnk-carta-digital-asg`)** (`min=1`, `desired=1`, `max=3`, política de escalado al 70% de CPU).
   - **Bootstrap automático (`user_data`):** crea 2 GB de Swap, instala Docker Engine + Compose v2 + `postgresql-client`, clona la rama `produccion` en `/opt/carta-digital`, descarga el certificado SSL oficial de Amazon RDS (`certs/rds-global-bundle.pem`), genera `.env` (`0600`), espera a RDS con `pg_isready`, inicializa `database/init.sql` **solo si la tabla `public.usuarios` no existe** (protegido con `pg_advisory_lock` para no borrar datos al escalar o reiniciar) y ejecuta `docker compose -f docker-compose.rds.yml up -d --build`.

### 3.4. Cómo leer la salida de Script 1

Al terminar, Script 1 guarda `infra/aws/outputs-despliegue.json` e imprime en pantalla un resumen como este:

| Campo impreso por Script 1 | Variable Terraform (`outputs.tf`) | Para qué se usa |
| :--- | :--- | :--- |
| **Elastic IP (EIP)** | `elastic_ip` | IP fija de la EC2 primaria. Se usa como `AWS_EC2_HOST` en GitHub Secrets y para SSH. |
| **EC2_ORIGIN_URL (via ALB)** | `cloudflare_origin_url_alb` | Valor **recomendado** (`http://<ALB_DNS>`) para configurar `EC2_ORIGIN_URL` en Cloudflare (aprovecha el Load Balancer y el Auto Scaling). |
| **EC2_ORIGIN_URL (via EIP)** | `cloudflare_origin_url_eip` | Alternativa directa (`http://<ELASTIC_IP>.sslip.io`) para `EC2_ORIGIN_URL` en Cloudflare apuntando a la EC2 primaria. |
| **Load Balancer URL (/carta)** | `load_balancer_dns` | URL directa de prueba HTTP en AWS (`http://<ALB_DNS>/carta`). |
| **Amazon RDS Endpoint** | `rds_endpoint` | Dirección privada de PostgreSQL en RDS (solo accesible desde las EC2). |
| **Llave SSH Privada (.pem)** | `ssh_private_key_path` | Ruta `infra/aws/pnk-ec2-deploy-key.pem` (para SSH y `AWS_EC2_SSH_KEY`). |
| **Comando SSH** | `ssh_command` | Comando listo: `ssh -i infra/aws/pnk-ec2-deploy-key.pem ubuntu@<EIP>`. |

### 3.5. Verificar que Docker terminó de compilar e iniciar

Aunque Terraform ya haya terminado, la instancia EC2 tarda **~3 a 5 minutos adicionales** en instalar Docker y compilar las imágenes `frontend-prod` y `backend-prod`.

Verifica el estado ejecutando (reemplaza `<ELASTIC_IP>` o `<ALB_DNS>` por los valores impresos por Script 1):

- **En Linux / macOS / CloudShell:**
  ```bash
  curl -i http://<ELASTIC_IP>/health
  curl -i http://<ALB_DNS>/health
  ```
- **En Windows PowerShell:**
  ```powershell
  curl.exe -i http://<ELASTIC_IP>/health
  curl.exe -i http://<ALB_DNS>/health
  ```

Cuando esté listo responderá **`HTTP/1.1 200 OK`** con JSON `"status":"healthy"`.

> [!TIP]
> Si pasan más de 5 minutos y aún no responde `200 OK`, puedes entrar por SSH con el comando impreso por Script 1 y ver el progreso en tiempo real:
> ```bash
> ssh -i infra/aws/pnk-ec2-deploy-key.pem ubuntu@<ELASTIC_IP>
> sudo tail -f /var/log/pnk-userdata.log
> ```

---

## 4. Paso 2: Configurar Cloudflare Worker Manualmente desde Cero (HTTPS Gratis, Sin Dominio)

Cloudflare nos dará una URL pública **HTTPS (TLS 1.3)** gratuita con el formato `https://carta-digital.<tu-subdominio>.workers.dev`, actuará como proxy inverso delante de AWS y agregará filtros WAF y cabeceras ASVS v5.0 en el borde — **sin comprar ningún dominio ni ingresar tarjeta de crédito**.

### 4.1. Crear cuenta gratuita en Cloudflare y activar tu subdominio `*.workers.dev`

1. Entra a [https://dash.cloudflare.com/sign-up](https://dash.cloudflare.com/sign-up) y regístrate gratis con tu correo electrónico (verifica tu correo si te lo solicita).
2. En el menú lateral izquierdo entra a **Compute (Workers) -> Workers & Pages** (o **Workers & Pages**).
3. Si es tu primera vez en Workers, en el panel derecho verás **Your subdomain** (`*.workers.dev`). Puedes elegir el prefijo que quieras (por ejemplo `tu-nombre.workers.dev`) y confirmarlo.

Ahora elige **una de las dos opciones** siguientes para publicar el Worker `cloudflare-worker/worker.js`:

---

### Opción A: Desde el Panel Web (Dashboard UI — la más rápida, sin instalar nada)

1. En **Workers & Pages**, haz clic en **Create** -> pestaña **Workers** -> **Start with Hello World!** (o **Create Worker**).
2. En **Name**, escribe **`carta-digital`** (tu URL será `https://carta-digital.<tu-subdominio>.workers.dev`) y haz clic en **Deploy**.
3. En la siguiente pantalla haz clic en **Edit code** (arriba a la derecha).
4. Borra todo el código de ejemplo que aparece en el editor y **pega el contenido exacto** del archivo `cloudflare-worker/worker.js` de la rama `produccion`:

```javascript
/**
 * CLOUDFLARE WORKER GRATUITO (SIN COMPRAR DOMINIO)
 * Actúa como Proxy Inverso + Borde de Seguridad HTTPS (TLS 1.3) en Cloudflare
 * apuntando hacia tu infraestructura AWS (ALB / EC2 con Docker - OWASP ASVS v5.0 Nivel 3).
 */

function normalizeEc2Origin(rawOrigin) {
  let origin = String(rawOrigin || '').trim();
  if (!origin || origin.includes('TU_IP_PUBLICA_EC2')) {
    return null;
  }
  if (!/^https?:\/\//i.test(origin)) {
    origin = 'http://' + origin;
  }
  // Cloudflare Workers bloquea fetch() directo a IPs numéricas con Error 1003.
  // Convertimos automáticamente http://A.B.C.D a http://A.B.C.D.sslip.io (DNS comodín gratuito que resuelve a la misma IP)
  return origin.replace(
    /^(https?:\/\/)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?(\/.*)?$/i,
    '$1$2.sslip.io$3$4'
  );
}

export default {
  async fetch(request, env) {
    const rawOrigin = env.EC2_ORIGIN_URL || 'http://TU_IP_PUBLICA_EC2';
    const ec2Origin = normalizeEc2Origin(rawOrigin);

    if (!ec2Origin) {
      return new Response(
        'Falta configurar la IP publica de tu AWS EC2 en EC2_ORIGIN_URL (Settings -> Variables and Secrets o en la linea 27 de worker.js).',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const incomingUrl = new URL(request.url);

    // Regla WAF de Borde (ASVS v5.0 V14): Bloquear acceso a rutas ocultas o escáneres
    const blockedPaths = ['/.env', '/.git', '/wp-admin', '/phpmyadmin'];
    if (blockedPaths.some((p) => incomingUrl.pathname.toLowerCase().includes(p))) {
      return new Response('Forbidden by Cloudflare ASVS 5.0 Edge Filter', { status: 403 });
    }

    // Construir URL hacia el contenedor Front-End en AWS (ALB o EC2)
    const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, ec2Origin);

    const modifiedHeaders = new Headers(request.headers);
    modifiedHeaders.delete('Host');
    modifiedHeaders.set('X-Forwarded-Proto', 'https');
    modifiedHeaders.set('X-Forwarded-Host', incomingUrl.host);

    const proxyRequest = new Request(targetUrl.toString(), {
      method: request.method,
      headers: modifiedHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
      redirect: 'manual'
    });

    const response = await fetch(proxyRequest);

    // Reforzar Cabeceras de Seguridad OWASP ASVS v5.0 Nivel 3 en el borde de Cloudflare
    const secureHeaders = new Headers(response.headers);
    secureHeaders.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    secureHeaders.set('X-Frame-Options', 'DENY');
    secureHeaders.set('X-Content-Type-Options', 'nosniff');
    secureHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Si el servidor redirige a /carta o /carrito, mantener el dominio del Worker
    const location = secureHeaders.get('Location');
    if (location && location.startsWith('/')) {
      secureHeaders.set('Location', `${incomingUrl.origin}${location}`);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: secureHeaders
    });
  }
};
```

5. Haz clic en **Deploy** (arriba a la derecha) y luego vuelve atrás al panel del Worker `carta-digital`.
6. Ve a la pestaña **Settings** -> **Variables and Secrets** -> clic en **+ Add**:
   - **Type:** `Text` *(Runtime variable)*
   - **Variable name:** `EC2_ORIGIN_URL`
   - **Value:** pega el valor impreso por Script 1:
     - **Opción recomendada (Load Balancer + Auto Scaling):** `http://<LOAD_BALANCER_DNS>` (output `cloudflare_origin_url_alb`)
     - **Opción alternativa (EC2 Primaria directa):** `http://<ELASTIC_IP>.sslip.io` (output `cloudflare_origin_url_eip`)
7. Haz clic en **Deploy** / **Save** para aplicar la variable en tiempo de ejecución.

---

### Opción B: Conectando GitHub (rama `produccion`) o usando Wrangler CLI

#### B.1. Conexión directa con GitHub en Cloudflare Dashboard (sin terminal)

Si tienes un *fork* o acceso al repositorio en tu GitHub:
1. En Cloudflare Dashboard ve a **Workers & Pages -> Create -> Import a repository** y autoriza tu cuenta de GitHub.
2. Selecciona el repositorio `trabajo_desarrollo_seguro` y configura:
   - **Project name:** `carta-digital`
   - **Production branch:** `produccion`
   - **Build command:** *(déjalo vacío)*
   - **Deploy command:** `npx wrangler deploy`
   - **Root directory** (en *Advanced settings*): `/` (o `cloudflare-worker`; en la rama `produccion` ambos tienen `wrangler.toml`).
3. Haz clic en **Save and Deploy**.
4. Una vez desplegado, ve a **Settings -> Variables and Secrets -> + Add** (sección *Runtime*, **no** *Build variables*) y agrega:
   - **Variable name:** `EC2_ORIGIN_URL`
   - **Value:** `http://<LOAD_BALANCER_DNS>` o `http://<ELASTIC_IP>.sslip.io`
5. Guarda los cambios.

#### B.2. Desde terminal con Wrangler CLI (alternativa rápida)

Requiere Node.js 20+ instalado localmente:

```bash
git checkout produccion
npx wrangler login
npx wrangler deploy
```

Luego agrega la variable `EC2_ORIGIN_URL` en el Dashboard (**Settings -> Variables and Secrets**) o como secreto desde CLI:

```bash
npx wrangler secret put EC2_ORIGIN_URL
# Cuando te lo pida, pega: http://<LOAD_BALANCER_DNS>   (o http://<ELASTIC_IP>.sslip.io)
```

---

## 5. Paso 3: Probar la Aplicación Desplegada (`/carta`, `/carrito`, `/admin` y los 6 CRUDs)

Abre tu navegador y entra a tu URL HTTPS gratuita de Cloudflare:

```text
https://carta-digital.<tu-subdominio>.workers.dev/carta
```

### 5.1. Qué comprobar como usuario final
1. **URL limpia sin IDs:** Verifica que la dirección permanece en `/carta` (sin `?id=` ni `?keyid=`).
2. **Selector de Restaurantes:** Cambia entre los restaurantes disponibles en el selector superior de la carta y comprueba que cambian sus menús, categorías, productos e imágenes.
3. **Carrito (`/carrito`):** Agrega ítems al carrito y navega a `https://carta-digital.<tu-subdominio>.workers.dev/carrito`.

### 5.2. Entrar como Administrador y probar los 6 CRUDs (`/admin`)

1. Haz clic en el botón **Iniciar Sesión** en la barra superior (o ve directamente a `https://carta-digital.<tu-subdominio>.workers.dev/admin` e inicia sesión desde la barra superior).
2. Ingresa las credenciales iniciales de Administrador definidas en `database/init.sql`:
   - **Correo:** `admin@gmail.com`
   - **Contraseña:** `admin01`
3. Entra a:
   ```text
   https://carta-digital.<tu-subdominio>.workers.dev/admin
   ```
4. Verás el **Panel Administrativo CRUD** con:
   - El selector **Restaurante en edición** para operar sobre cualquier restaurante sin exponer IDs numéricos.
   - Las **6 pestañas CRUD completas**:
     1. **Restaurantes**
     2. **Cartas / Menús**
     3. **Categorías**
     4. **Ítems / Productos**
     5. **Comentarios**
     6. **Usuarios**

> [!WARNING]
> Si planeas dejar el entorno encendido de forma permanente, crea un nuevo usuario administrador desde la pestaña **Usuarios** con una contraseña robusta y desactiva/cambia la contraseña por defecto de `admin@gmail.com`.

### 5.3. Comprobar cabeceras de seguridad ASVS v5.0 en el borde

```bash
curl -I https://carta-digital.<tu-subdominio>.workers.dev/carta
```

Deberás ver cabeceras como `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` y `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 6. Opcional: Configurar Secretos de GitHub Actions para CI/CD Automático

Si quieres que cada `git push` a la rama `produccion` actualice automáticamente tanto el código Docker en tu EC2 primaria como el Worker de Cloudflare usando el workflow `.github/workflows/deploy-produccion.yml`:

1. En tu repositorio de GitHub ve a **Settings -> Secrets and variables -> Actions -> New repository secret**.
2. Crea los **3 secretos de AWS EC2** usando los datos generados por Script 1:

| Nombre del Secret en GitHub | Valor a pegar |
| :--- | :--- |
| **`AWS_EC2_HOST`** | El valor de `elastic_ip` (ejemplo: `54.123.45.67`) |
| **`AWS_EC2_USER`** | `ubuntu` |
| **`AWS_EC2_SSH_KEY`** | El contenido **completo** del archivo `infra/aws/pnk-ec2-deploy-key.pem` (incluyendo las líneas `-----BEGIN OPENSSH PRIVATE KEY-----` y `-----END OPENSSH PRIVATE KEY-----`) |

3. *(Opcional)* Si también deseas que GitHub Actions re-despliegue el Cloudflare Worker por CLI en cada push a `produccion`, agrega:
   - **`CLOUDFLARE_ACCOUNT_ID`**: visible en Cloudflare Dashboard -> **Workers & Pages -> Overview** (barra derecha, *Account details*).
   - **`CLOUDFLARE_API_TOKEN`**: creado en **Create API Token -> Use template "Edit Cloudflare Workers"**.

---

## 7. Paso 4: Destruir toda la Infraestructura AWS con Script 2 (Cero Cobros)

Cuando termines tus pruebas, demostración o evaluación, **ejecuta Script 2** para eliminar el 100% de los recursos en AWS y evitar cualquier cargo futuro (VPC, Subredes, IGW, Security Groups, EC2 primaria, Elastic IP, Application Load Balancer, Auto Scaling Group, Amazon RDS PostgreSQL y par de llaves SSH en AWS).

Desde la carpeta `infra/aws`:

- **Linux / macOS / AWS CloudShell / Git Bash:**
  ```bash
  ./2-destruir-aws.sh
  ```
  *(O `./2-destruir-aws.sh -y` para omitir la confirmación interactiva).*

- **Windows (PowerShell):**
  ```powershell
  .\2-destruir-aws.ps1
  ```
  *(O `.\2-destruir-aws.ps1 -Force` para omitir la confirmación interactiva).*

### Qué hace Script 2
1. Ejecuta `terraform destroy -auto-approve`.
2. Elimina los archivos temporales locales generados durante el despliegue (`pnk-ec2-deploy-key.pem` y `outputs-despliegue.json`).
3. Confirma en consola que toda la infraestructura fue destruida (`$0 en cargos continuos de AWS`).

> [!TIP]
> Como buena práctica adicional, puedes abrir brevemente en la Consola de AWS (región `us-east-1`): **EC2 -> Instances**, **EC2 -> Load Balancers**, **EC2 -> Elastic IPs** y **RDS -> Databases** para confirmar visualmente que ya no queda ningún recurso activo. En Cloudflare puedes dejar el Worker o eliminarlo desde **Settings -> Delete** (el plan gratuito de Cloudflare Workers no tiene cobro mensual).

---

## 8. Solución de Problemas Frecuentes (Troubleshooting)

| Síntoma | Causa probable | Cómo resolverlo |
| :--- | :--- | :--- |
| **`Error 502` o `503` al abrir Cloudflare justo después de Script 1** | La EC2 sigue descargando paquetes y compilando las imágenes Docker (~3 a 5 min). | Espera 2-3 minutos y prueba `curl -i http://<ELASTIC_IP>/health`. Si tarda más, entra por SSH y ejecuta `sudo tail -f /var/log/pnk-userdata.log`. |
| **Cloudflare muestra `Error 1003: Direct IP access not allowed`** | Se ingresó la IP sola en un servicio sin usar `.sslip.io`. | Usa el valor `cloudflare_origin_url_alb` (`http://<ALB_DNS>`) o `cloudflare_origin_url_eip` (`http://<ELASTIC_IP>.sslip.io`) en la variable `EC2_ORIGIN_URL`. |
| **Cloudflare dice `"Falta configurar la IP publica de tu AWS EC2 en EC2_ORIGIN_URL"`** | No se guardó la variable en *Runtime* (`Variables and Secrets`) o se puso solo en *Build variables*. | Ve al Worker -> **Settings -> Variables and Secrets**, crea `EC2_ORIGIN_URL` de tipo `Text` y vuelve a desplegar (**Deploy**). |
| **`aws sts get-caller-identity` falla (`InvalidClientTokenId` / `ExpiredToken`)** | En AWS Academy (`LabRole`), faltó `aws_session_token` (por usar solo `aws configure`) o el token temporal expiró (~4 horas). | Abre **AWS Details -> AWS CLI: Show -> Copy**, pega el bloque `[default]` completo en `~/.aws/credentials` (Windows: `notepad "$env:USERPROFILE\.aws\credentials"`), fija región `us-east-1` (`aws configure set region us-east-1`) y valida con `aws sts get-caller-identity`. |
| **`AccessDenied` al intentar crear usuarios o roles en IAM** | AWS Academy Learner Lab (`LabRole` / `LabStudent`) prohíbe `iam:CreateUser` y `iam:CreateRole`. | No entres a IAM a crear usuarios ni ejecutes scripts que creen roles. Usa **AWS CloudShell** o **AWS Details** (`LabRole`), y mantén `iam_instance_profile` vacío (por defecto) o usa `"LabInstanceProfile"` solo si se requiere. |
| **Windows PowerShell bloquea `.\1-desplegar-aws.ps1`** | Política `ExecutionPolicy` restringida en Windows. | Ejecuta `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` en la misma ventana de PowerShell y vuelve a correr el script. |
| **SSH falla por permisos demasiado abiertos en `.pem` (Linux/macOS)** | OpenSSH rechaza llaves privadas legibles por otros usuarios. | Ejecuta `chmod 600 infra/aws/pnk-ec2-deploy-key.pem` antes de conectarte por SSH. |
| **No existe la carpeta `infra/aws` después de hacer `git clone`** | Hiciste `git clone` sin indicar la rama y Git descargó la rama antigua `main` (PHP). | Ejecuta `git fetch origin produccion:produccion && git checkout produccion`, o clona directamente con `git clone -b produccion --single-branch https://github.com/stxtiz/trabajo_desarrollo_seguro.git`. |
