import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { apiFetch, getRestauranteRef, setRestauranteRef } from '../services/apiClient.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [sesion, setSesion] = useState({ autenticado: false, nombre: null, rol: null, csrfToken: null });
  const [restaurante, setRestaurante] = useState(null);
  const [restaurantes, setRestaurantes] = useState([]);
  const [restauranteRef, setRestauranteRefState] = useState(() => getRestauranteRef());
  const [destacados, setDestacados] = useState([]);
  const [cartas, setCartas] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [carritoItems, setCarritoItems] = useState([]);
  const [carritoRestaurante, setCarritoRestaurante] = useState(null);
  const [loadingCarta, setLoadingCarta] = useState(false);
  const [loadingCarrito, setLoadingCarrito] = useState(false);
  const [errorCarta, setErrorCarta] = useState(null);
  const [errorCarrito, setErrorCarrito] = useState(null);
  const [modal, setModal] = useState({
    open: false,
    message: 'El producto seleccionado ha sido agregado sin problemas.'
  });

  const showModal = useCallback((message = 'El producto seleccionado ha sido agregado sin problemas.') => {
    setModal({ open: true, message });
  }, []);

  const closeModal = useCallback(() => {
    setModal((prev) => ({ ...prev, open: false }));
  }, []);

  const recargarCarta = useCallback(async (overrideRef) => {
    if (typeof overrideRef === 'string' && overrideRef.length > 0) {
      setRestauranteRef(overrideRef);
      setRestauranteRefState(overrideRef);
    }
    setLoadingCarta(true);
    setErrorCarta(null);
    try {
      const data = await apiFetch('/api/v1/carta');
      setSesion(data.sesion || { autenticado: false, nombre: null, rol: null, csrfToken: null });
      setRestaurante(data.restaurante || null);
      if (Array.isArray(data.restaurantes)) {
        setRestaurantes(data.restaurantes);
      }
      if (data.restaurante?.ref) {
        setRestauranteRefState(data.restaurante.ref);
      }
      setDestacados(Array.isArray(data.destacados) ? data.destacados : []);
      setCartas(Array.isArray(data.cartas) ? data.cartas : []);
      setComentarios(Array.isArray(data.comentarios) ? data.comentarios : []);
      return data;
    } catch (err) {
      setErrorCarta(err.message || 'El restaurante no fue encontrado.');
      throw err;
    } finally {
      setLoadingCarta(false);
    }
  }, []);

  const recargarCarrito = useCallback(async () => {
    setLoadingCarrito(true);
    setErrorCarrito(null);
    try {
      const data = await apiFetch('/api/v1/carrito');
      setCarritoRestaurante(data.restaurante || null);
      setCarritoItems(Array.isArray(data.items) ? data.items : []);
      return data;
    } catch (err) {
      setErrorCarrito(err.message || 'El restaurante no fue encontrado.');
      throw err;
    } finally {
      setLoadingCarrito(false);
    }
  }, []);

  const login = useCallback(
    async (email, password) => {
      await apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: { email: String(email || '').trim(), password }
      });
      await recargarCarta();
    },
    [recargarCarta]
  );

  const logout = useCallback(async () => {
    await apiFetch('/api/v1/auth/logout', { method: 'POST', body: {} });
    await recargarCarta();
  }, [recargarCarta]);

  const agregarAlCarrito = useCallback(
    async (itemToken) => {
      try {
        await apiFetch('/api/v1/carrito/items', {
          method: 'POST',
          body: { itemToken }
        });
        showModal('El producto seleccionado ha sido agregado sin problemas.');
      } catch (err) {
        showModal(err.message || 'No se pudo agregar el producto.');
      }
    },
    [showModal]
  );

  const eliminarDelCarrito = useCallback(
    async (itemToken) => {
      await apiFetch(`/api/v1/carrito/items/${encodeURIComponent(itemToken)}`, {
        method: 'DELETE'
      });
      await recargarCarrito();
    },
    [recargarCarrito]
  );

  const vaciarCarrito = useCallback(async () => {
    await apiFetch('/api/v1/carrito', { method: 'DELETE' });
    await recargarCarrito();
  }, [recargarCarrito]);

  const crearComentario = useCallback(
    async (comentario) => {
      await apiFetch('/api/v1/comentarios', {
        method: 'POST',
        body: { comentario: String(comentario || '').trim() }
      });
      await recargarCarta();
    },
    [recargarCarta]
  );

  const cambiarRestaurante = useCallback(
    async (newRef) => {
      if (!newRef) return;
      await apiFetch('/api/v1/restaurantes/seleccionar', {
        method: 'POST',
        body: { restauranteRef: newRef }
      });
      setCarritoItems([]);
      setCarritoRestaurante(null);
      await recargarCarta(newRef);
    },
    [recargarCarta]
  );

  const isAdmin = Boolean(sesion?.autenticado && sesion?.rol === 'admin');

  const value = useMemo(
    () => ({
      sesion,
      isAdmin,
      restaurante,
      restaurantes,
      restauranteRef,
      destacados,
      cartas,
      comentarios,
      carritoItems,
      carritoRestaurante,
      loadingCarta,
      loadingCarrito,
      errorCarta,
      errorCarrito,
      modal,
      showModal,
      closeModal,
      recargarCarta,
      recargarCarrito,
      login,
      logout,
      agregarAlCarrito,
      eliminarDelCarrito,
      vaciarCarrito,
      crearComentario,
      cambiarRestaurante
    }),
    [
      sesion,
      isAdmin,
      restaurante,
      restaurantes,
      restauranteRef,
      destacados,
      cartas,
      comentarios,
      carritoItems,
      carritoRestaurante,
      loadingCarta,
      loadingCarrito,
      errorCarta,
      errorCarrito,
      modal,
      showModal,
      closeModal,
      recargarCarta,
      recargarCarrito,
      login,
      logout,
      agregarAlCarrito,
      eliminarDelCarrito,
      vaciarCarrito,
      crearComentario,
      cambiarRestaurante
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp debe utilizarse dentro de AppProvider');
  }
  return ctx;
}
