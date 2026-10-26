<?php
declare(strict_types=1);

require_once __DIR__ . '/setup.php';
iniciar_sesion();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

$tokenEnviado = (string) ($_POST['csrf_token'] ?? '');
$tokenSesion  = (string) ($_SESSION['csrf_token'] ?? '');

if ($tokenEnviado === '' || !hash_equals($tokenSesion, $tokenEnviado)) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

$idRestaurante = (int) ($_SESSION['id'] ?? 1);
error_log(sprintf('[SECURITY_AUTH] evento=AUTH_LOGOUT usuario_id=%s ip=%s', (string) ($_SESSION['usuario_id'] ?? 'anon'), $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));

$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires'  => time() - 42000,
        'path'     => $p['path'] ?? '/',
        'domain'   => $p['domain'] ?? '',
        'secure'   => (bool) ($p['secure'] ?? false),
        'httponly' => (bool) ($p['httponly'] ?? true),
        'samesite' => $p['samesite'] ?? 'Lax',
    ]);
}
session_destroy();

header("Location: ../index.php?id=" . $idRestaurante);
exit;
