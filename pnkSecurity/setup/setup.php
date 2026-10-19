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

function quitarespacios($titulo)
{
    $titulo =str_replace(" ", "", $titulo);
    $cadena =str_replace("ñ", "", $titulo);
    $cadena =str_replace("Ñ", "", $cadena);
    return $cadena;
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
        session_start();
    }
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
    header_remove('X-Powered-By');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');

    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

?>
