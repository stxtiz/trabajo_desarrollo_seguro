export function extractList(data, key) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[key])) return data[key];
  return [];
}

export function toBool(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

export function appendFotoData(payload, fotoData, isEditing) {
  if (typeof fotoData === 'string' && fotoData.startsWith('data:image/')) {
    return { ...payload, fotoData };
  }
  if (isEditing && fotoData === null) {
    return { ...payload, fotoData: null };
  }
  return payload;
}

export function formatFecha(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-CL');
}
