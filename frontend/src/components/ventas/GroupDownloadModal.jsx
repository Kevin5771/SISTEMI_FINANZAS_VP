import React from 'react';
import { formatDate } from '../../utils/dates';

export default function GroupDownloadModal({
  visible, cuadres, sucursalesMap,
  selectedIds, onToggleAll, onToggleOne,
  onCancel, onDownload
}) {
  if (!visible) return null;
  const allChecked = selectedIds.length === cuadres.length && cuadres.length > 0;
  return (
    <div className="modal-mask">
      <div className="modal-card">
        <h3>Selecciona registros para agrupar</h3>
        <div className="modal-body">
          <label className="check-all">
            <input type="checkbox" checked={allChecked} onChange={onToggleAll} /> Seleccionar todo
          </label>
          <div className="modal-list">
            {cuadres.map(c => (
              <label key={c.id}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(c.id)}
                  onChange={() => onToggleOne(c.id)}
                /> {formatDate(c.fecha)} – {sucursalesMap[c.sucursalId] || 'Sin sucursal'}
              </label>
            ))}
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>Cancelar</button>
          <button className="btn btn-primary" onClick={onDownload}>Descargar PDF</button>
        </div>
      </div>
    </div>
  );
}
