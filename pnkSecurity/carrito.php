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

    $idItem = filter_input(INPUT_POST, 'iditems', FILTER_VALIDATE_INT);
    if ($idItem === false || $idItem === null) {
        http_response_code(400);
        return;
    }
    
    $stmt = conectar()-> prepare(
        'SELECT id, nombre, precio FROM items
        WHERE id = :id AND visible = 1 AND eliminado IS NULL'
    );
    $stmt->execute([':id' => $idItem]);
    $datos = $stmt->fetch(PDO::FETCH_ASSOC);

    $pos=count($_SESSION["carrito"])+1;
    $productos = array("posicion"=>$pos,"id" => $datos['id'], "nombre" =>$datos['nombre'],"precio"=>$datos['precio']);
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