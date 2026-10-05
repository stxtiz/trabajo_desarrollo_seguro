<?php

function conectar(): PDO
{
    $host = "db-prueba";
    $db = "pnk_security";
    $user = "root";
    $pass = "";
    $dsn = "mysql:host=$host;dbname=$db;charset=utf8mb4";
    
    try {
        $con = new PDO($dsn, $user, $pass);
        return $con;
    } catch (PDOException $e) {
        throw new RuntimeException("Error de conexión a la base de datos" . $e->getMessage());
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


function moneda_chilena(int|float|string|null $numero): string
{
    $numero = (string) $numero;
    $puntos = (int) floor((strlen($numero) - 1) / 3);
    $tmp = '';
    $pos = 1;
    for ($i = strlen($numero) - 1; $i >= 0; $i--) {
        $tmp .= substr($numero, $i, 1);
        if ($pos % 3 === 0 && $pos !== strlen($numero)) {
            $tmp .= '.';
        }
        $pos++;
    }
    return '$ ' . strrev($tmp);
}



function iniciar_sesion(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    }
}

?>