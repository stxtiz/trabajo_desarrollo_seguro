<?php
declare(strict_types=1);

require_once __DIR__ . '/setup/setup.php';
iniciar_sesion();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    exit('Método no permitido');
}

$token = (string) ($_POST['csrf_token'] ?? '');
if ($token === '' || !hash_equals((string) ($_SESSION['csrf_token'] ?? ''), $token)) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

$op = (string) ($_POST['op'] ?? '');

match ($op) {
    '1' => insertar(),
    '2' => eliminaritems(),
    '3' => eliminartodo(),
    default => (function (): void {
        http_response_code(400);
        exit('Operación inválida');
    })(),
};

function insertar(): void
{
    if (!isset($_SESSION['carrito']) || !is_array($_SESSION['carrito'])) {
        $_SESSION['carrito'] = [];
    }

    $idItem = filter_input(INPUT_POST, 'iditems', FILTER_VALIDATE_INT);
    if ($idItem === false || $idItem === null || $idItem <= 0) {
        http_response_code(400);
        exit("ID de ítem inválido.");
    }

    $idRestaurante = filter_var($_SESSION['id'] ?? 0, FILTER_VALIDATE_INT);
    if (!$idRestaurante || $idRestaurante <= 0) {
        http_response_code(400);
        exit("No hay un restaurante activo.");
    }

    $sql = 'SELECT items.id, items.nombre, items.precio 
            FROM items
            INNER JOIN categorias ON items.categorias_id = categorias.id
            INNER JOIN cartas ON categorias.cartas_id = cartas.id
            WHERE items.id = :id 
              AND items.visible = 1 AND items.eliminado IS NULL
              AND categorias.visible = 1 AND categorias.eliminado IS NULL
              AND cartas.visible = 1 AND cartas.eliminada IS NULL
              AND cartas.restautantes_id = :id_restaurante';

    $stmt = conectar()->prepare($sql);
    $stmt->execute([
        ':id'             => $idItem,
        ':id_restaurante' => $idRestaurante,
    ]);

    $datos = $stmt->fetch();
    if (!$datos) {
        http_response_code(404);
        exit("El producto no existe, no está disponible o no pertenece a este restaurante.");
    }

    $idProd = (int) $datos['id'];
    $_SESSION['carrito'][$idProd] = [
        'posicion' => $idProd,
        'id'       => $idProd,
        'nombre'   => (string) $datos['nombre'],
        'precio'   => (float) $datos['precio'],
    ];
}

function eliminaritems(): void
{
    $pos = filter_input(INPUT_POST, 'pos', FILTER_VALIDATE_INT);
    if ($pos !== false && $pos !== null) {
        unset($_SESSION['carrito'][$pos]);
    }
}

function eliminartodo(): void
{
    $_SESSION['carrito'] = [];
}
