/**
 * Controlador Front-End de la Carta Digital (ES2024+)
 * - Diseño visual 100% idéntico al original sin jQuery ni $.ajax.
 * - URL e identificadores 100% ofuscados (nunca expone ?id=, ?keyid= ni IDs numéricos en URL o DOM).
 * - Protección total contra DOM-XSS mediante uso estricto de textContent y nodos DOM seguros (OWASP ASVS v5.0 V5.3).
 */
import { apiFetch, enforceObfuscatedUrl, formatMonedaChilena, getRestauranteRef } from './apiClient.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function crearIconoReloj() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'bi bi-alarm');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute(
    'd',
    'M6.5 0a.5.5 0 0 0 0 1H7v1.07a7.001 7.001 0 0 0-3.273 12.474l-.602.602a.5.5 0 0 0 .707.708l.746-.746A6.97 6.97 0 0 0 8 16a6.97 6.97 0 0 0 3.422-.892l.746.746a.5.5 0 0 0 .707-.708l-.601-.602A7.001 7.001 0 0 0 9 2.07V1h.5a.5.5 0 0 0 0-1h-3zm1.038 3.018a6.093 6.093 0 0 1 .924 0 6 6 0 1 1-.924 0zM8.5 5.5a.5.5 0 0 0-1 0v3.362l-1.429 2.38a.5.5 0 1 0 .858.515l1.5-2.5A.5.5 0 0 0 8.5 9V5.5zM0 3.5c0 .753.333 1.429.86 1.887A8.035 8.035 0 0 1 4.387 1.86 2.5 2.5 0 0 0 0 3.5zM13.5 1c-.753 0-1.429.333-1.887.86a8.035 8.035 0 0 1 3.527 3.527A2.5 2.5 0 0 0 13.5 1z'
  );
  svg.appendChild(path);
  return svg;
}

function crearIconoTelefono() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'bi bi-telephone-fill');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute(
    'd',
    'M2.267.98a1.636 1.636 0 0 1 2.448.152l1.681 2.162c.309.396.418.913.296 1.4l-.513 2.053a.636.636 0 0 0 .167.604L8.65 9.654a.636.636 0 0 0 .604.167l2.052-.513a1.636 1.636 0 0 1 1.401.296l2.162 1.681c.777.604.849 1.753.153 2.448l-.97.97c-.693.693-1.73.998-2.697.658a17.47 17.47 0 0 1-6.571-4.144A17.47 17.47 0 0 1 .639 4.646c-.34-.967-.035-2.004.658-2.698l.97-.969z'
  );
  svg.appendChild(path);
  return svg;
}

function crearIconoEmail() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('class', 'bi bi-envelope-fill');
  svg.setAttribute('fill', 'currentColor');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill-rule', 'evenodd');
  path.setAttribute(
    'd',
    'M.05 3.555A2 2 0 0 1 2 2h12a2 2 0 0 1 1.95 1.555L8 8.414.05 3.555zM0 4.697v7.104l5.803-3.558L0 4.697zM6.761 8.83l-6.57 4.027A2 2 0 0 0 2 14h12a2 2 0 0 0 1.808-1.144l-6.57-4.027L8 9.586l-1.239-.757zm3.436-.586L16 11.801V4.697l-5.803 3.546z'
  );
  svg.appendChild(path);
  return svg;
}

function crearEstrellas(puntuacion) {
  const ul = document.createElement('ul');
  ul.className = 'rating-star';
  const total = Math.max(0, Math.min(5, Number.parseInt(puntuacion, 10) || 0));
  for (let i = 1; i <= total; i += 1) {
    const li = document.createElement('li');
    const icon = document.createElement('i');
    icon.className = 'ti-star';
    li.appendChild(icon);
    ul.appendChild(li);
  }
  return ul;
}

let modalBackdrop = null;

