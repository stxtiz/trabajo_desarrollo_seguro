import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient.js';
import { SafeImage } from '../Icons.jsx';
import AdminImageField from './AdminImageField.jsx';
import { appendFotoData, extractList, toBool } from '../../utils/adminHelpers.js';

const EMPTY_FORM = {
  nombre: '',
  orden: '1',
  visible: true,
  foto: '',
  fotoData: undefined,
  fotoUrl: ''
};

export default function CartasTab({ restRef, onNotify, onDataMutated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    if (!restRef) return;
    setLoading(true);
    try {
      const data = await apiFetch(`/api/v1/admin/cartas?restRef=${encodeURIComponent(restRef)}`);
      setItems(extractList(data, 'cartas'));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar cartas.');
    } finally {
      setLoading(false);
    }
  }, [restRef, onNotify]);

  useEffect(() => {
    setEditingToken(null);
    setForm(EMPTY_FORM);
    cargar();
  }, [cargar]);

  function resetForm() {
    setEditingToken(null);
    setForm(EMPTY_FORM);
  }

  function handleEdit(row) {
    setEditingToken(row.cartaToken);
    setForm({
      nombre: row.nombre || '',
      orden: row.orden !== null && row.orden !== undefined ? String(row.orden) : '1',
      visible: toBool(row.visible),
      foto: row.foto || '',
      fotoData: undefined,
      fotoUrl: row.fotoUrl || ''
    });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!restRef) return;
    setSaving(true);
    try {
      const basePayload = {
        nombre: form.nombre.trim(),
        orden: Number.parseInt(form.orden, 10) || 0,
        visible: Boolean(form.visible),
        foto: form.foto.trim()
      };
      if (!editingToken) {
        basePayload.restRef = restRef;
      }
      const payload = appendFotoData(basePayload, form.fotoData, Boolean(editingToken));

      if (editingToken) {
        await apiFetch(`/api/v1/admin/cartas/${encodeURIComponent(editingToken)}`, {
          method: 'PUT',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Carta actualizada correctamente.');
      } else {
        await apiFetch('/api/v1/admin/cartas', {
          method: 'POST',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Carta creada correctamente.');
      }
      resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible guardar la carta.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar la carta "${row.nombre}"?`)) return;
    try {
      await apiFetch(`/api/v1/admin/cartas/${encodeURIComponent(row.cartaToken)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Carta eliminada correctamente.');
      if (editingToken === row.cartaToken) resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar la carta.');
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header font-weight-bold">
          {editingToken ? 'Editar Carta / Menú' : 'Nueva Carta / Menú'}
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row align-items-center">
              <div className="form-group col-md-5">
                <label htmlFor="carta-nombre">Nombre *</label>
                <input
                  id="carta-nombre"
                  type="text"
                  className="form-control"
                  required
                  maxLength={45}
                  value={form.nombre}
                  onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-3">
                <label htmlFor="carta-orden">Orden</label>
                <input
                  id="carta-orden"
                  type="number"
                  className="form-control"
                  min={0}
                  max={999}
                  value={form.orden}
                  onChange={(ev) => setForm((f) => ({ ...f, orden: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4 pt-3">
                <div className="form-check">
                  <input
                    id="carta-visible"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.visible}
                    onChange={(ev) => setForm((f) => ({ ...f, visible: ev.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="carta-visible">
                    Visible en carta pública
                  </label>
                </div>
              </div>
            </div>

            <AdminImageField
              idPrefix="carta"
              foto={form.foto}
              fotoData={form.fotoData}
              fotoUrl={form.fotoUrl}
              onFotoChange={(foto) => setForm((f) => ({ ...f, foto }))}
              onFotoDataChange={(fotoData) => setForm((f) => ({ ...f, fotoData }))}
              onError={(msg) => onNotify('danger', msg)}
            />

            <div className="mt-2">
              <button type="submit" className="btn btn-primary mr-2" disabled={saving || !restRef}>
                {saving ? 'Guardando...' : editingToken ? 'Actualizar Carta' : 'Crear Carta'}
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
              <th>Orden</th>
              <th>Visible</th>
              <th>Foto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center">
                  No hay cartas registradas para este restaurante.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.cartaToken}>
                  <td>{row.nombre}</td>
                  <td>{row.orden ?? '-'}</td>
                  <td>{toBool(row.visible) ? 'Sí' : 'No'}</td>
                  <td>
                    <SafeImage
                      fotoUrl={row.fotoUrl}
                      alt={row.nombre}
                      fallbackSrc="/img/carta_comodin.png"
                      fallbackAlt="Carta"
                      width="48"
                      height="48"
                      style={{ objectFit: 'cover' }}
                    />
                  </td>
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
