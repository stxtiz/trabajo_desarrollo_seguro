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
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
}

?>