function mostrarModalSeleccion(mensaje = 'El producto seleccionado ha sido agregado sin problemas.') {
  const modal = document.getElementById('myModal');
  const modalBody = document.getElementById('modalBodyText');
  if (!modal) return;
  if (modalBody) modalBody.textContent = mensaje;

  modal.style.display = 'block';
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');

  if (!modalBackdrop) {
    modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop fade show';
    modalBackdrop.addEventListener('click', cerrarModalSeleccion);
    document.body.appendChild(modalBackdrop);
  }
}

function cerrarModalSeleccion() {
  const modal = document.getElementById('myModal');
  if (!modal) return;
  modal.classList.remove('show');
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  if (modalBackdrop) {
    modalBackdrop.remove();
    modalBackdrop = null;
  }
}

async function seleccionarProducto(itemToken) {
  try {
    await apiFetch('/api/v1/carrito/items', {
      method: 'POST',
      body: { itemToken }
    });
    mostrarModalSeleccion('El producto seleccionado ha sido agregado sin problemas.');
  } catch (err) {
    mostrarModalSeleccion(err.message || 'No se pudo agregar el producto.');
  }
}

function renderNavbarAuth(sesion, recargarCallback) {
  const nav = document.getElementById('navbar-auth-container');
  nav.replaceChildren();

  if (!sesion?.autenticado) {
    const form = document.createElement('form');
    form.className = 'form-inline';
    form.setAttribute('role', 'search');

    const groupUser = document.createElement('div');
    groupUser.className = 'form-group mr-2';
    const prepend = document.createElement('div');
    prepend.className = 'input-group-prepend';
    const spanAt = document.createElement('span');
    spanAt.className = 'input-group-text';
    spanAt.id = 'basic-addon1';
    spanAt.textContent = '@';
    prepend.appendChild(spanAt);

    const inputUser = document.createElement('input');
    inputUser.type = 'text';
    inputUser.className = 'form-control';
    inputUser.name = 'frmusuario';
    inputUser.placeholder = 'Usuario';
    inputUser.required = true;
    inputUser.autocomplete = 'username';
    groupUser.append(prepend, inputUser);

    const groupPass = document.createElement('div');
    groupPass.className = 'form-group mr-2';
    const inputPass = document.createElement('input');
    inputPass.type = 'password';
    inputPass.className = 'form-control';
    inputPass.name = 'frmpassword';
    inputPass.placeholder = 'Contraseña';
    inputPass.required = true;
    inputPass.autocomplete = 'current-password';
    groupPass.appendChild(inputPass);

    const btnSubmit = document.createElement('button');
    btnSubmit.type = 'submit';
    btnSubmit.className = 'btn btn-outline-primary my-2 my-sm-0';
    btnSubmit.textContent = 'Ingresar';

    form.append(groupUser, groupPass, btnSubmit);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      btnSubmit.disabled = true;
      try {
        await apiFetch('/api/v1/auth/login', {
          method: 'POST',
          body: {
            email: inputUser.value.trim(),
            password: inputPass.value
          }
        });
        await recargarCallback();
      } catch (err) {
        mostrarModalSeleccion(err.message || 'Credenciales inválidas.');
      } finally {
        btnSubmit.disabled = false;
      }
    });

    nav.appendChild(form);
  } else {
    const textWelcome = document.createTextNode(`Bienvenido : ${sesion.nombre} - `);
    const logoutLink = document.createElement('a');
    logoutLink.href = '#';
    logoutLink.textContent = 'Cerrar Sesión';
    logoutLink.addEventListener('click', async (ev) => {
      ev.preventDefault();
      await apiFetch('/api/v1/auth/logout', { method: 'POST', body: {} });
      await recargarCallback();
    });
    nav.append(textWelcome, logoutLink);
  }
}

