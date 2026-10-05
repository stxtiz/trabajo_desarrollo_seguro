<?php
declare(strict_types=1);
if(session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit;
}

if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

$idRestaurante = $_SESSION['id'] ?? 1;
$_SESSION = [];
if (ini_get('session.use_cookies')) {
    $p = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000, 
    $p['path'],$p['domain'], (bool) $p['secure'], (bool) $p ['httponly']);
}
session_destroy();

header("Location: ../index.php?id=" . $idRestaurante);
exit;
?>
