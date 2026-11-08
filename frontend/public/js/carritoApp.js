/**
 * Controlador Front-End de Productos Seleccionados (Carrito) - ES2024+
 * - Reemplaza completamente jQuery y $.ajax por Fetch API nativa manteniendo la interfaz idéntica.
 * - URL e identificadores 100% ofuscados (/carrito y tokens criptográficos itemToken, sin ?keyid= ni id=).
 */
import { apiFetch, enforceObfuscatedUrl, formatMonedaChilena } from './apiClient.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function crearIconoBasurero() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '2em');
  svg.setAttribute('height', '2em');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'bi bi-trash-fill text-danger');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute(
    'd',
    'M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7a.5.5 0 0 1 .5-.5zM8 5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-1 0v-7A.5.5 0 0 1 8 5zm3 .5a.5.5 0 0 0-1 0v7a.5.5 0 0 0 1 0v-7z'
  );
  svg.appendChild(path);
  return svg;
}

function renderTablaCarrito(items, recargarCallback) {
  const tbody = document.getElementById('carrito-tbody');
  tbody.replaceChildren();

  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  items.forEach((value, idx) => {
    const tr = document.createElement('tr');

    const thCodigo = document.createElement('th');
    thCodigo.setAttribute('scope', 'row');
    thCodigo.textContent = String(value.codigoVisual || idx + 1);

    const tdNombre = document.createElement('td');
    tdNombre.textContent = value.nombre || '';

    const tdPrecio = document.createElement('td');
    tdPrecio.textContent = formatMonedaChilena(value.precio);

    const tdAccion = document.createElement('td');
    const linkElim = document.createElement('a');
    linkElim.className = 'elim';
    linkElim.dataset.token = value.itemToken;
    linkElim.href = '#';
    linkElim.appendChild(crearIconoBasurero());
    linkElim.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await apiFetch(`/api/v1/carrito/items/${encodeURIComponent(value.itemToken)}`, {
        method: 'DELETE'
      });
      await recargarCallback();
    });
    tdAccion.appendChild(linkElim);

    tr.append(thCodigo, tdNombre, tdPrecio, tdAccion);
    tbody.appendChild(tr);
  });
}

async function inicializarCarrito() {
  enforceObfuscatedUrl('/carrito');

  const btnVolver = document.getElementById('btn-volver-carta');
  if (btnVolver) {
    btnVolver.href = '/carta';
  }

  async function cargarCarrito() {
    try {
      const data = await apiFetch('/api/v1/carrito');
      document.title = data.restaurante.nombre;

      const logoImg = document.getElementById('carrito-restaurante-logo');
      if (logoImg) {
        if (data.restaurante.fotoUrl) {
          logoImg.src = `/${data.restaurante.fotoUrl}`;
          logoImg.alt = data.restaurante.nombre;
          logoImg.onerror = () => {
            logoImg.onerror = null;
            logoImg.src = '/img/logo_empresa_comodin.png';
          };
        } else {
          logoImg.src = '/img/logo_empresa_comodin.png';
          logoImg.alt = 'Logo Restaurante';
        }
      }

      renderTablaCarrito(data.items, cargarCarrito);
    } catch (err) {
      document.body.textContent = err.message || 'El restaurante no fue encontrado.';
    }
  }

  const btnLimpiar = document.getElementById('btn-limpiar-carrito');
  if (btnLimpiar) {
    btnLimpiar.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await apiFetch('/api/v1/carrito', { method: 'DELETE' });
      await cargarCarrito();
    });
  }

  await cargarCarrito();
}

document.addEventListener('DOMContentLoaded', inicializarCarrito);
