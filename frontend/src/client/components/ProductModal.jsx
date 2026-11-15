import { useEffect } from 'react';
import { useApp } from '../context/AppContext.jsx';

export default function ProductModal() {
  const { modal, closeModal } = useApp();

  useEffect(() => {
    if (modal.open) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modal.open]);

  useEffect(() => {
    function handleKeyDown(ev) {
      if (ev.key === 'Escape' && modal.open) {
        closeModal();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [modal.open, closeModal]);

  return (
    <>
      <div
        id="myModal"
        className={`modal fade${modal.open ? ' show' : ''}`}
        tabIndex={-1}
        role="dialog"
        aria-labelledby="exampleModalLabel"
        aria-hidden={modal.open ? 'false' : 'true'}
        style={{ display: modal.open ? 'block' : 'none' }}
        onClick={(ev) => {
          if (ev.target === ev.currentTarget) {
            closeModal();
          }
        }}
      >
        <div className="modal-dialog" role="document">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title text-lg-center" id="exampleModalLabel">
                Selección de Producto
              </h5>
              <button
                type="button"
                className="close"
                id="closeModalBtn"
                aria-label="Close"
                onClick={closeModal}
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>
            <div className="modal-body" id="modalBodyText">
              {modal.message}
            </div>
          </div>
        </div>
      </div>
      {modal.open && <div className="modal-backdrop fade show" onClick={closeModal} />}
    </>
  );
}
