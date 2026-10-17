<?php
declare(strict_types=1);
require_once __DIR__ . '/setup/setup.php';

session_start();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

if (!isset($_SESSION['nombre'], $_SESSION['id'])) {
    http_response_code(403);
    exit;
}

$usuarioSesion = (string) $_SESSION['nombre'];
$comentario = trim((string) (limpiar_texto($_POST['comentario'] ?? '')));
$idRestaurante = (int) $_SESSION['id'];

if ($comentario === '' || $idRestaurante <= 0) {
    http_response_code(400);
    echo "Datos inválidos.";
    exit;
}

$sql="INSERT INTO comentarios SET usuario='".$usuarioSesion."',comentario='".$comentario."',id_restaurante=".$idRestaurante;
mysqli_query(conectar(),$sql);

header('Location: index.php?id=' . $idRestaurante);
exit;

?>