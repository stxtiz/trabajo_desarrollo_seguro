import { useEffect, useState } from 'react';
import { formatMonedaChilena } from '../services/apiClient.js';
import { IconoReloj, RatingStars, SafeImage } from './Icons.jsx';

function EmptyCategoryRow() {
  return (
    <div className="row">
      <div className="col-lg-12">
        <div className="text-center">
          <h4>No hay información para Mostrar</h4>
        </div>
      </div>
    </div>
  );
}

export default function CartasTabs({ cartas, onSeleccionar }) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [cartas]);

  const list = Array.isArray(cartas) ? cartas : [];
  const safeActiveIndex = activeIndex < list.length ? activeIndex : 0;

  return (
    <section id="cartas-section">
      <div className="container contendor">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <nav>
                <div className="nav nav-tabs nav-fill" id="nav-tab" role="tablist">
                  {list.map((carta, index) => {
                    const slug =
                      String(carta.nombre || '')
                        .toLowerCase()
                        .replace(/[^a-z0-9_-]/g, '-') || `carta-${index}`;
                    const isActive = index === safeActiveIndex;
                    return (
                      <a
                        key={carta.cartaToken || slug}
                        className={`nav-item nav-link${isActive ? ' active' : ''}`}
                        id={`nav-${slug}-tab`}
                        href={`#${slug}`}
                        role="tab"
                        aria-selected={isActive ? 'true' : 'false'}
                        onClick={(ev) => {
                          ev.preventDefault();
                          setActiveIndex(index);
                        }}
                      >
                        {carta.nombre}
                      </a>
                    );
                  })}
                </div>
              </nav>
              <div className="tab-content py-3 px-3 px-sm-0" id="nav-tabContent">
                {list.map((carta, index) => {
                  const slug =
                    String(carta.nombre || '')
                      .toLowerCase()
                      .replace(/[^a-z0-9_-]/g, '-') || `carta-${index}`;
                  const isActive = index === safeActiveIndex;
                  const categorias = Array.isArray(carta.categorias) ? carta.categorias : [];

                  return (
                    <div
                      key={carta.cartaToken || slug}
                      className={`tab-pane fade${isActive ? ' show active' : ''}`}
                      id={slug}
                      role="tabpanel"
                      aria-labelledby={`nav-${slug}-tab`}
                    >
                      {categorias.length === 0 ? (
                        <EmptyCategoryRow />
                      ) : (
                        categorias.map((categoria, catIdx) => {
                          const items = Array.isArray(categoria.items) ? categoria.items : [];
                          const colClass = items.length > 1 ? 'col-lg-6' : 'col-lg-12';

                          return (
                            <div key={categoria.categoriaToken || `${slug}-cat-${catIdx}`}>
                              <div className="section-intro mb-20px">
                                <h4 className="intro-title">{categoria.nombre}</h4>
                              </div>
                              <div className="row">
                                {items.length === 0 ? (
                                  <div className="col-lg-12">
                                    <div className="text-center">
                                      <h4>No hay información para Mostrar</h4>
                                    </div>
                                  </div>
                                ) : (
                                  items.map((item) => (
                                    <div className={colClass} key={item.itemToken}>
                                      <div className="media align-items-center food-card">
                                        <SafeImage
                                          className="mr-3 mr-sm-4"
                                          width="120px"
                                          fotoUrl={item.fotoUrl}
                                          alt={item.nombre}
                                          fallbackSrc="/img/carta_comodin.png"
                                          fallbackAlt="Carta"
                                        />
                                        <div className="media-body">
                                          <div className="d-flex justify-content-between food-card-title">
                                            <h4>{item.nombre}</h4>
                                            <h3 className="price-tag">
                                              {formatMonedaChilena(item.precio)}
                                            </h3>
                                          </div>
                                          <p>
                                            {item.descripcion || ''}
                                            <br />
                                            {item.observaciones || ''}
                                          </p>
                                          {item.tiempo ? (
                                            <p>
                                              <IconoReloj />
                                              {` ${item.tiempo}`}
                                            </p>
                                          ) : null}
                                          <p>
                                            <RatingStars puntuacion={item.puntuacion} />
                                          </p>
                                          <a
                                            className="button float-right"
                                            href="#"
                                            data-token={item.itemToken}
                                            onClick={(ev) => {
                                              ev.preventDefault();
                                              onSeleccionar(item.itemToken);
                                            }}
                                          >
                                            Seleccionar
                                          </a>
                                        </div>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
