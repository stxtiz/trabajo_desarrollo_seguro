import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';

export default function NavbarAuth() {
  const location = useLocation();
  const {
    sesion,
    isAdmin,
    restaurante,
    restaurantes,
    restauranteRef,
    login,
    logout,
    cambiarRestaurante,
    showModal
  } = useApp();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switchingRest, setSwitchingRest] = useState(false);

  const isOnAdmin = location.pathname === '/admin';

  async function handleSubmit(ev) {
    ev.preventDefault();
    setSubmitting(true);
    try {
      await login(usuario, password);
      setPassword('');
    } catch (err) {
      showModal(err.message || 'Credenciales inválidas.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogout(ev) {
    ev.preventDefault();
    try {
      await logout();
    } catch (err) {
      showModal(err.message || 'No fue posible cerrar la sesión.');
    }
  }

  async function handleRestauranteChange(ev) {
    const newRef = ev.target.value;
    if (!newRef || newRef === (restaurante?.ref || restauranteRef)) {
      return;
    }
    setSwitchingRest(true);
    try {
      await cambiarRestaurante(newRef);
    } catch (err) {
      showModal(err.message || 'No fue posible cambiar de restaurante.');
    } finally {
      setSwitchingRest(false);
    }
  }

  return (
    <nav className="navbar navbar-light bg-light justify-content-between flex-wrap" id="navbar-auth-container">
      <div>
        {!sesion?.autenticado ? (
          <form className="form-inline" role="search" onSubmit={handleSubmit}>
            <div className="form-group mr-2">
              <div className="input-group-prepend">
                <span className="input-group-text" id="basic-addon1">
                  @
                </span>
              </div>
              <input
                type="text"
                className="form-control"
                name="frmusuario"
                placeholder="Usuario"
                required
                autoComplete="username"
                value={usuario}
                onChange={(ev) => setUsuario(ev.target.value)}
              />
            </div>
            <div className="form-group mr-2">
              <input
                type="password"
                className="form-control"
                name="frmpassword"
                placeholder="Contraseña"
                required
                autoComplete="current-password"
                value={password}
                onChange={(ev) => setPassword(ev.target.value)}
              />
            </div>
            <button
              type="submit"
              className="btn btn-outline-primary my-2 my-sm-0"
              disabled={submitting}
            >
              Ingresar
            </button>
          </form>
        ) : (
          <span>
            {`Bienvenido : ${sesion.nombre} - `}
            <a href="#" onClick={handleLogout}>
              Cerrar Sesión
            </a>
            {isAdmin && (
              <>
                <Link to="/admin" id="btn-panel-admin" className="btn btn-sm btn-warning ml-2 mr-2">
                  Panel CRUD Admin
                </Link>
                {isOnAdmin && (
                  <Link to="/carta" className="btn btn-sm btn-outline-secondary ml-2 mr-2">
                    Ver Carta Pública
                  </Link>
                )}
              </>
            )}
          </span>
        )}
      </div>

      <div className="form-inline my-2 my-lg-0">
        <label htmlFor="select-restaurante" className="mr-2 mb-0 font-weight-bold">
          Restaurante:
        </label>
        <select
          id="select-restaurante"
          className="form-control mr-2"
          aria-label="Seleccionar restaurante"
          value={restaurante?.ref || restauranteRef || ''}
          onChange={handleRestauranteChange}
          disabled={switchingRest || !Array.isArray(restaurantes) || restaurantes.length === 0}
        >
          {Array.isArray(restaurantes) && restaurantes.length > 0 ? (
            restaurantes.map((r) => (
              <option key={r.ref} value={r.ref}>
                {r.comuna ? `${r.nombre} (${r.comuna})` : r.nombre}
              </option>
            ))
          ) : (
            <option value="">Cargando restaurantes...</option>
          )}
        </select>
      </div>
    </nav>
  );
}
