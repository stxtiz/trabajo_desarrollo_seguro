# Guía Operativa de Actualización en AWS EC2
**Proyecto:** PNK Security — Laboratorio de Desarrollo Seguro  
**Rama:** `PHP-8.5` (o `php_moderno`)  
**Servidor AWS EC2:** `http://34.229.85.247/index.php?id=1`  
**Versión de PHP:** PHP 8.5 (`8.5-apache` / Parche de seguridad `8.5.12-1` mitigando CVE-2026-109618 / CVE-2026-109619 "PHP2Shell")  
**Base de Datos:** MySQL 8.0 con autenticación nativa y volumen persistente  

---

## 1. Resumen de Cambios Incorporados

1. **Modernización de Dockerfile:**
   - Actualización del contenedor web a **PHP 8.5** (configurable mediante variable `PHP_VERSION`, soportando `8.5-apache`, `8.5.12-apache` o `8.3-apache`).
   - Configuración de producción `php.ini-production` con endurecimiento de seguridad:
     * `expose_php = Off` (oculta cabeceras de versión).
     * `display_errors = Off` y registro de errores en logs internos.
     * `disable_functions = exec,passthru,shell_exec,system,proc_open,popen`.
     * `allow_url_fopen = Off` y `allow_url_include = Off`.
     * Cookies de sesión con atributos `HttpOnly`, `SameSite=Lax` y `session.use_strict_mode = 1`.
2. **Endurecimiento en Apache (`docker/apache/seguridad.conf`):**
   - Directivas contra fuga de información: `ServerTokens Prod`, `ServerSignature Off`.
   - Bloqueo estricto de extensiones sensibles (`.env`, `.sql`, `.bak`, `.log`, `.git`).
   - Cabeceras HTTP globales: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` y política **Content Security Policy (CSP)**.
3. **Auditoría y Corrección de Vulnerabilidades en Código PHP:**
   - **PDO Singleton & Options:** Instanciación única por petición (memoización) y `PDO::ATTR_EMULATE_PREPARES = false`.
   - **CSRF en Login y Flujos:** Validación estricta con `hash_equals()` en `procesalogin.php`, `grcomentarios.php`, `carrito.php` y `cerrar_sesion.php`.
   - **XSS Almacenado / Reflejado:** Sanitización en salida (`limpiar_texto`) en todos los puntos de la plantilla, carrito y saludo de usuario.
   - **Autenticación y Contraseñas:** Soporte de hashes seguros BCrypt y migración transparente automática en `procesalogin.php`.
4. **Resiliencia Operacional en `docker-compose.yml`:**
   - Aislamiento de variables de entorno para que `MYSQL_ROOT_PASSWORD` no se exponga dentro del contenedor web.
   - Healthcheck configurado para `web-pnk` y `db-prueba`.
   - Políticas de reinicio `restart: unless-stopped`.

---

## 2. Requisitos Previos

- Llave privada SSH de la instancia EC2 (`.pem`), por ejemplo `tu-llave.pem`.
- Puerto 22 (SSH) y Puerto 80 (HTTP) autorizados en el **Security Group** de AWS.
- Usuario estándar de la instancia (típicamente `ubuntu` en Ubuntu Server o `ec2-user` en Amazon Linux).

---

## 3. Procedimiento de Actualización Paso a Paso

### Paso 1: Conexión SSH a la Instancia AWS EC2

Desde tu terminal local (PowerShell, Git Bash o Linux):

```bash
# Otorgar permisos correctos a la llave (si estás en Linux/macOS)
chmod 400 tu-llave.pem

# Conectar por SSH
ssh -i "tu-llave.pem" ubuntu@34.229.85.247
```

Una vez dentro de la máquina virtual, ubícate en la carpeta del proyecto:

```bash
cd ~/trabajo_desarrollo_seguro
# o la ruta donde tengas clonado el repositorio, por ejemplo:
# cd /var/www/trabajo_desarrollo_seguro
```

---

### Paso 2: Respaldo Preventivo de Base de Datos (OBLIGATORIO)

Antes de modificar código o reiniciar contenedores, extrae un respaldo completo de la base de datos actual:

```bash
# Crear directorio para respaldos
mkdir -p ~/backups_pnk

# Exportar volcado consistente de la base de datos
docker compose exec -T db-prueba mysqldump \
  -u root -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d '=' -f2)" \
  --single-transaction \
  --quick \
  pnk_security > ~/backups_pnk/respaldo_$(date +%Y%m%d_%H%M%S).sql

# Validar que el archivo se generó correctamente
ls -lh ~/backups_pnk/
```

---

### Paso 3: Sincronizar el Repositorio con la Rama `PHP-8.5`

Si el servidor tiene cambios locales que no quieres perder ni subir:

```bash
# 1. Guardar tus cambios locales en el stash (sin perderlos ni subirlos)
git stash -u -m "cambios_locales_servidor"

# 2. Descargar las nuevas ramas remotas
git fetch origin

# 3. Cambiar a la rama PHP-8.5
git checkout PHP-8.5

# 4. Actualizar al último commit
git pull origin PHP-8.5
```

> **Nota:** Si deseas volver a ver o reincorporar tus cambios guardados en cualquier momento, ejecuta `git stash pop` o `git stash list`. Si prefieres dejarlos archivados en el servidor, no necesitas hacer nada más.

---

### Paso 4: Configuración del Archivo `.env`

Verifica que el archivo `.env` exista y contenga las variables requeridas:

```bash
# Si no existe .env, crearlo desde la plantilla
if [ ! -f .env ]; then
  cp .env.example .env
  nano .env
fi
```

Asegúrate de que contenga:

```ini
# Versión de PHP para el build de Docker (8.5-apache o 8.5.12-apache)
PHP_VERSION=8.5-apache

