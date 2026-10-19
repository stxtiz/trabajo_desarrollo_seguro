<?php

function conectar(): PDO
{
    $host = getenv('MYSQL_HOST') ?: '';
    $db   = getenv('MYSQL_DATABASE') ?: '';
    $user = getenv('MYSQL_USER') ?: '';
    $pass = getenv('MYSQL_PASSWORD') ?: '';
    $dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";
    
    try {
        $con = new PDO($dsn, $user, $pass);
        return $con;
    } catch (PDOException $e) {
        throw new RuntimeException("Error de conexión a la base de datos");
    }
}

function limpiar_texto(?string $value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function construir_url(string $ruta, array $parametros = []): string
{
    if (empty($parametros)) {
        return htmlspecialchars($ruta, ENT_QUOTES, 'UTF-8');
    }
    $query = http_build_query($parametros);
    return htmlspecialchars($ruta . '?' . $query, ENT_QUOTES, 'UTF-8');
}

function moneda_chilena($numero){
    $numero = (string)$numero;
    $puntos = floor((strlen($numero)-1)/3);
    $tmp = "";
    $pos = 1;
    for($i=strlen($numero)-1; $i>=0; $i--){
    $tmp = $tmp.substr($numero, $i, 1);
    if($pos%3==0 && $pos!=strlen($numero))
    $tmp = $tmp.".";
    $pos = $pos + 1;
    }
    $formateado = "$ ".strrev($tmp);
    return $formateado;
    }


function iniciar_sesion(): void
{
    $esHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (isset($_SERVER['SERVER_PORT']) && (int) $_SERVER['SERVER_PORT'] === 443);
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $esHttps,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        ini_set('session.use_strict_mode', '1');
        ini_set('session.use_only_cookies', '1');
        session_start();
    }
    // Mitigación de Clickjacking
    header('X-Frame-Options: DENY');
    header("Content-Security-Policy: frame-ancestors 'none'");
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
    $tiempoInactividadMax = 1800; // 30 minutos
    $tiempoAbsolutoMax    = 28800; // 8 horas
    $ahora = time();

    if (isset($_SESSION['usuario_id'])) {
        $inactivoExcedido = isset($_SESSION['last_activity']) && (($ahora - (int) $_SESSION['last_activity']) > $tiempoInactividadMax);
        $absolutoExcedido = isset($_SESSION['auth_time']) && (($ahora - (int) $_SESSION['auth_time']) > $tiempoAbsolutoMax);

        if ($inactivoExcedido || $absolutoExcedido) {
            $_SESSION = [];
            session_destroy();
            session_start();
        } else {
            $_SESSION['last_activity'] = $ahora;
        }
    }

    if (isset($_SESSION['usuario_id'])) {
        $stmt = conectar()->prepare('SELECT nombre, estado FROM usuarios WHERE id = :id LIMIT 1');
        $stmt->execute([':id' => (int) $_SESSION['usuario_id']]);
        $usuarioActual = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$usuarioActual || (string) $usuarioActual['estado'] !== '1') {
            $_SESSION = [];
            session_destroy();
            session_start();
        } else {
            $_SESSION['nombre'] = $usuarioActual['nombre'];
        }
    }
}

?>
