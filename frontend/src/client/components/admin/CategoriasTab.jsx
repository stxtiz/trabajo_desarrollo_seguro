import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient.js';
import { SafeImage } from '../Icons.jsx';
import AdminImageField from './AdminImageField.jsx';
import { appendFotoData, extractList, toBool } from '../../utils/adminHelpers.js';

const EMPTY_FORM = {
  cartaToken: '',
  nombre: '',
  orden: '1',
  visible: true,
  foto: '',
  fotoData: undefined,
  fotoUrl: ''
};

export default function CategoriasTab({ restRef, onNotify, onDataMutated }) {
  const [cartas, setCartas] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    if (!restRef) return;
    setLoading(true);
    try {
      const [cartasRes, catsRes] = await Promise.all([
        apiFetch(`/api/v1/admin/cartas?restRef=${encodeURIComponent(restRef)}`),
        apiFetch(`/api/v1/admin/categorias?restRef=${encodeURIComponent(restRef)}`)
      ]);
      const cartasList = extractList(cartasRes, 'cartas');
      setCartas(cartasList);
      setItems(extractList(catsRes, 'categorias'));
      setForm((prev) => ({
        ...prev,
        cartaToken:
          prev.cartaToken && cartasList.some((c) => c.cartaToken === prev.cartaToken)
            ? prev.cartaToken
            : cartasList[0]?.cartaToken || ''
      }));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar categorías.');
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
    setForm({
      ...EMPTY_FORM,
      cartaToken: cartas[0]?.cartaToken || ''
    });
  }

  function handleEdit(row) {
    setEditingToken(row.categoriaToken);
    setForm({
      cartaToken: row.cartaToken || cartas[0]?.cartaToken || '',
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
    if (!form.cartaToken) {
      onNotify('danger', 'Debe seleccionar o crear una Carta primero.');
      return;
    }
    setSaving(true);
    try {
      const basePayload = {
        cartaToken: form.cartaToken,
        nombre: form.nombre.trim(),
        orden: Number.parseInt(form.orden, 10) || 0,
        visible: Boolean(form.visible),
        foto: form.foto.trim()
      };
      const payload = appendFotoData(basePayload, form.fotoData, Boolean(editingToken));

      if (editingToken) {
        await apiFetch(`/api/v1/admin/categorias/${encodeURIComponent(editingToken)}`, {
          method: 'PUT',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Categoría actualizada correctamente.');
      } else {
        await apiFetch('/api/v1/admin/categorias', {
          method: 'POST',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Categoría creada correctamente.');
      }
      resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible guardar la categoría.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar la categoría "${row.nombre}"?`)) return;
    try {
      await apiFetch(`/api/v1/admin/categorias/${encodeURIComponent(row.categoriaToken)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Categoría eliminada correctamente.');
      if (editingToken === row.categoriaToken) resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar la categoría.');
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header font-weight-bold">
          {editingToken ? 'Editar Categoría' : 'Nueva Categoría'}
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row align-items-center">
              <div className="form-group col-md-4">
                <label htmlFor="cat-carta">Carta *</label>
                <select
                  id="cat-carta"
                  className="form-control"
                  required
                  value={form.cartaToken}
                  onChange={(ev) => setForm((f) => ({ ...f, cartaToken: ev.target.value }))}
                >
                  {cartas.length === 0 ? (
                    <option value="">Sin cartas disponibles</option>
                  ) : (
                    cartas.map((c) => (
                      <option key={c.cartaToken} value={c.cartaToken}>
                        {c.nombre}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="cat-nombre">Nombre *</label>
                <input
                  id="cat-nombre"
                  type="text"
                  className="form-control"
                  required
                  maxLength={100}
                  value={form.nombre}
                  onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-2">
                <label htmlFor="cat-orden">Orden</label>
                <input
                  id="cat-orden"
                  type="number"
                  className="form-control"
                  min={0}
                  max={999}
                  value={form.orden}
                  onChange={(ev) => setForm((f) => ({ ...f, orden: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-2 pt-3">
                <div className="form-check">
                  <input
                    id="cat-visible"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.visible}
                    onChange={(ev) => setForm((f) => ({ ...f, visible: ev.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="cat-visible">
                    Visible
                  </label>
                </div>
              </div>
            </div>

            <AdminImageField
              idPrefix="cat"
              foto={form.foto}
              fotoData={form.fotoData}
              fotoUrl={form.fotoUrl}
              onFotoChange={(foto) => setForm((f) => ({ ...f, foto }))}
              onFotoDataChange={(fotoData) => setForm((f) => ({ ...f, fotoData }))}
              onError={(msg) => onNotify('danger', msg)}
            />

            <div className="mt-2">
              <button
                type="submit"
                className="btn btn-primary mr-2"
                disabled={saving || cartas.length === 0}
              >
                {saving ? 'Guardando...' : editingToken ? 'Actualizar Categoría' : 'Crear Categoría'}
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
              <th>Carta</th>
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
                <td colSpan={6} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center">
                  No hay categorías registradas para este restaurante.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.categoriaToken}>
                  <td>{row.cartaNombre || '-'}</td>
                  <td>{row.nombre}</td>
                  <td>{row.orden ?? '-'}</td>
                  <td>{toBool(row.visible) ? 'Sí' : 'No'}</td>
                  <td>
                    <SafeImage
                      fotoUrl={row.fotoUrl}
                      alt={row.nombre}
                      fallbackSrc="/img/carta_comodin.png"
                      fallbackAlt="Categoría"
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
