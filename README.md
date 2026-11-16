# Carta Digital — PNK Security (v3.0)
## Arquitectura Separada Front-End (React 19 + Vite + Express + pnpm) & Back-End MVC (Node.js + Express + PostgreSQL + pnpm) | OWASP ASVS v5.0 Nivel 3

Proyecto reconstruido desde cero eliminando PHP legado, MySQL, jQuery y `$.ajax`, migrado a **React 19 + Vite + React Router + pnpm** en el Front-End (servido en producción por Express endurecido) y **Node.js + Express MVC + pnpm** en el Back-End, conservando **100% idéntico el diseño visual de la interfaz web**, aplicando **ofuscación criptográfica de URLs e IDs** (`/carta`, `/carrito`, `/admin`, tokens `AES-256-CTR + HMAC-SHA256`), **selector dinámico de restaurantes** (`/api/v1/restaurantes`), **6 CRUDs administrativos protegidos por RBAC** (`/admin` y `/api/v1/admin/*` para restaurantes, cartas, categorías, ítems, comentarios y usuarios con almacenamiento seguro de imágenes en PostgreSQL) y separando físicamente los **3 ambientes en 3 ramas independientes (`desarrollo`, `qa` y `produccion`)**.

---

## Despliegue Automatizado desde Cero en AWS + Cloudflare (Paso a Paso)

Si llegas desde cero y quieres desplegar toda la infraestructura en AWS (**VPC + Subredes Públicas/Privadas + Security Groups ASVS v5.0 + Amazon RDS PostgreSQL 16 + Ubuntu 24.04 EC2 con Docker + Elastic IP + Application Load Balancer + Auto Scaling Group**) y conectarla gratis con **Cloudflare Workers (`*.workers.dev`)**:

- **[MANUAL_DESPLIEGUE_DESDE_CERO.md](./MANUAL_DESPLIEGUE_DESDE_CERO.md)** — Manual completo para principiantes desde cero (cuenta AWS, IAM Access Key, CloudShell/Windows/Linux/macOS, Cloudflare sin dominio y prueba de los 6 CRUDs).
- **Script 1 (Desplegar todo en AWS):**
  - Linux / macOS / AWS CloudShell: [`infra/aws/1-desplegar-aws.sh`](./infra/aws/1-desplegar-aws.sh)
  - Windows PowerShell: [`infra/aws/1-desplegar-aws.ps1`](./infra/aws/1-desplegar-aws.ps1)
- **Script 2 (Destruir todo en AWS / $0 cobros):**
  - Linux / macOS / AWS CloudShell: [`infra/aws/2-destruir-aws.sh`](./infra/aws/2-destruir-aws.sh)
  - Windows PowerShell: [`infra/aws/2-destruir-aws.ps1`](./infra/aws/2-destruir-aws.ps1)

---

## Estructura de las 3 Ramas (3 Ambientes Separados)

| Rama Git | Ambiente | Contenido Exclusivo de la Rama | Cómo se ejecuta |
| :--- | :--- | :--- | :--- |
| **`desarrollo`** | **1. Desarrollo** | `frontend/`, `backend/`, `database/`, `infra/aws/`, `docker-compose.yml` (Dev). | `docker compose up --build` -> `http://localhost:8080/carta` |
| **`qa`** | **2. QA con IA** | `frontend/`, `backend/`, `database/`, `infra/aws/`, `qa-ai/` (Agente IA GitHub Copilot/Models), `.github/workflows/qa-ai.yml`, `docker-compose.yml` (QA). | Se ejecuta automáticamente en GitHub Actions al hacer push/PR a `qa` o localmente con `docker compose up --build --abort-on-container-exit --exit-code-from qa-ai-agent`. |
| **`produccion`** | **3. Producción** | `frontend/`, `backend/`, `database/`, `infra/aws/`, `cloudflare-worker/`, `wrangler.toml`, `.github/workflows/deploy-produccion.yml`, `docker-compose.yml` & `docker-compose.rds.yml` (Prod endurecido). | Despliegue con [`1-desplegar-aws.sh`](./infra/aws/1-desplegar-aws.sh) / [`.ps1`](./infra/aws/1-desplegar-aws.ps1) + Cloudflare `*.workers.dev`, y CI/CD por SSH al hacer push a `produccion`. |

> [!IMPORTANT]
> La rama `main` en GitHub conserva la versión heredada en PHP y **no** contiene `infra/aws/` ni el stack moderno. Para clonar el proyecto correctamente, indica siempre la rama deseada:
> - **Producción / Despliegue AWS:** `git clone -b produccion --single-branch https://github.com/stxtiz/trabajo_desarrollo_seguro.git`
> - **Desarrollo local:** `git clone -b desarrollo --single-branch https://github.com/stxtiz/trabajo_desarrollo_seguro.git`

---

## Guías Locales de Referencia (Ignoradas en Git por `.gitignore`)

- [DESPLIEGUE_CLOUDFLARE.md](./DESPLIEGUE_CLOUDFLARE.md) — Referencia rápida del Worker gratuito `*.workers.dev` conectado a la rama `produccion`.
- [DESPLIEGUE_AWS_EC2.md](./DESPLIEGUE_AWS_EC2.md) — Referencia de despliegue manual sin Terraform en una instancia AWS EC2 Ubuntu Free Tier.
- [CUMPLIMIENTO_ASVS_5.0.md](./CUMPLIMIENTO_ASVS_5.0.md) — Matriz de controles **OWASP ASVS v5.0 Nivel 3**.
