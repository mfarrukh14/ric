// src/components/Modal.jsx
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

const Modal = ({ show, onClose, title, children }) => {
  // Prevent body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = show ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [show]);

  if (!show) return null;

  // The overlay + panel
  const modalContent = (
    <div
      className="
        fixed inset-0
        bg-black/15 bg-opacity-30
        backdrop-filter backdrop-blur-md
        flex items-center justify-center
        z-50
      "
      onClick={onClose}
    >
      <div
        className="
          bg-white bg-opacity-20
          backdrop-filter backdrop-blur-lg
          border border-white border-opacity-30
          rounded-2xl shadow-xl
          p-6 w-full max-w-md
        "
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );

  // Render into document.body so it’s completely decoupled from parent layout
  return ReactDOM.createPortal(modalContent, document.body);
};

export default Modal;
