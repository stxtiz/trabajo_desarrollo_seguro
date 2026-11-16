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
5. [Paso 3: Probar la Aplicación, los 6 CRUDs y la Alta Disponibilidad (Auto Scaling)](#5-paso-3-probar-la-aplicación-desplegada-carta-carrito-admin-y-los-6-cruds)
   - [5.4. Cómo probar la Alta Disponibilidad y Auto-Recuperación (Terminar una instancia EC2)](#54-cómo-probar-la-alta-disponibilidad-y-auto-recuperación-terminar-una-instancia-ec2)
6. [Opcional: Configurar Secretos de GitHub Actions para CI/CD Automático](#6-opcional-configurar-secretos-de-github-actions-para-cicd-automático)
7. [Paso 4: Destruir toda la Infraestructura AWS con Script 2 (Cero Cobros)](#7-paso-4-destruir-toda-la-infraestructura-aws-con-script-2-cero-cobros)
8. [Solución de Problemas Frecuentes (Troubleshooting)](#8-solución-de-problemas-frecuentes-troubleshooting)

---

## 1. Arquitectura del Proyecto y Seguridad (OWASP ASVS v5.0 Nivel 3)

La aplicación separa físicamente el **Front-End** (SPA en React 19 + Vite, servida por un Express endurecido en el puerto interno `8080`) y el **Back-End MVC** (API REST en Node.js + Express en el puerto interno `3000`, nunca expuesto a Internet), conectados a una base de datos **Amazon RDS PostgreSQL 16** cifrada y aislada en subredes privadas sin acceso desde Internet.

### Diagrama de Arquitectura

```mermaid
flowchart TB
    User["Usuario Final (Navegador Web)"] -->|"HTTPS TLS 1.3"| CF["Cloudflare Worker Gratuito (*.workers.dev)<br/>WAF Borde + Cabeceras ASVS 5.0<br/>EC2_ORIGIN_URL = http://ALB_DNS"]

    subgraph AWS["AWS Cloud - VPC 10.20.0.0/16 (pnk-carta-digital-vpc)"]
        IGW["Internet Gateway (IGW)"]
        CF -->|"HTTP Puerto 80 (DNS fijo del ALB)"| IGW

        subgraph PublicSubnets["Subredes Públicas en 2 AZs (10.20.1.0/24 y 10.20.2.0/24)"]
            ALB["Application Load Balancer (pnk-carta-digital-alb)<br/>SG: alb_sg (HTTP :80) -> Healthcheck /health"]
            IGW --> ALB
            IGW -.->|"SSH :22 o alternativa *.sslip.io (Elastic IP flotante)"| EC2A

            subgraph ASG["Auto Scaling Group: pnk-carta-digital-asg (2 activas por defecto, máx. 3, CPU 70%)"]
                subgraph EC2A["Instancia EC2 #1 (AZ-a, Ubuntu 24.04 t3.micro)"]
                    FE1["frontend-prod (:80 -> :8080)"] -->|"/api interno"| BE1["backend-prod (:3000)"]
                end
                subgraph EC2B["Instancia EC2 #2 (AZ-b, Ubuntu 24.04 t3.micro)"]
                    FE2["frontend-prod (:80 -> :8080)"] -->|"/api interno"| BE2["backend-prod (:3000)"]
                end
            end

            ALB -->|"HTTP :80 (Cero Downtime)"| EC2A
            ALB -->|"HTTP :80 (Cero Downtime)"| EC2B
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
- **Alta Disponibilidad y Auto-Recuperación:** Todas las instancias EC2 pertenecen al **Auto Scaling Group (`pnk-carta-digital-asg`)** con **2 instancias activas en 2 Zonas de Disponibilidad** detrás del **Application Load Balancer (`pnk-carta-digital-alb`)**. Si una instancia falla o es terminada, el ALB enruta el 100% del tráfico a la instancia sana con **cero downtime** mientras Auto Scaling levanta automáticamente el reemplazo y re-asocia la Elastic IP.
- **Autenticación y sesiones en servidor:** Contraseñas con PBKDF2-HMAC-SHA512 / Argon2id + `PASSWORD_PEPPER` de 256+ bits generado aleatoriamente, protección CSRF (*Synchronizer Token Pattern*) y RBAC estricto para los 6 CRUDs en `/admin`.

---

## 2. Prerrequisitos desde Cero (AWS Academy LabRole y Herramientas)

Para ejecutar la automatización necesitas:
1. Acceso a **AWS Academy Learner Lab** (rol **`LabRole` / `LabStudent`**) o una cuenta estándar de AWS.
2. **AWS CloudShell** (en el navegador, sin instalar nada) o **Git, AWS CLI v2 y Terraform** instalados en tu PC.

> [!IMPORTANT]
> **Si usas AWS Academy Learner Lab (`LabRole` / `LabStudent`):**
> - **NO entres a IAM ni intentes crear usuarios (`IAM -> Users -> Create user`).** En Learner Lab la acción `iam:CreateUser` está prohibida y siempre arrojará **`AccessDenied`**.
> - Tampoco necesitas crear roles IAM: la infraestructura en `infra/aws/` **crea cero recursos `aws_iam_*`**. Por defecto utiliza el Instance Profile preexistente `LabInstanceProfile` de AWS Academy para que las instancias del Auto Scaling Group puedan auto-re-asociar la Elastic IP; y si ejecutas Script 1 en una cuenta personal donde `LabInstanceProfile` no existe, el script detecta automáticamente tu cuenta y pasa `-var="iam_instance_profile="`.
> - La región obligatoria en AWS Academy Learner Lab es **`us-east-1` (N. Virginia)**.

---

### 2.1. Iniciar AWS Academy Learner Lab (`us-east-1`)

1. Entra a tu curso en **AWS Academy**, abre **Learner Lab** y haz clic en **Start Lab**.
2. Espera a que el indicador circular junto a **`AWS`** se ponga en **verde** (puede tardar 1-2 minutos la primera vez).
3. Haz clic en **`AWS`** para abrir la Consola de AWS y verifica arriba a la derecha que la región seleccionada sea **`us-east-1` (N. Virginia)**.

Ahora elige **una de las dos opciones** para ejecutar el despliegue:

---

### 2.2. Opción A (Más rápida, dentro del navegador): AWS CloudShell

**AWS CloudShell** es una terminal Linux gratuita dentro de la Consola de AWS que **hereda automáticamente tus credenciales temporales de `LabRole`** (no necesitas copiar llaves ni configurar `~/.aws/credentials`) y ya trae **`git`**, **`curl`**, **`unzip`** y **`aws` CLI** instalados.

1. En la Consola de AWS (asegurando que la región arriba a la derecha sea **`us-east-1`**), haz clic en el ícono **`>_` (CloudShell)** en la barra superior.
2. **No necesitas instalar Terraform manualmente:** los scripts `1-desplegar-aws.sh` y `2-destruir-aws.sh` incluyen `export PATH="$HOME/bin:$PATH"` y **descargan e instalan automáticamente Terraform `1.11.2` en `~/bin/terraform` (dentro de tu directorio persistente `$HOME`)** si no está presente. A diferencia de `/usr/bin` (que se borra cuando CloudShell se reinicia o expira por inactividad), **`$HOME/bin` persiste permanentemente entre sesiones de CloudShell**.
   - *(Opcional)* Si prefieres instalarlo en `~/bin` antes de correr los scripts, puedes usar este comando de una sola línea:
     ```bash
     mkdir -p ~/bin && ARCH=$(uname -m) && TF_ARCH=$([ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ] && echo arm64 || echo amd64) && curl -fsSL "https://releases.hashicorp.com/terraform/1.11.2/terraform_1.11.2_linux_${TF_ARCH}.zip" -o /tmp/tf.zip && unzip -o -q /tmp/tf.zip -d ~/bin && chmod +x ~/bin/terraform && rm -f /tmp/tf.zip && export PATH="$HOME/bin:$PATH" && terraform -version
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
  *(Opciones opcionales: `--keep-rds` para conservar y reutilizar un RDS existente, `--delete-rds` para eliminar un RDS previo y recrear todo desde cero, `--without-rds` para desplegar usando PostgreSQL local en Docker sin RDS, o `-y` para modo no interactivo).*

- **Windows (PowerShell):**
  ```powershell
  .\1-desplegar-aws.ps1
  ```
  *(Opciones opcionales: `-KeepRds`, `-DeleteRds`, `-WithoutRds`, `-Force`. Si PowerShell bloquea la ejecución por política de scripts locales, ejecuta primero en esa misma ventana: `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` y vuelve a ejecutar `.\1-desplegar-aws.ps1`).*

> [!TIP]
> **Opción inteligente de Amazon RDS al desplegar:**
> - **Si ya existe un RDS (`pnk-carta-digital-postgres`) en AWS** (por ejemplo, tras usar Script 2 conservando RDS o tras reiniciar CloudShell), Script 1 te preguntará si deseas **conservar y reutilizar el RDS existente** (`[N]`, recomendado: mantiene todos tus datos, sincroniza credenciales y termina en ~2-3 min) o **eliminarlo y recrear todo desde cero** (`[s]`, ~10 min).
> - **Si NO existe un RDS en AWS**, Script 1 te preguntará si deseas **crear Amazon RDS PostgreSQL 16** (`[S]`, recomendado) o **desplegar sin RDS usando PostgreSQL en contenedor Docker local** (`[n]`, ~2 min para pruebas rápidas).

### 3.3. ¿Qué crea Script 1 automáticamente?

Script 1 ejecuta `terraform init`, `terraform validate`, `terraform apply -auto-approve` y asocia inmediatamente la **Elastic IP** a la primera instancia activa del Auto Scaling Group. Tardará entre **6 y 10 minutos** (principalmente mientras Amazon RDS aprovisiona el motor PostgreSQL 16) y creará de forma automática:

1. **Red aislada (`vpc.tf`):**
   - VPC `pnk-carta-digital-vpc` (`10.20.0.0/16`) e Internet Gateway (`pnk-carta-digital-igw`).
   - 2 Subredes Públicas (`10.20.1.0/24`, `10.20.2.0/24`) en **2 Zonas de Disponibilidad** con ruta a Internet.
   - 2 Subredes Privadas Aisladas (`10.20.11.0/24`, `10.20.12.0/24`) sin ruta a Internet.
2. **Firewalls OWASP ASVS v5.0 Nivel 3 (`security.tf`):**
   - `alb_sg`: recibe HTTP `:80` y solo reenvía hacia `ec2_sg`.
   - `ec2_sg`: recibe HTTP `:80` y SSH `:22`. Los puertos `3000` (Backend) y `5432` (PostgreSQL) **nunca se exponen**.
   - `rds_sg`: acepta TCP `:5432` **exclusivamente** desde `ec2_sg`.
3. **Llaves y Secretos Criptográficos (`main.tf`):**
   - Par de llaves SSH **ED25519** guardado localmente en `infra/aws/pnk-ec2-deploy-key.pem` (con permisos `0600`).
   - Contraseña aleatoria de 32 caracteres para RDS (`db_password`) y `password_pepper` de 48 caracteres compartidos por todos los nodos del Auto Scaling Group.
4. **Base de datos Amazon RDS PostgreSQL 16 (`rds.tf`):**
   - Instancia `db.t3.micro` con 20 GiB `gp3`, cifrado en reposo (`storage_encrypted = true`), `publicly_accessible = false`, BD `pnk_security` y usuario `pnk_prod_user`.
5. **Cómputo 100% Auto-Recuperable, Balanceo y Escalado (`compute_alb_asg.tf` + `templates/user_data.sh.tftpl`):**
   - **Application Load Balancer (`pnk-carta-digital-alb`)** + Target Group con healthcheck `/health` (`HTTP 200`). Su DNS público (`http://<ALB_DNS>`) **nunca cambia** aunque se terminen o reemplacen instancias EC2.
   - **Auto Scaling Group (`pnk-carta-digital-asg`)** que gestiona **el 100% de las instancias EC2** (`2` instancias Ubuntu 24.04 LTS `t3.micro` activas por defecto en 2 Zonas de Disponibilidad: `min=2`, `desired=2`, `max=3`, política de escalado al 70% de CPU e **IMDSv2 obligatorio**). Si terminas cualquier instancia EC2, el ALB enruta el 100% del tráfico a la instancia sana con **cero downtime**, y Auto Scaling lanza automáticamente una copia de reemplazo.
   - **Elastic IP fija flotante (`aws_eip.primary`):** se asocia automáticamente a una instancia activa del ASG tras `terraform apply`, y cada instancia nueva creada por Auto Scaling verifica mediante IMDSv2 + AWS CLI si la Elastic IP quedó libre o pertenecía a una instancia terminada para re-asociarla automáticamente.
   - **Bootstrap automático (`user_data`):** crea 2 GB de Swap, instala AWS CLI, Docker Engine + Compose v2 + `postgresql-client`, clona la rama `produccion` en `/opt/carta-digital`, descarga el certificado SSL oficial de Amazon RDS (`certs/rds-global-bundle.pem`), genera `.env` (`0600`), espera a RDS con `pg_isready`, inicializa `database/init.sql` **solo si la tabla `public.usuarios` no existe** (protegido con `pg_advisory_lock` para no borrar datos al escalar o reemplazar nodos), ejecuta `docker compose -f docker-compose.rds.yml up -d --build` y verifica la auto-asociación de la Elastic IP.

### 3.4. Cómo leer la salida de Script 1

Al terminar, Script 1 guarda `infra/aws/outputs-despliegue.json` e imprime en pantalla un resumen como este:

| Campo impreso por Script 1 | Variable Terraform (`outputs.tf`) | Para qué se usa |
| :--- | :--- | :--- |
| **[PRINCIPAL] EC2_ORIGIN_URL (ALB)** | `cloudflare_origin_url_alb` | **Valor recomendado (`http://<ALB_DNS>`)** para configurar `EC2_ORIGIN_URL` en Cloudflare. Garantiza **cero downtime** y un **DNS permanente que nunca cambia** si terminas o reemplazas una EC2 en Auto Scaling. |
| **Load Balancer URL (/carta)** | `load_balancer_dns` | URL directa de prueba HTTP en AWS (`http://<ALB_DNS>/carta`). |
| **Elastic IP fija (EIP, ASG)** | `elastic_ip` | IP fija flotante asignada a una instancia activa del ASG (se usa para SSH y `AWS_EC2_HOST`). |
| **[Alternativa] Origin via EIP** | `cloudflare_origin_url_eip` | Alternativa directa (`http://<ELASTIC_IP>.sslip.io`) si no deseas pasar por el ALB (nota: si la instancia que tenía la EIP es terminada, hay un breve corte mientras el nodo de reemplazo toma la EIP). |
| **Amazon RDS Endpoint** | `rds_endpoint` | Dirección privada de PostgreSQL en RDS (solo accesible desde las EC2). |
| **Llave SSH Privada (.pem)** | `ssh_private_key_path` | Ruta `infra/aws/pnk-ec2-deploy-key.pem` (para SSH y `AWS_EC2_SSH_KEY`). |
| **Comando SSH** | `ssh_command` | Comando listo: `ssh -i infra/aws/pnk-ec2-deploy-key.pem ubuntu@<EIP>`. |

### 3.5. Verificar que Docker terminó de compilar e iniciar

Aunque Terraform ya haya terminado, las 2 instancias EC2 del Auto Scaling Group pueden tardar **~3 a 5 minutos adicionales** en terminar de compilar las imágenes `frontend-prod` y `backend-prod`.

Verifica el estado ejecutando (reemplaza `<ALB_DNS>` o `<ELASTIC_IP>` por los valores impresos por Script 1):

- **En Linux / macOS / CloudShell:**
  ```bash
  curl -i http://<ALB_DNS>/health
  curl -i http://<ELASTIC_IP>/health
  ```
- **En Windows PowerShell:**
  ```powershell
  curl.exe -i http://<ALB_DNS>/health
  curl.exe -i http://<ELASTIC_IP>/health
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
   - **Value:** pega el valor principal impreso por Script 1:
     - **Opción recomendada (Load Balancer + Auto Scaling, cero downtime):** `http://<LOAD_BALANCER_DNS>` (output `cloudflare_origin_url_alb`, por ejemplo `http://pnk-carta-digital-alb-123456.us-east-1.elb.amazonaws.com`)
     - **Opción alternativa (Elastic IP flotante directa):** `http://<ELASTIC_IP>.sslip.io` (output `cloudflare_origin_url_eip`)
7. Haz clic en **Deploy** / **Save** para aplicar la variable en tiempo de ejecución.

> [!IMPORTANT]
> **¿Por qué debes usar `http://<LOAD_BALANCER_DNS>` (`cloudflare_origin_url_alb`) en `EC2_ORIGIN_URL`?**  
> Porque con esta configuración **NUNCA tendrás que reconfigurar Cloudflare ni cambiar ningún DNS cuando se termine o reemplace una instancia EC2**: el Application Load Balancer conserva exactamente el mismo DNS (`pnk-carta-digital-alb-...us-east-1.elb.amazonaws.com`), redirige automáticamente el tráfico **sin tiempo de caída** a la segunda instancia sana del Auto Scaling Group, y AWS Auto Scaling levanta en paralelo una copia de reemplazo (la cual también re-asocia la Elastic IP si la instancia terminada la tenía asignada).

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
   - **Value:** `http://<LOAD_BALANCER_DNS>` *(recomendado para cero downtime y DNS fijo frente a Auto Scaling)* o `http://<ELASTIC_IP>.sslip.io`
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
# Cuando te lo pida, pega el DNS del ALB: http://<LOAD_BALANCER_DNS>
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

### 5.4. Cómo probar la Alta Disponibilidad y Auto-Recuperación (Terminar una instancia EC2)

Gracias a que **el 100% de las instancias EC2** están gestionadas por **`pnk-carta-digital-asg`** (`2` instancias activas en `2` Zonas de Disponibilidad detrás de `pnk-carta-digital-alb`), puedes simular la caída total de un servidor sin afectar a los usuarios ni tocar Cloudflare:

1. **Verifica el estado inicial:** abre `https://carta-digital.<tu-subdominio>.workers.dev/carta` en tu navegador y comprueba que la carta y el inicio de sesión funcionan normalmente.
2. **Abre EC2 en la Consola de AWS (`us-east-1`):** ve a **EC2 -> Instances** y verás **2 instancias activas (`Running`)** llamadas `pnk-carta-digital-ec2`, desplegadas en dos Zonas de Disponibilidad distintas (por ejemplo `us-east-1a` y `us-east-1b`).
3. **Termina una de las dos instancias:** selecciona cualquiera de ellas, haz clic en **Instance state -> Terminate (delete) instance** y confirma **Terminate**.
4. **Comprueba el Cero Downtime en Cloudflare (sin cambiar DNS):** recarga inmediatamente `https://carta-digital.<tu-subdominio>.workers.dev/carta` (o ejecuta `curl -i https://carta-digital.<tu-subdominio>.workers.dev/health`). La aplicación **sigue respondiendo `200 OK` al instante**, porque el Application Load Balancer (`http://<ALB_DNS>`) mantiene su DNS fijo y desvía el 100% del tráfico hacia la instancia sobreviviente **sin tener que modificar `EC2_ORIGIN_URL` ni ningún registro DNS**.
5. **Observa el reemplazo automático en Auto Scaling:** tras **30 a 90 segundos**, refresca **EC2 -> Instances** (o entra en **EC2 -> Auto Scaling Groups -> pnk-carta-digital-asg -> Activity**):
   - Auto Scaling detecta que bajó de la capacidad deseada (`2`) y lanza automáticamente una **nueva instancia de reemplazo** (`Pending` -> `Running`).
   - La nueva instancia ejecuta `user_data`, se conecta a **Amazon RDS PostgreSQL** (conservando intactos todos tus restaurantes, cartas, usuarios y comentarios), **re-asocia la Elastic IP automáticamente** si la instancia terminada era quien la tenía asignada, y tras ~3-5 minutos de compilación Docker pasa a `healthy` en el Target Group del ALB.

---

## 6. Opcional: Configurar Secretos de GitHub Actions para CI/CD Automático

Si quieres que cada `git push` a la rama `produccion` actualice automáticamente tanto el código Docker en tu instancia EC2 asociada a la Elastic IP como el Worker de Cloudflare usando el workflow `.github/workflows/deploy-produccion.yml`:

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

## 7. Paso 4: Destruir la Infraestructura AWS con Script 2 (Con o sin RDS)

Cuando termines tus pruebas, demostración o evaluación, **ejecuta Script 2** para destruir los recursos en AWS. Al iniciarlo de forma interactiva, Script 2 te preguntará si deseas **eliminar también Amazon RDS (`pnk-carta-digital-postgres`)** o **conservar el RDS y su VPC base** para reutilizarlos rápido (y sin perder tus datos) en el próximo despliegue:

Desde la carpeta `infra/aws`:

- **Linux / macOS / AWS CloudShell / Git Bash:**
  ```bash
  ./2-destruir-aws.sh
  ```
  *(Opciones opcionales: `./2-destruir-aws.sh --keep-rds` para destruir solo EC2/ASG/ALB/EIP/KeyPair conservando RDS y VPC; `./2-destruir-aws.sh --delete-rds` para destruir el 100% incluyendo RDS y VPC; agrega `-y` para omitir confirmaciones).*

- **Windows (PowerShell):**
  ```powershell
  .\2-destruir-aws.ps1
  ```
  *(Opciones opcionales: `.\2-destruir-aws.ps1 -KeepRds`, `.\2-destruir-aws.ps1 -DeleteRds`, o `-Force` para omitir confirmaciones).*

### Qué hace Script 2 (100% Stateless-Proof / a prueba de pérdida de sesión)
1. **Paso 1 — Terraform Destroy (si se eliminará RDS y existe estado local):** Si elegiste eliminar RDS y `terraform.tfstate` existe y no está vacío, ejecuta `terraform destroy -auto-approve`. Si elegiste conservar RDS, omite `terraform destroy` para proteger Amazon RDS y su red base. Si cerraste AWS CloudShell o perdiste `terraform.tfstate`, pasa automáticamente al Paso 2.
2. **Paso 2 — Barrido directo por AWS CLI (Stateless Sweep):** Consulta directamente la API de AWS (`us-east-1`) por el prefijo `pnk-carta-digital` y elimina en el orden exacto de dependencias:
   - Auto Scaling Group (`pnk-carta-digital-asg --force-delete`) y Launch Templates (`pnk-carta-digital-lt-*`).
   - Instancias EC2 (`pnk-carta-digital*` o dentro de la VPC) esperando estado `terminated`.
   - Application Load Balancer (`pnk-carta-digital-alb`) y Target Group (`pnk-carta-digital-tg`).
   - Elastic IPs (`pnk-carta-digital*`, desasociando y liberando cada asignación).
   - Par de llaves SSH (`pnk-carta-digital-deploy-key`).
   - **Si elegiste eliminar RDS (`--delete-rds` / `-DeleteRds`):** elimina Amazon RDS PostgreSQL (`pnk-carta-digital-postgres`, desactivando `deletion-protection` y borrando sin snapshot final), DB Subnet Group (`pnk-carta-digital-rds-subnet-group`), ENIs residuales, Security Groups no-default, Subredes, Route Tables, Internet Gateways y la VPC (`pnk-carta-digital-vpc`).
   - **Si elegiste conservar RDS (`--keep-rds` / `-KeepRds`):** conserva intactos Amazon RDS, DB Subnet Group, VPC, Subredes y Security Groups para que tu próximo `./1-desplegar-aws.sh` reutilice la base de datos en ~2-3 minutos.
3. **Paso 3 — Limpieza local:** Elimina `terraform.tfstate`, `terraform.tfstate.backup`, `pnk-ec2-deploy-key.pem` y `outputs-despliegue.json`.

> [!NOTE]
> Si ejecutas **Script 1** (`./1-desplegar-aws.sh` o `.\1-desplegar-aws.ps1`) mientras existe un RDS previo (o recursos huérfanos sin `terraform.tfstate`), Script 1 detectará el estado real en AWS y te preguntará si deseas **conservar y reutilizar el RDS existente** (`--keep-rds`) o **eliminarlo para recrear desde cero** (`--delete-rds`).

> [!TIP]
> Como buena práctica adicional, puedes abrir brevemente en la Consola de AWS (región `us-east-1`): **EC2 -> Instances**, **EC2 -> Load Balancers**, **EC2 -> Elastic IPs** y **RDS -> Databases** para confirmar visualmente que ya no queda ningún recurso activo. En Cloudflare puedes dejar el Worker o eliminarlo desde **Settings -> Delete** (el plan gratuito de Cloudflare Workers no tiene cobro mensual).

---

## 8. Solución de Problemas Frecuentes (Troubleshooting)

| Síntoma | Causa probable | Cómo resolverlo |
| :--- | :--- | :--- |
| **`Error 502` o `503` al abrir Cloudflare justo después de Script 1** | Las instancias EC2 siguen descargando paquetes y compilando las imágenes Docker (~3 a 5 min). | Espera 2-3 minutos y prueba `curl -i http://<ALB_DNS>/health`. Si tarda más, entra por SSH a la Elastic IP y ejecuta `sudo tail -f /var/log/pnk-userdata.log`. |
| **Cloudflare muestra `Error 1003: Direct IP access not allowed`** | Se ingresó la IP sola en un servicio sin usar `.sslip.io`. | Usa el valor `cloudflare_origin_url_alb` (`http://<ALB_DNS>`) o `cloudflare_origin_url_eip` (`http://<ELASTIC_IP>.sslip.io`) en la variable `EC2_ORIGIN_URL`. |
| **Cloudflare dice `"Falta configurar la IP publica de tu AWS EC2 en EC2_ORIGIN_URL"`** | No se guardó la variable en *Runtime* (`Variables and Secrets`) o se puso solo en *Build variables*. | Ve al Worker -> **Settings -> Variables and Secrets**, crea `EC2_ORIGIN_URL` de tipo `Text` con `http://<ALB_DNS>` y vuelve a desplegar (**Deploy**). |
| **`aws sts get-caller-identity` falla (`InvalidClientTokenId` / `ExpiredToken`)** | En AWS Academy (`LabRole`), faltó `aws_session_token` (por usar solo `aws configure`) o el token temporal expiró (~4 horas). | Abre **AWS Details -> AWS CLI: Show -> Copy**, pega el bloque `[default]` completo en `~/.aws/credentials` (Windows: `notepad "$env:USERPROFILE\.aws\credentials"`), fija región `us-east-1` (`aws configure set region us-east-1`) y valida con `aws sts get-caller-identity`. |
| **`AccessDenied` al intentar crear usuarios o roles en IAM** | AWS Academy Learner Lab (`LabRole` / `LabStudent`) prohíbe `iam:CreateUser` y `iam:CreateRole`. | No entres a IAM a crear usuarios ni ejecutes scripts que creen roles. Usa **AWS CloudShell** o **AWS Details** (`LabRole`); Script 1 detecta automáticamente `LabInstanceProfile` en AWS Academy o lo omite en cuentas personales. |
| **Windows PowerShell bloquea `.\1-desplegar-aws.ps1`** | Política `ExecutionPolicy` restringida en Windows. | Ejecuta `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` en la misma ventana de PowerShell y vuelve a correr el script. |
| **SSH falla por permisos demasiado abiertos en `.pem` (Linux/macOS)** | OpenSSH rechaza llaves privadas legibles por otros usuarios. | Ejecuta `chmod 600 infra/aws/pnk-ec2-deploy-key.pem` antes de conectarte por SSH. |
| **No existe la carpeta `infra/aws` después de hacer `git clone`** | Hiciste `git clone` sin indicar la rama y Git descargó la rama antigua `main` (PHP). | Ejecuta `git fetch origin produccion:produccion && git checkout produccion`, o clona directamente con `git clone -b produccion --single-branch https://github.com/stxtiz/trabajo_desarrollo_seguro.git`. |
| **`terraform: command not found` tras reiniciar AWS CloudShell (después de usar `sudo yum install terraform`)** | En AWS CloudShell, el sistema operativo base (`/usr/bin`, paquetes `yum`) es efímero y se reinicia tras expirar la sesión; únicamente `$HOME` (hasta 1 GB) es persistente. | Ejecuta `./1-desplegar-aws.sh` o `./2-destruir-aws.sh`: ambos scripts exportan `PATH="$HOME/bin:$PATH"` e instalan automáticamente Terraform en `$HOME/bin/terraform`, por lo que persiste de forma permanente entre reinicios de CloudShell sin usar `yum`. |
