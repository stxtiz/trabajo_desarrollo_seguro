import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient.js';
import { extractList, formatFecha } from '../../utils/adminHelpers.js';

export default function ComentariosTab({ restRef, onNotify, onDataMutated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [editText, setEditText] = useState('');

  const cargar = useCallback(async () => {
    if (!restRef) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/v1/admin/comentarios?restRef=${encodeURIComponent(restRef)}`);
      setItems(extractList(data, 'comentarios'));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar comentarios.');
    } finally {
      setLoading(false);
    }
  }, [restRef, onNotify]);

  useEffect(() => {
    setEditingToken(null);
    setEditText('');
    cargar();
  }, [cargar]);

  function startEdit(row) {
    setEditingToken(row.comentarioToken);
    setEditText(row.comentario || '');
  }

  function cancelEdit() {
    setEditingToken(null);
    setEditText('');
  }

  async function handleSave(ev) {
    ev.preventDefault();
    const trimmed = editText.trim();
    if (!editingToken || !trimmed) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/admin/comentarios/${encodeURIComponent(editingToken)}`, {
        method: 'PUT',
        body: { comentario: trimmed }
      });
      onNotify('success', 'Comentario actualizado correctamente.');
      cancelEdit();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible actualizar el comentario.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar el comentario de "${row.usuario}"?`)) return;
    try {
      await apiFetch(`/api/v1/admin/comentarios/${encodeURIComponent(row.comentarioToken)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Comentario eliminado correctamente.');
      if (editingToken === row.comentarioToken) cancelEdit();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar el comentario.');
    }
  }

  return (
    <div>
      {editingToken && (
        <div className="card mb-4">
          <div className="card-header font-weight-bold">Moderar / Editar Comentario</div>
          <div className="card-body">
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label htmlFor="com-edit-texto">Texto del comentario *</label>
                <textarea
                  id="com-edit-texto"
                  className="form-control"
                  rows={3}
                  required
                  maxLength={1000}
                  value={editText}
                  onChange={(ev) => setEditText(ev.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary mr-2" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-hover table-bordered">
          <thead className="thead-light">
            <tr>
              <th>Usuario</th>
              <th>Comentario</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={4} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center">
                  No hay comentarios registrados para este restaurante.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.comentarioToken}>
                  <td>{row.usuario}</td>
                  <td>{row.comentario}</td>
                  <td>{formatFecha(row.creado)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-primary mr-1 mb-1"
                      onClick={() => startEdit(row)}
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
