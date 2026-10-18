<?php

include("setup/setup.php");
iniciar_sesion();

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
    $_SESSION["carrito"];
    $idItem = filter_input(INPUT_POST, 'iditems', FILTER_VALIDATE_INT);
    if ($idItem === false || $idItem <= 0) {
        http_response_code(400);
        exit("ID de ítem inválido.");
    }
    $stmt = conectar()->prepare('SELECT id, nombre, precio FROM items WHERE id = :id');
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
    session_destroy();
}
?>