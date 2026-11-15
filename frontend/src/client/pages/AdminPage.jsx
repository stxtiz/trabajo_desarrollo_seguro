import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { enforceObfuscatedUrl } from '../services/apiClient.js';
import NavbarAuth from '../components/NavbarAuth.jsx';
import ProductModal from '../components/ProductModal.jsx';
import Footer from '../components/Footer.jsx';
import RestaurantesTab from '../components/admin/RestaurantesTab.jsx';
import CartasTab from '../components/admin/CartasTab.jsx';
import CategoriasTab from '../components/admin/CategoriasTab.jsx';
import ItemsTab from '../components/admin/ItemsTab.jsx';
import ComentariosTab from '../components/admin/ComentariosTab.jsx';
import UsuariosTab from '../components/admin/UsuariosTab.jsx';

const TABS = [
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'cartas', label: 'Cartas / Menús' },
  { id: 'categorias', label: 'Categorías' },
  { id: 'items', label: 'Ítems / Productos' },
  { id: 'comentarios', label: 'Comentarios' },
  { id: 'usuarios', label: 'Usuarios' }
];

export default function AdminPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { sesion, isAdmin, restaurante, restaurantes, recargarCarta } = useApp();

  const [activeTab, setActiveTab] = useState('restaurantes');
  const [selectedRestRef, setSelectedRestRef] = useState('');
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (location.pathname !== '/admin' || location.search !== '') {
      enforceObfuscatedUrl('/admin');
      navigate('/admin', { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    document.title = 'Panel CRUD Admin - Carta Digital PNK';
    recargarCarta().catch(() => {});
  }, [recargarCarta]);

  useEffect(() => {
    if (!Array.isArray(restaurantes) || restaurantes.length === 0) return;
    setSelectedRestRef((prev) => {
      if (prev && restaurantes.some((r) => r.ref === prev)) {
        return prev;
      }
      if (restaurante?.ref && restaurantes.some((r) => r.ref === restaurante.ref)) {
        return restaurante.ref;
      }
      return restaurantes[0].ref;
    });
  }, [restaurante?.ref, restaurantes]);

  const handleNotify = useCallback((type, message) => {
    setAlert({ type, message });
  }, []);

  const handleDataMutated = useCallback(async () => {
    await recargarCarta().catch(() => {});
  }, [recargarCarta]);

  return (
    <>
      <NavbarAuth />
      <ProductModal />

      <section className="py-4">
        <div className="container contendor p-4">
          {!sesion?.autenticado || sesion?.rol !== 'admin' || !isAdmin ? (
            <div className="card border-danger my-3">
              <div className="card-body text-center">
                <h4 className="text-danger mb-3">
                  Acceso restringido exclusivamente a Administradores (OWASP ASVS v5.0 V4.1)
                </h4>
                <p className="mb-3">
                  Inicia sesión con una cuenta con rol de administrador en la barra superior para
                  administrar restaurantes, cartas, categorías, ítems, comentarios y usuarios.
                </p>
                <Link to="/carta" className="btn btn-primary">
                  Volver a la Carta Digital
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 pb-2 border-bottom">
                <div>
                  <h3 className="mb-1">Panel Administrativo CRUD</h3>
                  <small className="text-muted">
                    Gestión centralizada bajo OWASP ASVS v5.0 Nivel 3 (Tokens opacos &amp; CSRF)
                  </small>
                </div>
                <div className="form-inline mt-2 mt-md-0">
                  <label htmlFor="admin-context-restaurante" className="mr-2 font-weight-bold mb-0">
                    Restaurante en edición:
                  </label>
                  <select
                    id="admin-context-restaurante"
                    className="form-control"
                    value={selectedRestRef}
                    onChange={(ev) => {
                      setAlert(null);
                      setSelectedRestRef(ev.target.value);
                    }}
                  >
                    {restaurantes.map((r) => (
                      <option key={r.ref} value={r.ref}>
                        {r.comuna ? `${r.nombre} (${r.comuna})` : r.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {alert && (
                <div
                  className={`alert alert-${alert.type} alert-dismissible fade show`}
                  role="alert"
                >
                  {alert.message}
                  <button
                    type="button"
                    className="close"
                    aria-label="Cerrar"
                    onClick={() => setAlert(null)}
                  >
                    <span aria-hidden="true">&times;</span>
                  </button>
                </div>
              )}

              <ul className="nav nav-tabs mb-4" id="admin-crud-tabs" role="tablist">
                {TABS.map((tab) => {
                  const active = activeTab === tab.id;
                  return (
                    <li className="nav-item" key={tab.id}>
                      <a
                        className={`nav-link${active ? ' active font-weight-bold' : ''}`}
                        id={`admin-tab-${tab.id}`}
                        href={`#panel-${tab.id}`}
                        role="tab"
                        aria-selected={active ? 'true' : 'false'}
                        onClick={(ev) => {
                          ev.preventDefault();
                          setAlert(null);
                          setActiveTab(tab.id);
                        }}
                      >
                        {tab.label}
                      </a>
                    </li>
                  );
                })}
              </ul>

              <div className="tab-content border-0 p-0 bg-transparent">
                {activeTab === 'restaurantes' && (
                  <RestaurantesTab
                    onNotify={handleNotify}
                    onRestaurantesUpdated={handleDataMutated}
                  />
                )}
                {activeTab === 'cartas' && (
                  <CartasTab
                    restRef={selectedRestRef}
                    onNotify={handleNotify}
                    onDataMutated={handleDataMutated}
                  />
                )}
                {activeTab === 'categorias' && (
                  <CategoriasTab
                    restRef={selectedRestRef}
                    onNotify={handleNotify}
                    onDataMutated={handleDataMutated}
                  />
                )}
                {activeTab === 'items' && (
                  <ItemsTab
                    restRef={selectedRestRef}
                    onNotify={handleNotify}
                    onDataMutated={handleDataMutated}
                  />
                )}
                {activeTab === 'comentarios' && (
                  <ComentariosTab
                    restRef={selectedRestRef}
                    onNotify={handleNotify}
                    onDataMutated={handleDataMutated}
                  />
                )}
                {activeTab === 'usuarios' && <UsuariosTab onNotify={handleNotify} />}
              </div>
            </>
          )}
        </div>
      </section>

      <Footer variant="carta" />
    </>
  );
}