function renderCabeceraRestaurante(restaurante) {
  document.title = restaurante.nombre;
  const linkCarrito = document.getElementById('link-mostrar-carrito');
  if (linkCarrito) {
    linkCarrito.href = '/carrito';
  }

  const logoImg = document.getElementById('restaurante-logo');
  if (logoImg) {
    if (restaurante.fotoUrl) {
      logoImg.src = `/${restaurante.fotoUrl}`;
      logoImg.alt = restaurante.nombre;
      logoImg.onerror = () => {
        logoImg.onerror = null;
        logoImg.src = '/img/logo_empresa_comodin.png';
      };
    } else {
      logoImg.src = '/img/logo_empresa_comodin.png';
      logoImg.alt = 'Logo Restaurante';
    }
  }

  document.getElementById('restaurante-nombre').textContent = restaurante.nombre;
  document.getElementById('restaurante-direccion-texto').textContent =
    `${restaurante.calle} #${restaurante.numero}, ${restaurante.comuna}`;

  const contactoRow = document.getElementById('restaurante-contacto-row');
  contactoRow.replaceChildren();
  if (restaurante.fono) {
    contactoRow.appendChild(crearIconoTelefono());
    contactoRow.appendChild(document.createTextNode(` ${restaurante.fono} `));
  }
  if (restaurante.email) {
    contactoRow.appendChild(crearIconoEmail());
    contactoRow.appendChild(document.createTextNode(` ${restaurante.email}`));
  }
}