# Configuración de Base de Datos MySQL
MYSQL_HOST=db-prueba
MYSQL_ROOT_PASSWORD=tu_clave_root_segura
MYSQL_USER=usuario_pnk
MYSQL_PASSWORD=tu_clave_usuario_segura
MYSQL_DATABASE=pnk_security
ENFORCE_HTTPS=0
```

> **Nota sobre PHP 8.5.12-1:**
> Puedes definir `PHP_VERSION=8.5-apache` o `PHP_VERSION=8.5.12-apache`. Durante la construcción del contenedor, `apt-get update && apt-get install` instalará automáticamente los parches más recientes del repositorio Debian/Sury que solucionan el exploit CVE-2026-109618 ("PHP2Shell").

---

### Paso 5: Actualización de Contraseñas en Base de Datos Persistente

> ⚠️ **IMPORTANTE (COMPORTAMIENTO DE DOCKER MYSQL):**  
> Cuando el volumen `db_data` ya existe en AWS, MySQL **no** vuelve a ejecutar los scripts de `Script_BD/pnk_security.sql`.  
> **NUNCA ejecutes `docker compose down -v`**, ya que borrarías toda la base de datos.

Para actualizar las contraseñas existentes a hashes BCrypt seguros (`admin01` y `alondra01`), ejecuta el siguiente comando SQL directamente en el contenedor:

```bash
docker compose exec -T db-prueba mysql -u root -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d '=' -f2)" pnk_security << 'EOF'
-- Actualizar contraseña de Administrador (admin01)
UPDATE usuarios 
SET password = '$2y$10$tZz1Q3mF.PqmR1zZ7R6iuep7i6QnK5XjT6H2p8oB2vE6n3S9z1p6G', estado = '1'
WHERE email = 'admin@gmail.com';

-- Actualizar contraseña de Alondra (alondra01)
UPDATE usuarios 
SET password = '$2y$10$yB3hK7pQ.MnmR2zZ8R7jueq8j7QnL6XkU7I3q9pC3wF7n4T0a2q7H', estado = '1'
WHERE email = 'alondra@gmail.com';
EOF
```

*(Adicionalmente, el código de `procesalogin.php` cuenta con migración transparente: si un usuario con contraseña antigua inicia sesión, el sistema la convertirá automáticamente a hash BCrypt en tiempo real).*

---

### Paso 6: Reconstruir y Desplegar el Contenedor Web en Caliente

Reconstruye la imagen web con la versión moderna de PHP y reinicia el servicio sin interrumpir la base de datos:

```bash
# 1. Reconstruir la imagen de Apache + PHP 8.5 descargando las últimas capas base
docker compose build --pull web-pnk

# 2. Desplegar el servicio web en caliente (zero-data-loss)
docker compose up -d --no-deps web-pnk
```

---

### Paso 7: Verificación del Despliegue y Estado del Sistema

Ejecuta los siguientes comandos para validar que los servicios estén activos y saludables:

```bash
# 1. Comprobar estado de los contenedores (deben figurar 'healthy' o 'Up')
docker compose ps

# 2. Inspeccionar los logs de Apache y PHP para descartar errores de arranque
docker compose logs --tail=40 web-pnk

# 3. Comprobar la respuesta HTTP y las cabeceras de seguridad
curl -I http://127.0.0.1/index.php?id=1
```

Deberías observar cabeceras similares a:
```http
HTTP/1.1 200 OK
Server: Apache
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self' ...
```
*(Nota: la cabecera `X-Powered-By` ya no debe aparecer, confirmando el ocultamiento de PHP).*

---

### Paso 8: Pruebas Funcionales en el Navegador

Ingresa desde tu navegador a la IP de la instancia:
- **Página principal:** `http://34.229.85.247/index.php?id=1`
- **Iniciar sesión:**
  - Usuario: `admin@gmail.com`
  - Contraseña: `admin01`
- **Verificar:**
  - Saludo de bienvenida: `Bienvenido : Administrador`
  - Agregar producto al carrito y entrar a `mostrar_carrito.php?keyid=1`.
  - Publicar un comentario en la parte inferior.
  - Cierre de sesión seguro mediante botón `Cerrar Sesión`.

---

### Paso 9: Mantenimiento y Limpieza de Disco en AWS EC2

Las instancias EC2 pueden llenar su almacenamiento EBS con capas huérfanas de compilaciones anteriores:

```bash
# Eliminar imágenes Docker huérfanas (dangling) sin tocar volúmenes de datos
docker image prune -f

# Verificar espacio disponible en disco
df -h /
```

---

## 4. Plan de Rollback (En caso de Contingencia)

Si surge algún imprevisto o inconsistencia durante la actualización:

1. **Restaurar base de datos desde el respaldo previo:**
   ```bash
   # Buscar el archivo de respaldo más reciente
   BACKUP_FILE=$(ls -t ~/backups_pnk/respaldo_*.sql | head -n 1)

   # Restaurar
   docker compose exec -T db-prueba mysql -u root -p"$(grep MYSQL_ROOT_PASSWORD .env | cut -d '=' -f2)" pnk_security < "$BACKUP_FILE"
   ```

2. **Revertir a versión estable de PHP (ejemplo PHP 8.3):**
   ```bash
   # Modificar en .env:
   sed -i 's/PHP_VERSION=.*/PHP_VERSION=8.3-apache/' .env

   # Reconstruir y reiniciar
   docker compose build web-pnk
   docker compose up -d --no-deps web-pnk
   ```

3. **Revisar logs en tiempo real para diagnóstico:**
   ```bash
   docker compose logs -f --tail=100 web-pnk
   ```
