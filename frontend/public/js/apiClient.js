/**
 * Cliente HTTP moderno basado en Fetch API nativa (ES2024+)
 * Sin jQuery, sin XMLHttpRequest/$.ajax deprecado.
 * Cumple OWASP ASVS v5.0 Nivel 3 (CSRF Synchronizer Token + Ofuscación de URL sin exponer IDs)
 */

let currentCsrfToken = '';
let currentRestauranteRef = '';

export function setCsrfToken(token) {
  if (typeof token === 'string' && token.length > 0) {
    currentCsrfToken = token;
    const meta = document.getElementById('meta-csrf-token');
    if (meta) {
      meta.setAttribute('content', token);
    }
  }
}

export function getCsrfToken() {
  if (currentCsrfToken) return currentCsrfToken;
  const meta = document.getElementById('meta-csrf-token');
  return meta ? meta.getAttribute('content') || '' : '';
}

export function setRestauranteRef(ref) {
  if (typeof ref === 'string' && ref.length > 0) {
    currentRestauranteRef = ref;
  }
}

export function getRestauranteRef() {
  if (currentRestauranteRef) return currentRestauranteRef;
  // Si la URL es /c/<token_opaco>, extrae el token y limpia la barra de direcciones a /carta
  const match = window.location.pathname.match(/^\/c\/([a-zA-Z0-9_-]{24,128})$/);
  if (match) {
    currentRestauranteRef = match[1];
  }
  return currentRestauranteRef;
}

/**
 * Garantiza que en la barra de direcciones del navegador NUNCA aparezcan parámetros ?id=, ?keyid= ni extensiones .php/.html
 */
export function enforceObfuscatedUrl(cleanPath = '/carta') {
  if (window.location.pathname !== cleanPath || window.location.search !== '') {
    window.history.replaceState({}, document.title, cleanPath);
  }
}

export function formatMonedaChilena(valor) {
  const numero = Number(valor || 0);
  if (!Number.isFinite(numero)) return '$ 0';
  return '$ ' + Math.round(numero).toLocaleString('es-CL');
}

export async function apiFetch(endpoint, { method = 'GET', body = null, timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    Accept: 'application/json'
  };

  const restRef = getRestauranteRef();
  if (restRef) {
    headers['X-Carta-Ref'] = restRef;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = getCsrfToken();
  }

  let payload = undefined;
  if (body !== null && body !== undefined) {
    headers['Content-Type'] = 'application/json; charset=utf-8';
    payload = JSON.stringify(body);
  }

  try {
    const response = await fetch(endpoint, {
      method,
      headers,
      body: payload,
      credentials: 'same-origin',
      signal: controller.signal
    });

    const json = await response.json().catch(() => ({ ok: false, error: { message: 'Respuesta inválida del servidor' } }));

    if (json?.data?.csrfToken) {
      setCsrfToken(json.data.csrfToken);
    } else if (json?.data?.sesion?.csrfToken) {
      setCsrfToken(json.data.sesion.csrfToken);
    }

    if (json?.data?.restaurante?.ref) {
      setRestauranteRef(json.data.restaurante.ref);
    } else if (json?.data?.restauranteRef) {
      setRestauranteRef(json.data.restauranteRef);
    }

    if (!response.ok || !json.ok) {
      const errorMsg = json?.error?.message || `Error HTTP ${response.status}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      err.code = json?.error?.code || 'HTTP_ERROR';
      throw err;
    }

    return json.data;
  } finally {
    clearTimeout(timer);
  }
}