function renderDestacados(destacados) {
  const section = document.getElementById('destacados-section');
  const container = document.getElementById('featured-carousel');
  container.replaceChildren();

  if (!Array.isArray(destacados) || destacados.length === 0) {
    section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  const stageOuter = document.createElement('div');
  stageOuter.className = 'owl-stage-outer';
  stageOuter.style.overflow = 'hidden';

  const stage = document.createElement('div');
  stage.className = 'owl-stage';
  stage.style.display = 'flex';
  stage.style.gap = '30px';
  stage.style.transition = 'transform 0.3s ease';

  const itemNodes = destacados.map((destacado) => {
    const owlItem = document.createElement('div');
    owlItem.className = 'owl-item active';
    owlItem.style.flex = '0 0 calc(33.333% - 20px)';
    owlItem.style.minWidth = '280px';

    const card = document.createElement('div');
    card.className = 'featured-item';

    const img = document.createElement('img');
    img.className = 'card-img rounded-0';
    img.setAttribute('width', '350px');
    img.setAttribute('height', '235px');
    if (destacado.fotoUrl) {
      img.src = `/${destacado.fotoUrl}`;
      img.alt = destacado.nombre;
      img.onerror = () => {
        img.onerror = null;
        img.src = '/img/carta_comodin.png';
      };
    } else {
      img.src = '/img/carta_comodin.png';
      img.alt = 'Plato destacado';
    }

    const body = document.createElement('div');
    body.className = 'item-body';

    const h3Nombre = document.createElement('h3');
    h3Nombre.textContent = destacado.nombre;

    const pDesc = document.createElement('p');
    pDesc.appendChild(document.createTextNode(destacado.descripcion || ''));
    pDesc.appendChild(document.createElement('br'));
    pDesc.appendChild(document.createTextNode(destacado.observaciones || ''));
    pDesc.appendChild(document.createElement('br'));
    if (destacado.tiempo) {
      pDesc.appendChild(crearIconoReloj());
      pDesc.appendChild(document.createTextNode(` ${destacado.tiempo}`));
    }

    const dFlex = document.createElement('div');
    dFlex.className = 'd-flex justify-content-between';
    dFlex.appendChild(crearEstrellas(destacado.puntuacion));

    const h3Precio = document.createElement('h3');
    h3Precio.className = 'price-tag';
    h3Precio.textContent = formatMonedaChilena(destacado.precio);
    dFlex.appendChild(h3Precio);

    const btnSel = document.createElement('a');
    btnSel.className = 'button';
    btnSel.href = '#';
    btnSel.dataset.token = destacado.itemToken;
    btnSel.style.margin = '0%';
    btnSel.textContent = 'Seleccionar';
    btnSel.addEventListener('click', (ev) => {
      ev.preventDefault();
      seleccionarProducto(destacado.itemToken);
    });

    body.append(h3Nombre, pDesc, dFlex, btnSel);
    card.append(img, body);
    owlItem.appendChild(card);
    stage.appendChild(owlItem);
    return owlItem;
  });

  stageOuter.appendChild(stage);

  const owlNav = document.createElement('div');
  owlNav.className = 'owl-nav';

  const btnPrev = document.createElement('button');
  btnPrev.type = 'button';
  btnPrev.setAttribute('role', 'presentation');
  btnPrev.className = 'owl-prev';
  const leftArrow = document.createElement('div');
  leftArrow.className = 'left-arrow';
  const iconLeft = document.createElement('i');
  iconLeft.className = 'ti-angle-left';
  leftArrow.appendChild(iconLeft);
  btnPrev.appendChild(leftArrow);

  const btnNext = document.createElement('button');
  btnNext.type = 'button';
  btnNext.setAttribute('role', 'presentation');
  btnNext.className = 'owl-next';
  const rightArrow = document.createElement('div');
  rightArrow.className = 'right-arrow';
  const iconRight = document.createElement('i');
  iconRight.className = 'ti-angle-right';
  rightArrow.appendChild(iconRight);
  btnNext.appendChild(rightArrow);

  let currentIndex = 0;
  function updateCarousel() {
    const width = window.innerWidth;
    const visibleCount = width >= 1100 ? 3 : width >= 768 ? 2 : 1;
    const maxIndex = Math.max(0, itemNodes.length - visibleCount);
    if (currentIndex > maxIndex) currentIndex = maxIndex;
    for (const node of itemNodes) {
      node.style.flex =
        visibleCount === 3
          ? '0 0 calc(33.333% - 20px)'
          : visibleCount === 2
            ? '0 0 calc(50% - 15px)'
            : '0 0 100%';
    }
    const offsetPx = itemNodes[currentIndex]?.offsetLeft || 0;
    stage.style.transform = `translate3d(-${offsetPx}px, 0px, 0px)`;
  }

  btnPrev.addEventListener('click', () => {
    currentIndex = Math.max(0, currentIndex - 1);
    updateCarousel();
  });
  btnNext.addEventListener('click', () => {
    const width = window.innerWidth;
    const visibleCount = width >= 1100 ? 3 : width >= 768 ? 2 : 1;
    const maxIndex = Math.max(0, itemNodes.length - visibleCount);
    currentIndex = Math.min(maxIndex, currentIndex + 1);
    updateCarousel();
  });

  window.addEventListener('resize', updateCarousel);
  owlNav.append(btnPrev, btnNext);
  container.append(stageOuter, owlNav);
  updateCarousel();
}

function renderCartasYCategorias(cartas) {
  const navTab = document.getElementById('nav-tab');
  const tabContent = document.getElementById('nav-tabContent');
  navTab.replaceChildren();
  tabContent.replaceChildren();

  if (!Array.isArray(cartas) || cartas.length === 0) return;

  const tabLinks = [];
  const tabPanes = [];

  cartas.forEach((carta, index) => {
    const slug = String(carta.nombre || '').toLowerCase().replace(/[^a-z0-9_-]/g, '-') || `carta-${index}`;
    const link = document.createElement('a');
    link.className = `nav-item nav-link${index === 0 ? ' active' : ''}`;
    link.id = `nav-${slug}-tab`;
    link.href = `#${slug}`;
    link.setAttribute('role', 'tab');
    link.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    link.textContent = carta.nombre;

    const pane = document.createElement('div');
    pane.className = `tab-pane fade${index === 0 ? ' show active' : ''}`;
    pane.id = slug;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', `nav-${slug}-tab`);

    link.addEventListener('click', (ev) => {
      ev.preventDefault();
      tabLinks.forEach((l) => {
        l.classList.remove('active');
        l.setAttribute('aria-selected', 'false');
      });
      tabPanes.forEach((p) => {
        p.classList.remove('show', 'active');
      });
      link.classList.add('active');
      link.setAttribute('aria-selected', 'true');
      pane.classList.add('show', 'active');
    });

    if (!Array.isArray(carta.categorias) || carta.categorias.length === 0) {
      const rowEmpty = document.createElement('div');
      rowEmpty.className = 'row';
      const colEmpty = document.createElement('div');
      colEmpty.className = 'col-lg-12';
      const centerEmpty = document.createElement('div');
      centerEmpty.className = 'text-center';
      const h4Empty = document.createElement('h4');
      h4Empty.textContent = 'No hay información para Mostrar';
      centerEmpty.appendChild(h4Empty);
      colEmpty.appendChild(centerEmpty);
      rowEmpty.appendChild(colEmpty);
      pane.appendChild(rowEmpty);
    } else {
      carta.categorias.forEach((categoria) => {
        const introDiv = document.createElement('div');
        introDiv.className = 'section-intro mb-20px';
        const h4Cat = document.createElement('h4');
        h4Cat.className = 'intro-title';
        h4Cat.textContent = categoria.nombre;
        introDiv.appendChild(h4Cat);
        pane.appendChild(introDiv);

        const rowItems = document.createElement('div');
        rowItems.className = 'row';

        const items = categoria.items || [];
        if (items.length === 0) {
          const colEmpty = document.createElement('div');
          colEmpty.className = 'col-lg-12';
          const centerEmpty = document.createElement('div');
          centerEmpty.className = 'text-center';
          const h4Empty = document.createElement('h4');
          h4Empty.textContent = 'No hay información para Mostrar';
          centerEmpty.appendChild(h4Empty);
          colEmpty.appendChild(centerEmpty);
          rowItems.appendChild(colEmpty);
        } else {
          const colClass = items.length > 1 ? 'col-lg-6' : 'col-lg-12';
          items.forEach((item) => {
            const col = document.createElement('div');
            col.className = colClass;

            const mediaCard = document.createElement('div');
            mediaCard.className = 'media align-items-center food-card';

            const img = document.createElement('img');
            img.className = 'mr-3 mr-sm-4';
            img.setAttribute('width', '120px');
            if (item.fotoUrl) {
              img.src = `/${item.fotoUrl}`;
              img.alt = item.nombre;
              img.onerror = () => {
                img.onerror = null;
                img.src = '/img/carta_comodin.png';
              };
            } else {
              img.src = '/img/carta_comodin.png';
              img.alt = 'Carta';
            }

            const mediaBody = document.createElement('div');
            mediaBody.className = 'media-body';

            const titleRow = document.createElement('div');
            titleRow.className = 'd-flex justify-content-between food-card-title';
            const h4Item = document.createElement('h4');
            h4Item.textContent = item.nombre;
            const h3Price = document.createElement('h3');
            h3Price.className = 'price-tag';
            h3Price.textContent = formatMonedaChilena(item.precio);
            titleRow.append(h4Item, h3Price);

            const pDesc = document.createElement('p');
            pDesc.appendChild(document.createTextNode(item.descripcion || ''));
            pDesc.appendChild(document.createElement('br'));
            pDesc.appendChild(document.createTextNode(item.observaciones || ''));

            mediaBody.append(titleRow, pDesc);

            if (item.tiempo) {
              const pTiempo = document.createElement('p');
              pTiempo.appendChild(crearIconoReloj());
              pTiempo.appendChild(document.createTextNode(` ${item.tiempo}`));
              mediaBody.appendChild(pTiempo);
            }

            const pStars = document.createElement('p');
            pStars.appendChild(crearEstrellas(item.puntuacion));
            mediaBody.appendChild(pStars);

            const btnSel = document.createElement('a');
            btnSel.className = 'button float-right';
            btnSel.href = '#';
            btnSel.dataset.token = item.itemToken;
            btnSel.textContent = 'Seleccionar';
            btnSel.addEventListener('click', (ev) => {
              ev.preventDefault();
              seleccionarProducto(item.itemToken);
            });
            mediaBody.appendChild(btnSel);

            mediaCard.append(img, mediaBody);
            col.appendChild(mediaCard);
            rowItems.appendChild(col);
          });
        }

        pane.appendChild(rowItems);
      });
    }

    tabLinks.push(link);
    tabPanes.push(pane);
    navTab.appendChild(link);
    tabContent.appendChild(pane);
  });
}

function renderComentarios(comentarios, sesion, recargarCallback) {
  const formWrapper = document.getElementById('comentario-form-wrapper');
  const listaContainer = document.getElementById('comentarios-lista');
  formWrapper.replaceChildren();
  listaContainer.replaceChildren();

  if (sesion?.autenticado) {
    const form = document.createElement('form');

    const groupUser = document.createElement('div');
    groupUser.className = 'form-group';
    const labelUser = document.createElement('label');
    labelUser.setAttribute('for', 'usuario');
    labelUser.textContent = 'Nombre:';
    const inputUser = document.createElement('input');
    inputUser.type = 'text';
    inputUser.className = 'form-control';
    inputUser.id = 'usuario';
    inputUser.name = 'usuario';
    inputUser.value = sesion.nombre || '';
    inputUser.disabled = true;
    groupUser.append(labelUser, inputUser);

    const groupCom = document.createElement('div');
    groupCom.className = 'form-group';
    const labelCom = document.createElement('label');
    labelCom.setAttribute('for', 'comentario');
    labelCom.textContent = 'Comentario:';
    const textarea = document.createElement('textarea');
    textarea.className = 'form-control';
    textarea.rows = 5;
    textarea.id = 'comentario';
    textarea.name = 'comentario';
    textarea.required = true;
    textarea.maxLength = 1000;
    groupCom.append(labelCom, textarea);

    const btnSubmit = document.createElement('button');
    btnSubmit.type = 'submit';
    btnSubmit.className = 'btn btn-success fa-align-right';
    btnSubmit.textContent = 'Comentar';

    form.append(groupUser, groupCom, btnSubmit);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const texto = textarea.value.trim();
      if (!texto) return;
      btnSubmit.disabled = true;
      try {
        await apiFetch('/api/v1/comentarios', {
          method: 'POST',
          body: { comentario: texto }
        });
        textarea.value = '';
        await recargarCallback();
      } catch (err) {
        mostrarModalSeleccion(err.message || 'No fue posible registrar el comentario.');
      } finally {
        btnSubmit.disabled = false;
      }
    });

    formWrapper.appendChild(form);
  }

  if (Array.isArray(comentarios)) {
    comentarios.forEach((com) => {
      const card = document.createElement('div');
      card.className = 'card bg-light mb-3';
      const body = document.createElement('div');
      body.className = 'card-body';

      const bUser = document.createElement('b');
      bUser.textContent = com.usuario;
      body.appendChild(bUser);
      body.appendChild(document.createElement('br'));
      body.appendChild(document.createTextNode(com.comentario));

      card.appendChild(body);
      listaContainer.appendChild(card);
    });
  }
}

async function inicializarCarta() {
  // Captura cualquier referencia opaca si venía en /c/:ref y limpia inmediatamente la URL a /carta
  getRestauranteRef();
  enforceObfuscatedUrl('/carta');

  const closeModalBtn = document.getElementById('closeModalBtn');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', cerrarModalSeleccion);
  }
  const modalEl = document.getElementById('myModal');
  if (modalEl) {
    modalEl.addEventListener('click', (ev) => {
      if (ev.target === modalEl) cerrarModalSeleccion();
    });
  }
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') cerrarModalSeleccion();
  });

  async function cargarDatos() {
    try {
      const data = await apiFetch('/api/v1/carta');
      renderNavbarAuth(data.sesion, cargarDatos);
      renderCabeceraRestaurante(data.restaurante);
      renderDestacados(data.destacados);
      renderCartasYCategorias(data.cartas);
      renderComentarios(data.comentarios, data.sesion, cargarDatos);
    } catch (err) {
      document.body.textContent = err.message || 'El restaurante no fue encontrado.';
    }
  }

  await cargarDatos();
}

document.addEventListener('DOMContentLoaded', inicializarCarta);
