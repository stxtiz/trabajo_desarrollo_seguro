import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { enforceObfuscatedUrl, setRestauranteRef } from '../services/apiClient.js';
import NavbarAuth from '../components/NavbarAuth.jsx';
import RestauranteHeader from '../components/RestauranteHeader.jsx';
import DestacadosCarousel from '../components/DestacadosCarousel.jsx';
import CartasTabs from '../components/CartasTabs.jsx';
import ProductModal from '../components/ProductModal.jsx';
import ComentariosSection from '../components/ComentariosSection.jsx';
import Footer from '../components/Footer.jsx';

export default function CartaPage() {
  const { ref } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const loadedRef = useRef(false);

  const {
    restaurante,
    destacados,
    cartas,
    errorCarta,
    recargarCarta,
    agregarAlCarrito
  } = useApp();

  useEffect(() => {
    const validRef = ref && /^[a-zA-Z0-9_-]{24,128}$/.test(ref) ? ref : undefined;
    if (validRef) {
      setRestauranteRef(validRef);
    }

    if (location.pathname !== '/carta' || location.search !== '') {
      enforceObfuscatedUrl('/carta');
      navigate('/carta', { replace: true });
    }

    if (!loadedRef.current || validRef) {
      loadedRef.current = true;
      recargarCarta(validRef).catch(() => {});
    }
  }, [ref, location.pathname, location.search, navigate, recargarCarta]);

  useEffect(() => {
    document.title = restaurante?.nombre || 'Carta Digital - PNK Security';
  }, [restaurante?.nombre]);

  if (errorCarta && !restaurante) {
    return (
      <div className="container contendor text-center py-4">
        {errorCarta || 'El restaurante no fue encontrado.'}
      </div>
    );
  }

  return (
    <>
      <NavbarAuth />
      <RestauranteHeader restaurante={restaurante} />
      <DestacadosCarousel destacados={destacados} onSeleccionar={agregarAlCarrito} />
      <CartasTabs cartas={cartas} onSeleccionar={agregarAlCarrito} />
      <ProductModal />
      <ComentariosSection />
      <Footer variant="carta" />
    </>
  );
}
