import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function ComentariosSection() {
  const { sesion, comentarios, crearComentario, showModal } = useApp();
  const [texto, setTexto] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(ev) {
    ev.preventDefault();
    const trimmed = texto.trim();
    if (!trimmed) return;
    setSubmitting(true);
    try {
      await crearComentario(trimmed);
      setTexto('');
    } catch (err) {
      showModal(err.message || 'No fue posible registrar el comentario.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section id="comentarios-section">
      <div className="container contendor">
        <div className="container">
          <div className="row">
            <div className="col-lg-12">
              <div className="section-intro">
                <h4 className="intro-title">Comentarios</h4>
                <div id="comentario-form-wrapper">
                  {sesion?.autenticado && (
                    <form onSubmit={handleSubmit}>
                      <div className="form-group">
                        <label htmlFor="usuario">Nombre:</label>
                        <input
                          type="text"
                          className="form-control"
                          id="usuario"
                          name="usuario"
                          value={sesion.nombre || ''}
                          disabled
                        />
                      </div>
                      <div className="form-group">
                        <label htmlFor="comentario">Comentario:</label>
                        <textarea
                          className="form-control"
                          rows={5}
                          id="comentario"
                          name="comentario"
                          required
                          maxLength={1000}
                          value={texto}
                          onChange={(ev) => setTexto(ev.target.value)}
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn btn-success fa-align-right"
                        disabled={submitting}
                      >
                        Comentar
                      </button>
                    </form>
                  )}
                </div>
              </div>
              <br />
              <div id="comentarios-lista">
                {Array.isArray(comentarios) &&
                  comentarios.map((com, idx) => (
                    <div className="card bg-light mb-3" key={`${com.usuario}-${com.creado || idx}`}>
                      <div className="card-body">
                        <b>{com.usuario}</b>
                        <br />
                        {com.comentario}
                      </div>
                    </div>
                  ))}
              </div>
              <hr />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
