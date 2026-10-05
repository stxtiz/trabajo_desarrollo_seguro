<?php
declare(strict_types=1);
require_once __DIR__ . '/setup/setup.php';

iniciar_sesion();


if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

if (!isset($_SESSION['nombre'], $_SESSION['id'])) {
    http_response_code(403);
    exit;
}

if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

$usuarioSesion = (string) $_SESSION['nombre'];
$comentario = trim((string) (quitarEspacios($_POST['comentario'] ?? '')));
$idRestaurante = (int) $_SESSION['id'];


if  ($comentario === '' || $idRestaurante <= 0) {
    http_response_code(400);
    echo "Datos inválidos.";
    exit;
}

$sql = 'INSERT INTO comentarios (usuario, comentario, id_restaurante)
        VALUES (:usuario, :comentario, :id_restaurante)';
$stmt = conectar()->prepare($sql);
$stmt-> execute([
    ':usuario' => $usuarioSesion,
    ':comentario' => $comentario,
    ':id_restaurante' => $idRestaurante
]);
header('Location: index.php?id=' . $idRestaurante);
exit;

?>