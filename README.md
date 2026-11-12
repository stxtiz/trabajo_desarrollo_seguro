# Carta Digital — PNK Security (v2.0)
## Arquitectura Separada Front-End & Back-End MVC | Node.js + Express + PostgreSQL | OWASP ASVS v5.0 Nivel 3

Proyecto reconstruido desde cero eliminando PHP legado, MySQL, jQuery y `$.ajax`, conservando **100% idéntico el diseño visual de la interfaz web**, aplicando **ofuscación criptográfica de URLs e IDs** (`/carta`, `/carrito`, tokens `AES-256-CTR + HMAC-SHA256`) y separando físicamente los **3 ambientes en 3 ramas independientes (`desarrollo`, `qa` y `produccion`)**.

---

## Estructura de las 3 Ramas (3 Ambientes Separados)

| Rama Git | Ambiente | Contenido Exclusivo de la Rama | Cómo se ejecuta |
| :--- | :--- | :--- | :--- |
| **`desarrollo`** | **1. Desarrollo** | `frontend/`, `backend/`, `database/`, `docker-compose.yml` (Dev). | `docker compose up --build` -> `http://localhost:8080/carta` |
| **`qa`** | **2. QA con IA** | `frontend/`, `backend/`, `database/`, `qa-ai/` (Agente IA GitHub Copilot/Models), `.github/workflows/qa-ai.yml`, `docker-compose.yml` (QA). | Se ejecuta automáticamente en GitHub Actions al hacer push/PR a `qa` o localmente con `docker compose up --build --abort-on-container-exit --exit-code-from qa-ai-agent`. |
| **`produccion`** | **3. Producción** | `frontend/`, `backend/`, `database/`, `cloudflare-worker/`, `wrangler.toml`, `.github/workflows/deploy-produccion.yml`, `docker-compose.yml` (Prod endurecido). | Al hacer push a `produccion`, actualiza **Cloudflare (`*.workers.dev`)** y despliega por SSH en **AWS EC2 Ubuntu (`docker compose up -d --build`)**. |

---

## Guías Locales de Despliegue y Seguridad (Ignoradas en Git por `.gitignore`)

- [DESPLIEGUE_CLOUDFLARE.md](./DESPLIEGUE_CLOUDFLARE.md) — Configuración paso a paso del Worker gratuito `*.workers.dev` conectado a la rama `produccion`.
- [DESPLIEGUE_AWS_EC2.md](./DESPLIEGUE_AWS_EC2.md) — Configuración paso a paso de la instancia AWS EC2 Ubuntu Free Tier clonando únicamente la rama `produccion`.
- [CUMPLIMIENTO_ASVS_5.0.md](./CUMPLIMIENTO_ASVS_5.0.md) — Matriz de controles **OWASP ASVS v5.0 Nivel 3**.
