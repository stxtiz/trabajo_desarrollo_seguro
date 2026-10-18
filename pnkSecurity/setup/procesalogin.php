<?php
declare(strict_types=1);
require_once __DIR__ .'/setup.php';

session_start();
$idRestaurante = $_SESSION['id'] ?? 1;

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$usuario= filter_input(INPUT_POST, 'frmusuario', FILTER_VALIDATE_EMAIL);
$password= (string) ($_POST['frmpassword'] ?? '');

if ($usuario === false || $usuario === null || $password === '') {
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

$pdo = conectar();
$stmt = $pdo->prepare(
    'SELECT id, nombre, email, password, estado 
    FROM usuarios
    WHERE email = :email AND estado = :estado
    LIMIT 1'
);
$stmt->execute([
    ':email' => $usuario,
    ':estado' => '1',
]);
$datos = $stmt->fetch(PDO::FETCH_ASSOC);

if ($datos !== false && $datos['password'] === $password) {
    $_SESSION['nombre'] = $datos['nombre'];
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

header('Location: ../index.php?id=' . $idRestaurante);
exit;
?>
