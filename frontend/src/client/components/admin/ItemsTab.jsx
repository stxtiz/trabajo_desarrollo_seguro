import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, formatMonedaChilena } from '../../services/apiClient.js';
import { SafeImage } from '../Icons.jsx';
import AdminImageField from './AdminImageField.jsx';
import { appendFotoData, extractList, toBool } from '../../utils/adminHelpers.js';

const EMPTY_FORM = {
  categoriaToken: '',
  nombre: '',
  descripcion: '',
  observaciones: '',
  tiempo: '',
  precio: '0',
  puntuacion: '5',
  orden: '1',
  visible: true,
  destacado: false,
  foto: '',
  fotoData: undefined,
  fotoUrl: ''
};

export default function ItemsTab({ restRef, onNotify, onDataMutated }) {
  const [categorias, setCategorias] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingToken, setEditingToken] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    if (!restRef) return;
    setLoading(true);
    try {
      const [catsRes, itemsRes] = await Promise.all([
        apiFetch(`/api/v1/admin/categorias?restRef=${encodeURIComponent(restRef)}`),
        apiFetch(`/api/v1/admin/items?restRef=${encodeURIComponent(restRef)}`)
      ]);
      const catsList = extractList(catsRes, 'categorias');
      setCategorias(catsList);
      setItems(extractList(itemsRes, 'items'));
      setForm((prev) => ({
        ...prev,
        categoriaToken:
          prev.categoriaToken && catsList.some((c) => c.categoriaToken === prev.categoriaToken)
            ? prev.categoriaToken
            : catsList[0]?.categoriaToken || ''
      }));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar ítems.');
    } finally {
      setLoading(false);
    }
  }, [restRef, onNotify]);

  useEffect(() => {
    setEditingToken(null);
    setForm(EMPTY_FORM);
    cargar();
  }, [cargar]);

  const categoriasAgrupadas = useMemo(() => {
    const groups = new Map();
    for (const cat of categorias) {
      const groupName = cat.cartaNombre || 'Carta';
      if (!groups.has(groupName)) {
        groups.set(groupName, []);
      }
      groups.get(groupName).push(cat);
    }
    return Array.from(groups.entries());
  }, [categorias]);

  function resetForm() {
    setEditingToken(null);
    setForm({
      ...EMPTY_FORM,
      categoriaToken: categorias[0]?.categoriaToken || ''
    });
  }

  function handleEdit(row) {
    setEditingToken(row.itemToken);
    setForm({
      categoriaToken: row.categoriaToken || categorias[0]?.categoriaToken || '',
      nombre: row.nombre || '',
      descripcion: row.descripcion || '',
      observaciones: row.observaciones || '',
      tiempo: row.tiempo || '',
      precio: row.precio !== null && row.precio !== undefined ? String(row.precio) : '0',
      puntuacion: row.puntuacion !== null && row.puntuacion !== undefined ? String(row.puntuacion) : '0',
      orden: row.orden !== null && row.orden !== undefined ? String(row.orden) : '1',
      visible: toBool(row.visible),
      destacado: toBool(row.destacado),
      foto: row.foto || '',
      fotoData: undefined,
      fotoUrl: row.fotoUrl || ''
    });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    if (!form.categoriaToken) {
      onNotify('danger', 'Debe seleccionar o crear una Categoría primero.');
      return;
    }
    setSaving(true);
    try {
      const precioNum = Math.max(0, Number.parseInt(form.precio, 10) || 0);
      const puntuacionNum = Math.max(0, Math.min(5, Number.parseInt(form.puntuacion, 10) || 0));
      const ordenNum = Number.parseInt(form.orden, 10) || 0;

      const basePayload = {
        categoriaToken: form.categoriaToken,
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        observaciones: form.observaciones.trim(),
        tiempo: form.tiempo.trim(),
        precio: precioNum,
        puntuacion: puntuacionNum,
        orden: ordenNum,
        visible: Boolean(form.visible),
        destacado: Boolean(form.destacado),
        foto: form.foto.trim()
      };
      const payload = appendFotoData(basePayload, form.fotoData, Boolean(editingToken));

      if (editingToken) {
        await apiFetch(`/api/v1/admin/items/${encodeURIComponent(editingToken)}`, {
          method: 'PUT',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Ítem actualizado correctamente.');
      } else {
        await apiFetch('/api/v1/admin/items', {
          method: 'POST',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Ítem creado correctamente.');
      }
      resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible guardar el ítem.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar el ítem "${row.nombre}"?`)) return;
    try {
      await apiFetch(`/api/v1/admin/items/${encodeURIComponent(row.itemToken)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Ítem eliminado correctamente.');
      if (editingToken === row.itemToken) resetForm();
      await cargar();
      if (onDataMutated) await onDataMutated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar el ítem.');
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header font-weight-bold">
          {editingToken ? 'Editar Ítem / Producto' : 'Nuevo Ítem / Producto'}
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="item-categoria">Categoría (Carta &rarr; Categoría) *</label>
                <select
                  id="item-categoria"
                  className="form-control"
                  required
                  value={form.categoriaToken}
                  onChange={(ev) => setForm((f) => ({ ...f, categoriaToken: ev.target.value }))}
                >
                  {categorias.length === 0 ? (
                    <option value="">Sin categorías disponibles</option>
                  ) : (
                    categoriasAgrupadas.map(([cartaNombre, cats]) => (
                      <optgroup key={cartaNombre} label={cartaNombre}>
                        {cats.map((c) => (
                          <option key={c.categoriaToken} value={c.categoriaToken}>
                            {`${cartaNombre} → ${c.nombre}`}
                          </option>
                        ))}
                      </optgroup>
                    ))
                  )}
                </select>
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="item-nombre">Nombre *</label>
                <input
                  id="item-nombre"
                  type="text"
                  className="form-control"
                  required
                  maxLength={100}
                  value={form.nombre}
                  onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="item-tiempo">Tiempo preparación</label>
                <input
                  id="item-tiempo"
                  type="text"
                  className="form-control"
                  maxLength={100}
                  placeholder="ej: 20 minutos"
                  value={form.tiempo}
                  onChange={(ev) => setForm((f) => ({ ...f, tiempo: ev.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-md-6">
                <label htmlFor="item-descripcion">Descripción</label>
                <input
                  id="item-descripcion"
                  type="text"
                  className="form-control"
                  maxLength={300}
                  value={form.descripcion}
                  onChange={(ev) => setForm((f) => ({ ...f, descripcion: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-6">
                <label htmlFor="item-observaciones">Observaciones</label>
                <input
                  id="item-observaciones"
                  type="text"
                  className="form-control"
                  maxLength={300}
                  value={form.observaciones}
                  onChange={(ev) => setForm((f) => ({ ...f, observaciones: ev.target.value }))}
                />
              </div>
            </div>

            <div className="form-row align-items-center">
              <div className="form-group col-md-3">
                <label htmlFor="item-precio">Precio (CLP) *</label>
                <input
                  id="item-precio"
                  type="number"
                  className="form-control"
                  required
                  min={0}
                  max={10000000}
                  value={form.precio}
                  onChange={(ev) => setForm((f) => ({ ...f, precio: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-2">
                <label htmlFor="item-puntuacion">Puntuación (0-5)</label>
                <input
                  id="item-puntuacion"
                  type="number"
                  className="form-control"
                  min={0}
                  max={5}
                  value={form.puntuacion}
                  onChange={(ev) => setForm((f) => ({ ...f, puntuacion: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-2">
                <label htmlFor="item-orden">Orden</label>
                <input
                  id="item-orden"
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
                    id="item-visible"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.visible}
                    onChange={(ev) => setForm((f) => ({ ...f, visible: ev.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="item-visible">
                    Visible
                  </label>
                </div>
              </div>
              <div className="form-group col-md-3 pt-3">
                <div className="form-check">
                  <input
                    id="item-destacado"
                    type="checkbox"
                    className="form-check-input"
                    checked={form.destacado}
                    onChange={(ev) => setForm((f) => ({ ...f, destacado: ev.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="item-destacado">
                    Menú Destacado
                  </label>
                </div>
              </div>
            </div>

            <AdminImageField
              idPrefix="item"
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
                disabled={saving || categorias.length === 0}
              >
                {saving ? 'Guardando...' : editingToken ? 'Actualizar Ítem' : 'Crear Ítem'}
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
              <th>Carta / Categoría</th>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Puntos</th>
              <th>Orden</th>
              <th>Visible</th>
              <th>Destacado</th>
              <th>Foto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center">
                  No hay ítems registrados para este restaurante.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.itemToken}>
                  <td>{`${row.cartaNombre || '-'} → ${row.categoriaNombre || '-'}`}</td>
                  <td>{row.nombre}</td>
                  <td>{formatMonedaChilena(row.precio)}</td>
                  <td>{row.puntuacion ?? 0}</td>
                  <td>{row.orden ?? '-'}</td>
                  <td>{toBool(row.visible) ? 'Sí' : 'No'}</td>
                  <td>{toBool(row.destacado) ? 'Sí' : 'No'}</td>
                  <td>
                    <SafeImage
                      fotoUrl={row.fotoUrl}
                      alt={row.nombre}
                      fallbackSrc="/img/carta_comodin.png"
                      fallbackAlt="Ítem"
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
