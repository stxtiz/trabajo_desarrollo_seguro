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

$token = (string) ($_POST['csrf_token'] ?? '');
if ($token === '' || !hash_equals((string) ($_SESSION['csrf_token'] ?? ''), $token)) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

$usuarioSesion = (string) $_SESSION['nombre'];
// Se almacena en crudo (PDO previene SQLi; el escape XSS se realiza exclusivamente al renderizar en el HTML)
$rawComentario = (string) ($_POST['comentario'] ?? '');
$comentario = function_exists('mb_trim') ? mb_trim($rawComentario) : trim($rawComentario);
$idRestaurante = (int) $_SESSION['id'];

if ($comentario === '' || $idRestaurante <= 0) {
    http_response_code(400);
    echo "Datos inválidos.";
    exit;
}

$sql = 'INSERT INTO comentarios (usuario, comentario, id_restaurante)
        VALUES (:usuario, :comentario, :id_restaurante)';
$stmt = conectar()->prepare($sql);
$stmt->execute([
    ':usuario'        => $usuarioSesion,
    ':comentario'     => $comentario,
    ':id_restaurante' => $idRestaurante,
]);

header('Location: index.php?id=' . $idRestaurante);
exit;
