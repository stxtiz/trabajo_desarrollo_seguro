ARG PHP_VERSION=8.5-apache
FROM php:${PHP_VERSION}

# Instalar dependencias del sistema y extensiones de PHP necesarias
RUN apt-get update && apt-get install -y --no-install-recommends \
    libonig-dev \
    && docker-php-ext-install mysqli pdo pdo_mysql mbstring \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && a2enmod rewrite headers

# Configurar php.ini de producción y endurecimiento de seguridad
RUN mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini"

# Inyectar directivas de seguridad en la configuración de PHP
# Se dirige error_log a /proc/self/fd/2 para que sea visible en docker logs
RUN { \
    echo 'expose_php = Off'; \
    echo 'display_errors = Off'; \
    echo 'display_startup_errors = Off'; \
    echo 'log_errors = On'; \
    echo 'error_log = /proc/self/fd/2'; \
    echo 'error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT'; \
    echo 'session.cookie_httponly = 1'; \
    echo 'session.use_strict_mode = 1'; \
    echo 'session.cookie_samesite = "Lax"'; \
    echo 'allow_url_fopen = Off'; \
    echo 'allow_url_include = Off'; \
    echo 'disable_functions = exec,passthru,shell_exec,system,proc_open,popen'; \
} > /usr/local/etc/php/conf.d/security.ini

# Suprimir advertencia de ServerName en Apache
RUN echo "ServerName localhost" >> /etc/apache2/apache2.conf

# Copiar y activar configuración de seguridad para Apache
COPY docker/apache/seguridad.conf /etc/apache2/conf-available/seguridad.conf
RUN a2enconf seguridad

# Establecer permisos adecuados para el directorio web
RUN chown -R www-data:www-data /var/www/html
