import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../../services/apiClient.js';
import { SafeImage } from '../Icons.jsx';
import AdminImageField from './AdminImageField.jsx';
import { appendFotoData, extractList } from '../../utils/adminHelpers.js';

const EMPTY_FORM = {
  nombre: '',
  rut: '',
  fono: '',
  email: '',
  calle: '',
  numero: '',
  comuna: '',
  region: '',
  foto: '',
  fotoData: undefined,
  fotoUrl: ''
};

export default function RestaurantesTab({ onNotify, onRestaurantesUpdated }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRef, setEditingRef] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch('/api/v1/admin/restaurantes');
      setItems(extractList(data, 'restaurantes'));
    } catch (err) {
      onNotify('danger', err.message || 'Error al cargar restaurantes.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function resetForm() {
    setEditingRef(null);
    setForm(EMPTY_FORM);
  }

  function handleEdit(row) {
    setEditingRef(row.ref);
    setForm({
      nombre: row.nombre || '',
      rut: row.rut || '',
      fono: row.fono || '',
      email: row.email || '',
      calle: row.calle || '',
      numero: row.numero || '',
      comuna: row.comuna || '',
      region: row.region || '',
      foto: row.foto || '',
      fotoData: undefined,
      fotoUrl: row.fotoUrl || ''
    });
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    setSaving(true);
    try {
      const basePayload = {
        nombre: form.nombre.trim(),
        rut: form.rut.trim(),
        fono: form.fono.trim(),
        email: form.email.trim(),
        calle: form.calle.trim(),
        numero: form.numero.trim(),
        comuna: form.comuna.trim(),
        region: form.region.trim(),
        foto: form.foto.trim()
      };
      const payload = appendFotoData(basePayload, form.fotoData, Boolean(editingRef));

      if (editingRef) {
        await apiFetch(`/api/v1/admin/restaurantes/${encodeURIComponent(editingRef)}`, {
          method: 'PUT',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Restaurante actualizado correctamente.');
      } else {
        await apiFetch('/api/v1/admin/restaurantes', {
          method: 'POST',
          body: payload,
          timeoutMs: 15000
        });
        onNotify('success', 'Restaurante creado correctamente.');
      }
      resetForm();
      await cargar();
      if (onRestaurantesUpdated) await onRestaurantesUpdated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible guardar el restaurante.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row) {
    if (!window.confirm(`¿Eliminar el restaurante "${row.nombre}"?`)) return;
    try {
      await apiFetch(`/api/v1/admin/restaurantes/${encodeURIComponent(row.ref)}`, {
        method: 'DELETE'
      });
      onNotify('success', 'Restaurante eliminado correctamente.');
      if (editingRef === row.ref) resetForm();
      await cargar();
      if (onRestaurantesUpdated) await onRestaurantesUpdated();
    } catch (err) {
      onNotify('danger', err.message || 'No fue posible eliminar el restaurante.');
    }
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header font-weight-bold">
          {editingRef ? 'Editar Restaurante y Dirección' : 'Nuevo Restaurante y Dirección'}
        </div>
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group col-md-5">
                <label htmlFor="rest-nombre">Nombre *</label>
                <input
                  id="rest-nombre"
                  type="text"
                  className="form-control"
                  required
                  maxLength={200}
                  value={form.nombre}
                  onChange={(ev) => setForm((f) => ({ ...f, nombre: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-3">
                <label htmlFor="rest-rut">RUT *</label>
                <input
                  id="rest-rut"
                  type="text"
                  className="form-control"
                  required
                  maxLength={15}
                  placeholder="99887766-5"
                  value={form.rut}
                  onChange={(ev) => setForm((f) => ({ ...f, rut: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="rest-fono">Teléfono *</label>
                <input
                  id="rest-fono"
                  type="text"
                  className="form-control"
                  required
                  maxLength={45}
                  value={form.fono}
                  onChange={(ev) => setForm((f) => ({ ...f, fono: ev.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-md-4">
                <label htmlFor="rest-email">Email</label>
                <input
                  id="rest-email"
                  type="email"
                  className="form-control"
                  maxLength={100}
                  value={form.email}
                  onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="rest-calle">Calle *</label>
                <input
                  id="rest-calle"
                  type="text"
                  className="form-control"
                  required
                  maxLength={100}
                  value={form.calle}
                  onChange={(ev) => setForm((f) => ({ ...f, calle: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-4">
                <label htmlFor="rest-numero">Número *</label>
                <input
                  id="rest-numero"
                  type="text"
                  className="form-control"
                  required
                  maxLength={15}
                  value={form.numero}
                  onChange={(ev) => setForm((f) => ({ ...f, numero: ev.target.value }))}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group col-md-6">
                <label htmlFor="rest-comuna">Comuna *</label>
                <input
                  id="rest-comuna"
                  type="text"
                  className="form-control"
                  required
                  maxLength={100}
                  value={form.comuna}
                  onChange={(ev) => setForm((f) => ({ ...f, comuna: ev.target.value }))}
                />
              </div>
              <div className="form-group col-md-6">
                <label htmlFor="rest-region">Región</label>
                <input
                  id="rest-region"
                  type="text"
                  className="form-control"
                  maxLength={100}
                  value={form.region}
                  onChange={(ev) => setForm((f) => ({ ...f, region: ev.target.value }))}
                />
              </div>
            </div>

            <AdminImageField
              idPrefix="rest"
              foto={form.foto}
              fotoData={form.fotoData}
              fotoUrl={form.fotoUrl}
              onFotoChange={(foto) => setForm((f) => ({ ...f, foto }))}
              onFotoDataChange={(fotoData) => setForm((f) => ({ ...f, fotoData }))}
              onError={(msg) => onNotify('danger', msg)}
            />

            <div className="mt-2">
              <button type="submit" className="btn btn-primary mr-2" disabled={saving}>
                {saving ? 'Guardando...' : editingRef ? 'Actualizar Restaurante' : 'Crear Restaurante'}
              </button>
              {editingRef && (
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
              <th>RUT</th>
              <th>Teléfono</th>
              <th>Email</th>
              <th>Dirección</th>
              <th>Foto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center">
                  Cargando...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center">
                  No hay restaurantes registrados.
                </td>
              </tr>
            ) : (
              items.map((row) => (
                <tr key={row.ref}>
                  <td>{row.nombre}</td>
                  <td>{row.rut}</td>
                  <td>{row.fono}</td>
                  <td>{row.email || '-'}</td>
                  <td>
                    {`${row.calle || ''} #${row.numero || ''}, ${row.comuna || ''}${
                      row.region ? `, ${row.region}` : ''
                    }`}
                  </td>
                  <td>
                    <SafeImage
                      fotoUrl={row.fotoUrl}
                      alt={row.nombre}
                      fallbackSrc="/img/logo_empresa_comodin.png"
                      fallbackAlt="Restaurante"
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
