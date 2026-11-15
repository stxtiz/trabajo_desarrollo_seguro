import { useRef, useState } from 'react';
import { SafeImage } from '../Icons.jsx';
import { processImageFileToDataUrl } from '../../utils/imageUpload.js';

export default function AdminImageField({
  idPrefix,
  foto,
  fotoData,
  fotoUrl,
  onFotoChange,
  onFotoDataChange,
  onError
}) {
  const fileInputRef = useRef(null);
  const [processing, setProcessing] = useState(false);

  const previewUrl =
    typeof fotoData === 'string' && fotoData.startsWith('data:image/')
      ? fotoData
      : fotoData === null
        ? ''
        : fotoUrl || '';

  async function handleFileChange(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    setProcessing(true);
    try {
      const dataUrl = await processImageFileToDataUrl(file);
      onFotoDataChange(dataUrl);
    } catch (err) {
      if (onError) {
        onError(err.message || 'Error procesando la imagen.');
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setProcessing(false);
    }
  }

  function handleClearImage() {
    onFotoDataChange(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <div className="form-row align-items-end">
      <div className="form-group col-md-4">
        <label htmlFor={`${idPrefix}-foto`}>Archivo foto (opcional)</label>
        <input
          id={`${idPrefix}-foto`}
          type="text"
          className="form-control"
          placeholder="ej: item1.jpg"
          maxLength={120}
          value={foto}
          onChange={(ev) => onFotoChange(ev.target.value)}
        />
      </div>
      <div className="form-group col-md-5">
        <label htmlFor={`${idPrefix}-foto-file`}>
          Subir imagen (PNG/JPEG/WebP &le; 200KB){processing ? ' - Procesando...' : ''}
        </label>
        <input
          ref={fileInputRef}
          id={`${idPrefix}-foto-file`}
          type="file"
          className="form-control-file"
          accept="image/png,image/jpeg,image/webp"
          disabled={processing}
          onChange={handleFileChange}
        />
      </div>
      <div className="form-group col-md-3 d-flex align-items-center">
        <SafeImage
          fotoUrl={previewUrl}
          alt="Vista previa"
          fallbackSrc="/img/carta_comodin.png"
          fallbackAlt="Sin imagen"
          width="56"
          height="56"
          className="rounded border mr-2"
          style={{ objectFit: 'cover' }}
        />
        {(fotoData || fotoUrl) && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={handleClearImage}
          >
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}
