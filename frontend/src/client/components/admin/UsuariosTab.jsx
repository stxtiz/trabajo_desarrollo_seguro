import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient.js';
import { extractList } from '../../utils/adminHelpers.js';

const EMPTY_FORM = {
  nombre: '',
  email: '',
  password: '',
  rol: 'user',
  estado: '1',
  intentosFallidos: 0
};

export default function UsuariosTab({ onNotify }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/v1/admin/usuarios');
      setItems(extractList(data, 'usuarios'));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar usuarios.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function resetForm() {
    setEditingToken(null);
    setForm(EMPTY_FORM);
  }

  function handleEdit(row) {
    setEditingToken(row.usuarioToken);
    setForm({
      nombre: row.nombre || '',
      email: row.email || '',
      password: '',
      rol: row.rol === 'admin' ? 'admin' : 'user',
      estado: String(row.estado) === '0' ? '0' : '1',
      intentosFallidos: Number(row.intentosFallidos || 0)
    });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setSaving(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        email: form.email.trim(),
        rol: form.rol,
        estado: form.estado
      };
      if (form.password) {
        payload.password = form.password;
      }

      if (editingToken) {
        await apiFetch(`/api/v1/admin/usuarios/${encodeURIComponent(editingToken)}`, {
          method: 'PUT',
          body: payload
        });
        onNotify('success', 'Usuario actualizado correctamente.');
      } else {
        if (!form.password) {
          onNotify('danger', 'La contraseña es requerida al crear un usuario.');
          setSaving(false);
          return;
        }
        await apiFetch('/api/v1/admin/usuarios', {
          method: 'POST',
          body: payload
        });
        onNotify('success', 'Usuario creado correctamente.');
      }
      resetForm();
      await cargar();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible guardar el usuario.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar al usuario "${row.nombre}" (${row.email})?`)) return;
    try {
      await apiFetch(`/api/v1/admin/usuarios/${encodeURIComponent(row.usuarioToken)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Usuario eliminado correctamente.');
      if (editingToken === row.usuarioToken) resetForm();
      await cargar();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar el usuario.');
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header font-weight-bold">
          {editingToken ? 'Editar Usuario' : 'Nuevo Usuario'}
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="usr-nombre">Nombre *</label>
                <input
                  id="usr-nombre"
                  type="text"
                  className="form-control"
                  required
                  maxLength={255}
                  value={form.nombre}
                  onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="usr-email">Email *</label>
                <input
                  id="usr-email"
                  type="email"
                  className="form-control"
                  required
                  maxLength={255}
                  value={form.email}
                  onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="usr-password">
                  {editingToken ? 'Nueva Contraseña (opcional, mín. 8)' : 'Contraseña (mín. 8) *'}
                </label>
                <input
                  id="usr-password"
                  type="password"
                  className="form-control"
                  required={!editingToken}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder={editingToken ? 'Dejar vacío para mantener' : ''}
                  value={form.password}
                  onChange={(ev) => setForm((f) => ({ ...f, password: ev.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="usr-rol">Rol *</label>
                <select
                  id="usr-rol"
                  className="form-control"
                  value={form.rol}
                  onChange={(ev) => setForm((f) => ({ ...f, rol: ev.target.value }))}
                >
                  <option value="user">Usuario (user)</option>
                  <option value="admin">Administrador (admin)</option>
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="usr-estado">Estado *</label>
                <select
                  id="usr-estado"
                  className="form-control"
                  value={form.estado}
                  onChange={(ev) => setForm((f) => ({ ...f, estado: ev.target.value }))}
                >
                  <option value="1">Activo (1)</option>
                  <option value="0">Inactivo (0)</option>
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="usr-intentos">Intentos Fallidos</label>
                <input
                  id="usr-intentos"
                  type="number"
                  className="form-control"
                  value={form.intentosFallidos}
                  readOnly
                />
              </div>
            </div>

            <div className="mt-2">
              <button type="submit" className="btn btn-primary mr-2" disabled={saving}>
                {saving ? 'Guardando...' : editingToken ? 'Actualizar Usuario' : 'Crear Usuario'}
              </button>
              {editingToken && (
                <button type="button" className="btn btn-secondary" onClick={resetForm}>
                  Cancelar Edición
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-hover table-bordered">
          <thead className="thead-light">
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Intentos Fallidos</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.usuarioToken}>
                  <td>{row.nombre}</td>
                  <td>{row.email}</td>
                  <td>
                    <span className={`badge ${row.rol === 'admin' ? 'badge-warning' : 'badge-info'}`}>
                      {row.rol}
                    </span>
                  </td>
                  <td>{String(row.estado) === '1' ? 'Activo' : 'Inactivo'}</td>
                  <td>{row.intentosFallidos ?? 0}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary mr-1 mb-1"
                      onClick={() => handleEdit(row)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger mb-1"
                      onClick={() => handleDelete(row)}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
