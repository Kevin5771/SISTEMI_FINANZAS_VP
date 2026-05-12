// src/components/registrar-cierre/AttachmentViewerModal.jsx
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

function BodyFileInput({ fileRef, onFileSelected }) {
  // Input renderizado en <body> para que el action sheet nativo
  // aparezca siempre por encima del modal en iOS/Android.
  return createPortal(
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      style={{
        position: 'fixed',
        inset: 0,
        opacity: 0,
        width: 0,
        height: 0,
        pointerEvents: 'none',
      }}
      onChange={(e) => {
        const file = e.target.files?.[0] || null;
        if (file) onFileSelected?.(file);
        e.target.value = ''; // permitir elegir la misma foto otra vez
      }}
    />,
    document.body
  );
}

export default function AttachmentViewerModal({
  open,
  url,
  mime,
  name,
  onClose,
  onRemoveFile,
  onFileSelected, // <- devuelve el File seleccionado
}) {
  const fileRef = useRef(null);

  // Bloquear scroll del fondo
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = original; };
  }, [open]);

  // Cerrar con Esc
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isImage =
    (mime && mime.startsWith('image/')) ||
    /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url || '');

  return (
    <div
      className="rc-modal-mask"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20000,
      }}
    >
      <div
        className="rc-modal-card rc-viewer-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(1000px, 96vw)',
          height: 'min(96vh, 96dvh)',
          background: '#000',
          borderRadius: 16,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          boxShadow: '0 12px 40px rgba(0,0,0,.35)',
        }}
      >

        {/* Barra superior flotante y legible */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            padding: 'max(10px, env(safe-area-inset-top)) 12px 10px 12px',
            backdropFilter: 'saturate(140%) blur(10px)',
            WebkitBackdropFilter: 'saturate(140%) blur(10px)',
            background: 'linear-gradient(180deg, rgba(0,0,0,.6), rgba(0,0,0,.15))',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            zIndex: 2,
          }}
        >
          <div
            title={name || 'Adjunto'}
            style={{
              fontWeight: 600,
              fontSize: 16,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '55%',
            }}
          >
            {name || 'Adjunto'}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="rc-btn"
              onClick={() => fileRef.current?.click()}
              title="Cambiar"
              style={buttonStyle('outline')}
            >
              Cambiar
            </button>

            {onRemoveFile && (
              <button
                type="button"
                className="rc-btn"
                onClick={onRemoveFile}
                title="Quitar"
                style={buttonStyle('ghost')}
              >
                Quitar
              </button>
            )}

            <button
              className="rc-btn"
              onClick={onClose}
              style={buttonStyle('primary')}
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* Imagen centrada */}
        <div
          className="rc-viewer-body"
          style={{
            flex: '1 1 auto',
            minHeight: 0,
            overflow: 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 40,
            background: '#000',
          }}
        >
          {isImage ? (
            <img
              src={url}
              alt={name || 'Adjunto'}
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          ) : (
            <div className="rc-empty" style={{ color: '#fff', padding: 24 }}>
              No se puede previsualizar este tipo de archivo.
            </div>
          )}
        </div>

        {/* Input real montado en <body> para que el sheet quede por encima */}
        <BodyFileInput fileRef={fileRef} onFileSelected={onFileSelected} />
      </div>
    </div>
  );
}

/* ——— helpers de estilos para botones con buen contraste y área táctil ——— */
function buttonStyle(variant) {
  const base = {
    borderRadius: 999,
    padding: '10px 14px',          // >=44px de alto táctil
    fontWeight: 700,
    fontSize: 14,
    lineHeight: 1,
  };
  switch (variant) {
    case 'primary':
      return {
        ...base,
        background: 'rgba(255,255,255,.18)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,.28)',
      };
    case 'outline':
      return {
        ...base,
        background: 'rgba(255,255,255,.10)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,.35)',
      };
    case 'ghost':
    default:
      return {
        ...base,
        background: 'transparent',
        color: '#fff',
        border: '1px solid rgba(255,255,255,.22)',
      };
  }
}
