import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { enforceObfuscatedUrl, formatMonedaChilena } from '../services/apiClient.js';
import { IconoBasurero, SafeImage } from '../components/Icons.jsx';
import Footer from '../components/Footer.jsx';

export default function CarritoPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    carritoItems,
    carritoRestaurante,
    errorCarrito,
    recargarCarrito,
    eliminarDelCarrito,
    vaciarCarrito
  } = useApp();

  useEffect(() => {
    if (location.pathname !== '/carrito' || location.search !== '') {
      enforceObfuscatedUrl('/carrito');
      navigate('/carrito', { replace: true });
    }
    recargarCarrito().catch(() => {});
  }, [location.pathname, location.search, navigate, recargarCarrito]);

  useEffect(() => {
    document.title = carritoRestaurante?.nombre || 'Productos Seleccionados - PNK Security';
  }, [carritoRestaurante?.nombre]);

  async function handleLimpiar(ev) {
    ev.preventDefault();
    try {
      await vaciarCarrito();
    } catch {
      // Manejado por estado errorCarrito si aplica
    }
  }

  async function handleEliminar(ev, itemToken) {
    ev.preventDefault();
    try {
      await eliminarDelCarrito(itemToken);
    } catch {
      // Manejado por estado errorCarrito si aplica
    }
  }

  if (errorCarrito && !carritoRestaurante) {
    return (
      <div className="container contendor text-center py-4">
        {errorCarrito || 'El restaurante no fue encontrado.'}
      </div>
    );
  }

  return (
    <>
      <section>
        <div className="container contendor">
          <div className="row">
            <div className="col-lg-4">
              <div style={{ textAlign: 'center' }}>
                <div className="media">
                  <img className="logosintituciones" src="/img/logo.png" width="170px" alt="Logo PNK" />
                </div>
                <br />
                <br />
              </div>
            </div>
            <div className="col-lg-4">
              <div style={{ textAlign: 'center' }}>
                <SafeImage
                  id="carrito-restaurante-logo"
                  className="logosintituciones"
                  fotoUrl={carritoRestaurante?.fotoUrl}
                  alt={carritoRestaurante?.nombre}
                  fallbackSrc="/img/logo_empresa_comodin.png"
                  fallbackAlt="Logo Restaurante"
                  width="170px"
                />
              </div>
            </div>
            <div className="col-lg-4">
              <div className="carro">
                <div className="media float-right">
                  <Link className="volver" id="btn-volver-carta" to="/carta">
                    Volver a la Carta
                  </Link>
                  {'\u00A0\u00A0'}
                  <a className="limpiar" id="btn-limpiar-carrito" href="#" onClick={handleLimpiar}>
                    Eliminar Todo
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container contendor">
          <div className="row">
            <div className="col-lg-12">
              <h4 className="intro-title" style={{ textAlign: 'center' }}>
                Productos Agregados para Solicitar
              </h4>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="container contendor">
          <div className="row">
            <div className="col-lg-12">
              <table className="table table-hover table-lg">
                <thead>
                  <tr>
                    <th scope="col">Código</th>
                    <th scope="col">Producto</th>
                    <th scope="col">Precios</th>
                    <th scope="col">Acción</th>
                  </tr>
                </thead>
                <tbody id="carrito-tbody">
                  {Array.isArray(carritoItems) &&
                    carritoItems.map((value, idx) => (
                      <tr key={value.itemToken || idx}>
                        <th scope="row">{String(value.codigoVisual || idx + 1)}</th>
                        <td>{value.nombre || ''}</td>
                        <td>{formatMonedaChilena(value.precio)}</td>
                        <td>
                          <a
                            className="elim"
                            data-token={value.itemToken}
                            href="#"
                            onClick={(ev) => handleEliminar(ev, value.itemToken)}
                          >
                            <IconoBasurero />
                          </a>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <div>
                <hr />
                <br />
                <h3 className="price-tag text-center">
                  ¡¡¡Si estás listo con tu pedido, llama al garzón para solicitarlo!!!
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Footer variant="carrito" />
    </>
  );
}
