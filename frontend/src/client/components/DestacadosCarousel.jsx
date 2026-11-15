import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { formatMonedaChilena } from '../services/apiClient.js';
import { IconoReloj, RatingStars, SafeImage } from './Icons.jsx';

function getVisibleCount() {
  if (typeof window === 'undefined') return 3;
  const width = window.innerWidth;
  return width >= 1100 ? 3 : width >= 768 ? 2 : 1;
}

export default function DestacadosCarousel({ destacados, onSeleccionar }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(getVisibleCount);
  const [offsetPx, setOffsetPx] = useState(0);
  const itemRefs = useRef([]);

  const hasDestacados = Array.isArray(destacados) && destacados.length > 0;
  const maxIndex = Math.max(0, (destacados?.length || 0) - visibleCount);
  const safeIndex = Math.min(currentIndex, maxIndex);

  useEffect(() => {
    setCurrentIndex(0);
  }, [destacados]);

  useEffect(() => {
    function handleResize() {
      setVisibleCount(getVisibleCount());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    const nextOffset = itemRefs.current[safeIndex]?.offsetLeft || 0;
    setOffsetPx(nextOffset);
  }, [safeIndex, visibleCount, destacados]);

  const itemFlex =
    visibleCount === 3
      ? '0 0 calc(33.333% - 20px)'
      : visibleCount === 2
        ? '0 0 calc(50% - 15px)'
        : '0 0 100%';

  return (
    <section
      className="destacados"
      id="destacados-section"
      style={{ display: hasDestacados ? 'block' : 'none' }}
    >
      <div className="container contendor">
        <div className="section-intro">
          <h4 className="intro-title">Menús Destacado</h4>
        </div>
        <div className="owl-carousel owl-theme featured-carousel owl-loaded owl-drag" id="featured-carousel">
          {hasDestacados && (
            <>
              <div className="owl-stage-outer" style={{ overflow: 'hidden' }}>
                <div
                  className="owl-stage"
                  style={{
                    display: 'flex',
                    gap: '30px',
                    transition: 'transform 0.3s ease',
                    transform: `translate3d(-${offsetPx}px, 0px, 0px)`
                  }}
                >
                  {destacados.map((destacado, idx) => (
                    <div
                      key={destacado.itemToken}
                      ref={(el) => {
                        itemRefs.current[idx] = el;
                      }}
                      className="owl-item active"
                      style={{ flex: itemFlex, minWidth: '280px' }}
                    >
                      <div className="featured-item">
                        <SafeImage
                          className="card-img rounded-0"
                          width="350px"
                          height="235px"
                          fotoUrl={destacado.fotoUrl}
                          alt={destacado.nombre}
                          fallbackSrc="/img/carta_comodin.png"
                          fallbackAlt="Plato destacado"
                        />
                        <div className="item-body">
                          <h3>{destacado.nombre}</h3>
                          <p>
                            {destacado.descripcion || ''}
                            <br />
                            {destacado.observaciones || ''}
                            <br />
                            {destacado.tiempo ? (
                              <>
                                <IconoReloj />
                                {` ${destacado.tiempo}`}
                              </>
                            ) : null}
                          </p>
                          <div className="d-flex justify-content-between">
                            <RatingStars puntuacion={destacado.puntuacion} />
                            <h3 className="price-tag">{formatMonedaChilena(destacado.precio)}</h3>
                          </div>
                          <a
                            className="button"
                            href="#"
                            data-token={destacado.itemToken}
                            style={{ margin: '0%' }}
                            onClick={(ev) => {
                              ev.preventDefault();
                              onSeleccionar(destacado.itemToken);
                            }}
                          >
                            Seleccionar
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="owl-nav">
                <button
                  type="button"
                  role="presentation"
                  className="owl-prev"
                  onClick={() => setCurrentIndex((prev) => Math.max(0, Math.min(prev, maxIndex) - 1))}
                >
                  <div className="left-arrow">
                    <i className="ti-angle-left" />
                  </div>
                </button>
                <button
                  type="button"
                  role="presentation"
                  className="owl-next"
                  onClick={() => setCurrentIndex((prev) => Math.min(maxIndex, prev + 1))}
                >
                  <div className="right-arrow">
                    <i className="ti-angle-right" />
                  </div>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
