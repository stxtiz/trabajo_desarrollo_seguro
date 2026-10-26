<?php
declare(strict_types=1);
require_once __DIR__ . '/setup.php';

iniciar_sesion();
$idRestaurante = (int) ($_SESSION['id'] ?? 1);

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Método no permitido');
}

// Validación de Token CSRF en Login (SEC-04)
$csrfToken = (string) ($_POST['csrf_token'] ?? '');
if ($csrfToken === '' || !hash_equals((string) ($_SESSION['csrf_token'] ?? ''), $csrfToken)) {
    http_response_code(403);
    exit('CSRF token validation failed');
}

$usuario = filter_input(INPUT_POST, 'frmusuario', FILTER_VALIDATE_EMAIL);
$password = (string) ($_POST['frmpassword'] ?? '');

if ($usuario === false || $usuario === null || $password === '') {
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

verificar_rate_limit_login((string) $usuario);

$pdo = conectar();
$stmt = $pdo->prepare(
    'SELECT id, nombre, email, password, estado 
     FROM usuarios
     WHERE email = :email AND estado = :estado
     LIMIT 1'
);
$stmt->execute([
    ':email'  => $usuario,
    ':estado' => '1',
]);
$datos = $stmt->fetch();

$credencialesValidas = false;
if ($datos !== false) {
    if (password_verify($password, (string) $datos['password'])) {
        $credencialesValidas = true;
        if (password_needs_rehash((string) $datos['password'], PASSWORD_DEFAULT)) {
            $nuevoHash = password_hash($password, PASSWORD_DEFAULT);
            $rehashStmt = $pdo->prepare('UPDATE usuarios SET password = :password WHERE id = :id');
            $rehashStmt->execute([':password' => $nuevoHash, ':id' => $datos['id']]);
        }
    } elseif ((string) $datos['password'] === $password) {
        // Migración transparente de contraseña legacy en texto plano a hash seguro (BCrypt/Argon2)
        $nuevoHash = password_hash($password, PASSWORD_DEFAULT);
        $updateStmt = $pdo->prepare('UPDATE usuarios SET password = :password WHERE id = :id');
        $updateStmt->execute([':password' => $nuevoHash, ':id' => $datos['id']]);
        $credencialesValidas = true;
    }
}

registrar_intento_login((string) $usuario, $credencialesValidas);

if (!$credencialesValidas) {
    error_log(sprintf('[SECURITY_AUTH] evento=AUTH_LOGIN_FAILED email=%s ip=%s', (string) $usuario, $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

if ($credencialesValidas) {
    session_regenerate_id(true);
    $_SESSION['usuario_id'] = (int) $datos['id'];
    $_SESSION['nombre'] = (string) $datos['nombre'];
    $_SESSION['auth_time'] = time();
    $_SESSION['last_activity'] = time();
    unset($datos['password']);
    error_log(sprintf('[SECURITY_AUTH] evento=AUTH_LOGIN_SUCCESS usuario_id=%d email=%s ip=%s', (int) $datos['id'], (string) $usuario, $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    header('Location: ../index.php?id=' . $idRestaurante);
    exit;
}

header('Location: ../index.php?id=' . $idRestaurante);
exit;
