# Carta Digital — PNK Security (v2.0)
## Arquitectura Separada Front-End & Back-End MVC | Node.js + Express + PostgreSQL | OWASP ASVS v5.0 Nivel 3

Proyecto reconstruido íntegramente desde cero eliminando PHP legado, MySQL antiguo, jQuery y peticiones `$.ajax` deprecadas, conservando **100% idéntico el diseño visual de la interfaz web** para el usuario final y cumpliendo el estándar **OWASP ASVS v5.0 Nivel 3**.

---

## 1. Arquitectura y Stack de Desarrollo

- **Front-End (`frontend/`):**
  - Servidor **Node.js + Express** endurecido con Helmet (`Content-Security-Policy`, `HSTS`, `X-Frame-Options: DENY`) y proxy inverso integrado hacia `/api`.
  - **JavaScript Moderno Nativo (ES2024+ Modules):** Uso exclusivo de `fetch()` con `async/await`, `AbortController` y manipulación segura del DOM con `textContent` (cero jQuery, cero `$.ajax`).
  - **Fidelidad Visual 100% Idéntica:** Conserva intactos los estilos (`css/style.css`, Bootstrap CSS, Themify Icons), imágenes de restaurantes/platos (`img/` e `imagenes/`), carrusel de Menús Destacados, pestañas por carta, modal de selección y tabla de carrito.
- **Back-End (`backend/`):**
  - **Node.js + Express** bajo patrón arquitectónico **MVC (Modelo - Vista - Controlador)**:
    - `src/models/`: `RestauranteModel.js`, `UsuarioModel.js`, `ComentarioModel.js`, `SesionModel.js`, `AuditoriaModel.js`.
    - `src/views/`: `JsonView.js` (respuestas JSON canónicas sin filtración de errores internos).
    - `src/controllers/`: `CartaController.js`, `AuthController.js`, `CarritoController.js`, `ComentarioController.js`.
    - `src/middlewares/`: Protección CSRF en tiempo constante, sesiones persistentes en BD con rotación anti-Session Fixation, Rate Limiting y validación de entrada estricta.
- **Base de Datos (`database/init.sql`):**
  - **PostgreSQL 16** con integridad referencial (`FOREIGN KEY`), restricciones `CHECK`, sesiones del lado del servidor y tabla de auditoría de eventos de seguridad.

---

## 2. Los 3 Ambientes del Proyecto

### Ambiente 1: Desarrollo (`docker-compose.dev.yml`)
```bash
docker compose -f docker-compose.dev.yml up --build
```
- **Front-End Carta Digital (URL limpia sin ID):** `http://localhost:8080/carta`
- **Vista de Carrito (URL limpia sin keyid):** `http://localhost:8080/carrito`
- **API Back-End Healthcheck:** `http://localhost:3000/api/health`

### Ambiente 2: QA Automatizado con IA — GitHub Copilot / GitHub Models (`docker-compose.qa.yml`)
```bash
docker compose -f docker-compose.qa.yml up --build --abort-on-container-exit --exit-code-from qa-ai-agent
```
- Levanta una instancia limpia de PostgreSQL, el Back-End y el Front-End, y ejecuta el **Agente de QA con IA (`qa-ai/run-qa-ai.js`)**.
- El agente ejecuta pruebas dinámicas de seguridad **OWASP ASVS v5.0 Nivel 3** (SQLi, CSRF, XSS, cabeceras HTTP, rotación de sesión, integridad de precios del carrito y paridad visual del Front-End) y consulta a la **IA de GitHub (`gpt-4o-mini` vía GitHub Models API usando `GITHUB_TOKEN`)** para emitir el informe en `qa-ai/reports/REPORTE_QA_IA_ASVS5.md`.

### Ambiente 3: Producción (`docker-compose.prod.yml`)
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- Configuración endurecida para **AWS EC2 (Ubuntu Free Tier)** detrás de **Cloudflare (Free Tier)** con contenedores en modo solo-lectura (`read_only: true`), sin capacidades de kernel (`cap_drop: ALL`), `no-new-privileges: true` y red interna aislada para PostgreSQL.

---

## 3. Documentación de Despliegue y Seguridad

- [**Guía Paso a Paso: Despliegue en Cloudflare (Capa Gratuita)**](./DESPLIEGUE_CLOUDFLARE.md)
- [**Guía Paso a Paso: Despliegue en AWS EC2 Ubuntu con Docker (Capa Gratuita)**](./DESPLIEGUE_AWS_EC2.md)
- [**Matriz de Cumplimiento OWASP ASVS v5.0 Nivel 3**](./CUMPLIMIENTO_ASVS_5.0.md)
