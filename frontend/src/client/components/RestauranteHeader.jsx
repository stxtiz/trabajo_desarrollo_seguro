import { Link } from 'react-router-dom';
import { IconoEmail, IconoTelefono, SafeImage } from './Icons.jsx';

export default function RestauranteHeader({ restaurante }) {
  return (
    <section id="restaurante-header-section">
      <div className="container contendor">
        <div className="row">
          <div className="col-lg-4">
            <div style={{ textAlign: 'center' }}>
              <div className="media">
                <img className="logosintituciones" src="/img/logo.png" width="190px" alt="Logo PNK" />
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div style={{ textAlign: 'center' }}>
              <div className="media">
                <SafeImage
                  id="restaurante-logo"
                  className="logosintituciones"
                  fotoUrl={restaurante?.fotoUrl}
                  alt={restaurante?.nombre}
                  fallbackSrc="/img/logo_empresa_comodin.png"
                  fallbackAlt="Logo Restaurante"
                  width="170px"
                />
              </div>
            </div>
          </div>
          <div className="col-lg-4">
            <div className="carro">
              <div className="media float-right">
                <Link className="button_carrito" id="link-mostrar-carrito" to="/carrito">
                  <svg
                    width="2em"
                    height="2em"
                    viewBox="0 0 16 16"
                    className="bi bi-cart4"
                    fill="currentColor"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      fillRule="evenodd"
                      d="M0 2.5A.5.5 0 0 1 .5 2H2a.5.5 0 0 1 .485.379L2.89 4H14.5a.5.5 0 0 1 .485.621l-1.5 6A.5.5 0 0 1 13 11H4a.5.5 0 0 1-.485-.379L1.61 3H.5a.5.5 0 0 1-.5-.5zM3.14 5l.5 2H5V5H3.14zM6 5v2h2V5H6zm3 0v2h2V5H9zm3 0v2h1.36l.5-2H12zm1.11 3H12v2h.61l.5-2zM11 8H9v2h2V8zM8 8H6v2h2V8zM5 8H3.89l.5 2H5V8zm0 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0zm9-1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm-2 1a2 2 0 1 1 4 0 2 2 0 0 1-4 0z"
                    />
                  </svg>
                  {' Productos Seleccionados'}
                </Link>
              </div>
            </div>
          </div>
        </div>
        <div className="row">
          <div className="col-lg-12">
            <div className="text-center">
              <h4 id="restaurante-nombre">{restaurante?.nombre || ''}</h4>
              <h5 id="restaurante-direccion-row">
                <svg
                  width="1em"
                  height="1em"
                  viewBox="0 0 16 16"
                  className="bi bi-geo-alt"
                  fill="currentColor"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M12.166 8.94C12.696 7.867 13 6.862 13 6A5 5 0 0 0 3 6c0 .862.305 1.867.834 2.94.524 1.062 1.234 2.12 1.96 3.07A31.481 31.481 0 0 0 8 14.58l.208-.22a31.493 31.493 0 0 0 1.998-2.35c.726-.95 1.436-2.008 1.96-3.07zM8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10z"
                  />
                  <path
                    fillRule="evenodd"
                    d="M8 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 1a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"
                  />
                </svg>{' '}
                <span id="restaurante-direccion-texto">
                  {restaurante ? `${restaurante.calle} #${restaurante.numero}, ${restaurante.comuna}` : ''}
                </span>
              </h5>
              <h5 id="restaurante-contacto-row">
                {restaurante?.fono ? (
                  <>
                    <IconoTelefono />
                    {` ${restaurante.fono} `}
                  </>
                ) : null}
                {restaurante?.email ? (
                  <>
                    <IconoEmail />
                    {` ${restaurante.email}`}
                  </>
                ) : null}
              </h5>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
