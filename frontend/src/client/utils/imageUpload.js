const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_DATA_URL_LENGTH = 200 * 1024; // <= 200 KB
const MAX_DIMENSION_PX = 640;
const SAFE_DATA_URL_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('No fue posible leer el archivo de imagen.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('El archivo seleccionado no es una imagen válida.'));
    img.src = src;
  });
}

/**
 * Redimensiona y re-codifica la imagen en un Canvas para eliminar metadatos EXIF
 * y garantizar un data URL base64 seguro <= 200 KB (OWASP ASVS v5.0 V12).
 */
export async function processImageFileToDataUrl(file) {
  if (!file || !ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error('Formato no permitido. Usa PNG, JPEG o WebP.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawDataUrl);

  const ratio = Math.min(1, MAX_DIMENSION_PX / Math.max(img.width || 1, img.height || 1));
  let targetWidth = Math.max(1, Math.round(img.width * ratio));
  let targetHeight = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('No fue posible inicializar el procesador de imágenes.');
  }

  const renderAt = (w, h, mime, quality) => {
    canvas.width = w;
    canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL(mime, quality);
  };

  if (file.type === 'image/png') {
    const pngUrl = renderAt(targetWidth, targetHeight, 'image/png');
    if (pngUrl.length <= MAX_DATA_URL_LENGTH && SAFE_DATA_URL_REGEX.test(pngUrl)) {
      return pngUrl;
    }
  }

  const outputMime = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  for (const quality of [0.85, 0.72, 0.58, 0.45]) {
    const candidate = renderAt(targetWidth, targetHeight, outputMime, quality);
    if (candidate.length <= MAX_DATA_URL_LENGTH && SAFE_DATA_URL_REGEX.test(candidate)) {
      return candidate;
    }
  }

  // Último intento reduciendo dimensiones a la mitad
  targetWidth = Math.max(1, Math.round(targetWidth * 0.6));
  targetHeight = Math.max(1, Math.round(targetHeight * 0.6));
  const fallback = renderAt(targetWidth, targetHeight, 'image/jpeg', 0.5);
  if (fallback.length <= MAX_DATA_URL_LENGTH && SAFE_DATA_URL_REGEX.test(fallback)) {
    return fallback;
  }

  throw new Error('La imagen supera el límite máximo permitido de 200 KB incluso tras comprimirla.');
}
