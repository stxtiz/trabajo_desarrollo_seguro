import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function NavbarAuth() {
  const { sesion, login, logout, showModal } = useApp();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  return (
    <nav className="navbar navbar-light bg-light" id="navbar-auth-container">
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
        <>
          {`Bienvenido : ${sesion.nombre} - `}
          <a href="#" onClick={handleLogout}>
            Cerrar Sesión
          </a>
        </>
      )}
    </nav>
  );
}
