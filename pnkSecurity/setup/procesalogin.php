<?php
declare(strict_types=1);
require_once __DIR__ .'/setup.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$usuario= filter_input(INPUT_POST, 'frmusuario', FILTER_VALIDATE_EMAIL);
$password= (string) ($_POST['frmpassword'] ?? '');

if ($usuario === false || $usuario === null || $password === '') {
    header('Location: ../index.php?id=1');
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
$credencialesValidas = $datos !== false 
    && password_verify($password, (string) $datos['password']);
    
if (!$credencialesValidas) {
    header('Location: ../index.php?id=1');
    exit;
}

if ($credencialesValidas) {
    iniciar_sesion();
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = (int) $datos['id'];
    $_SESSION['nombre'] = $datos['nombre'];
    unset($datos['password']);
    header('Location: ../index.php?id=1');
    exit;
}

header('Location: ../index.php?id=1');
exit;

?>