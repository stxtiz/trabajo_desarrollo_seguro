export default function Footer({ variant = 'carta' }) {
  const footerClass = variant === 'carrito' ? 'container contendor' : 'footer-area section-gap';

  return (
    <footer className={footerClass}>
      <br />
      {variant === 'carrito' ? <hr /> : null}
      <div className="container">
        <div className="footer-bottom row align-items-center text-center">
          <p className="footer-text m-0 col-md-12">
            Copyright 2020, Todos los Derechos reservados PNK, <br />
            Sitio desarrollado para el Laboratorio de Programación Segura I
            <br />
            <b>Área Tecnologías de Información y Ciberseguridad - Inacap Sede La Serena</b>
            <br />
            <br />
          </p>
        </div>
      </div>
    </footer>
  );
}
