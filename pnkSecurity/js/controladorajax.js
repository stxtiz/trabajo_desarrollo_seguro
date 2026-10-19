// JavaScript Document

$(document).ready(function () {
  $(".button").click(function () {
    agregaritems($(this).attr("id"));
  });

  $(".elim").click(function () {
    eliminaritems($(this).attr("id"));
  });
  $(".limpiar").click(function () {
    eliminartodo();
  });
});

function agregaritems(id) {
  var csrfToken = $('meta[name="csrf-token"]').attr("content");
  $.ajax({
    type: "POST",
    url: "carrito.php",
    data: "op=1&iditems=" + id + "&csrf_token=" + csrfToken,
    success: function (response) {
      $("#myModal").modal("show");
    },
  });
}

function eliminaritems(pos) {
  var csrfToken = $('meta[name="csrf-token"]').attr("content");
  $.ajax({
    type: "POST",
    url: "carrito.php",
    data: "op=2&pos=" + pos + "&csrf_token=" + csrfToken,
    success: function (response) {
      location.reload();
    },
  });
}

function eliminartodo() {
  var csrfToken = $('meta[name="csrf-token"]').attr("content");
  $.ajax({
    type: "POST",
    url: "carrito.php",
    data: "op=3&csrf_token=" + csrfToken,
    success: function (response) {
      location.reload();
    },
  });
}
