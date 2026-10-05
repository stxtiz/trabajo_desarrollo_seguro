<?php

include("setup/setup.php");
iniciar_sesion();

if (!isset($_POST['csrf_token']) || !hash_equals($_SESSION['csrf_token'], $_POST['csrf_token'])) {
    http_response_code(403);
    exit("CSRF token validation failed");
}

switch($_POST['op'])
{
    case "1": insertar();
        break;
    case "2": eliminaritems();
        break;
    case "3": eliminartodo();
        break;
}

function insertar()
{
    if (!isset($_SESSION['carrito']) || !is_array($_SESSION['carrito'])) {
        $_SESSION['carrito'] = [];
    }

    // 1. Validar `iditems` como entero positivo
    $idItem = filter_input(INPUT_POST, 'iditems', FILTER_VALIDATE_INT);
    if ($idItem === false || $idItem <= 0) {
        http_response_code(400);
        exit("ID de ítem inválido.");
    }

    // Validar que exista el ID del restaurante activo en la sesión (que se asigna en index.php)
    $idRestaurante = filter_var($_SESSION['id'] ?? 0, FILTER_VALIDATE_INT);
    if ($idRestaurante <= 0) {
        http_response_code(400);
        exit("No hay un restaurante activo.");
    }
    
    // 2, 3 y 4. Consultar items, categorias y cartas en una misma sentencia, 
    // exigiendo visibilidad (visible = 1, eliminado IS NULL) y pertenencia al restaurante activo.
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
        ':id' => $idItem,
        ':id_restaurante' => $idRestaurante
    ]);
    
    $datos = $stmt->fetch(PDO::FETCH_ASSOC);

    // 5. Comprobar que la consulta devolvió un producto válido antes de intentar usar sus columnas.
    if (!$datos) {
        http_response_code(404);
        // Rechazar artículos ocultos, eliminados o de otro restaurante 
        exit("El producto no existe, no está disponible o no pertenece a este restaurante.");
    }

    // Agregar el producto validado al carrito
    $pos = count($_SESSION["carrito"]) + 1;
    $productos = array(
        "posicion" => $pos,
        "id" => $datos['id'], 
        "nombre" => $datos['nombre'],
        "precio" => $datos['precio']
    );
    $_SESSION["carrito"][$pos] = $productos;
}

function eliminaritems()
{
    unset($_SESSION["carrito"][$_POST['pos']]);
}

function eliminartodo()
{
    unset($_SESSION['carrito']);
}
?>