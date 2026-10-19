<?php
declare(strict_types=1);
require_once __DIR__ .'/setup.php';

iniciar_sesion();
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

verificar_rate_limit_login($usuario);

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

registrar_intento_login($usuario, $credencialesValidas);

if (!$credencialesValidas) {
    error_log(sprintf('[SECURITY_AUTH] evento=AUTH_LOGIN_FAILED email=%s ip=%s', $usuario, $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

if ($credencialesValidas) {
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = (int) $datos['id'];
    $_SESSION['nombre'] = $datos['nombre'];
    $_SESSION['auth_time'] = time();
    $_SESSION['last_activity'] = time();
    unset($datos['password']);
    error_log(sprintf('[SECURITY_AUTH] evento=AUTH_LOGIN_SUCCESS usuario_id=%d email=%s ip=%s', (int) $datos['id'], $usuario, $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

header('Location: ../index.php?id=' . $idRestaurante);
exit;
?>
