// src/components/ventas/VentasTable.jsx
import React from 'react';
import { n, totalEfectivoCaja, toMoney } from '../../utils/numbers';
import { formatDate } from '../../utils/dates';

export default function VentasTable({
  cuadres = [],
  sucursalesMap = {},
  onVer,
  onEditar,
  onDescargar,
  onEliminar,
  canManage = true,   // Editar / Eliminar (true solo para admin en tu lógica actual)
  canDownload = true, // Descargar PDF
  isAdmin = false,    // Opcional: si no lo pasas, se infiere con canManage
}) {
  const showAdminCols = isAdmin || canManage;

  // Headers EXACTOS que quieres ver (desktop y los mismos en móvil vía data-label)
  const headers = React.useMemo(
    () =>
      showAdminCols
        ? [
            'Fecha',
            'Sucursal',
            'Usuario',
            'Efectivo',
            'Tarjeta',
            'Motorista',
            'Total a depositar',
            'Hora',
            'Acciones',
          ]
        : [
            'Fecha',
            'Efectivo',
            'Tarjeta',
            'Motorista',
            'Total a depositar',
            'Hora',
            'Acciones',
          ],
    [showAdminCols]
  );

  const Acciones = ({ c }) => (
    <div className="acciones">
      <button className="btn-min" onClick={() => onVer && onVer(c)}>Ver</button>

      {canManage && (
        <button className="btn-min" onClick={() => onEditar && onEditar(c)}>Editar</button>
      )}

      {canDownload && (
        <button className="btn-min" onClick={() => onDescargar && onDescargar(c)}>
          Descargar
        </button>
      )}

      {canManage && (
        <button className="btn-min danger" onClick={() => onEliminar && onEliminar(c.id)}>
          Eliminar
        </button>
      )}
    </div>
  );

  // HH:mm (preferimos createdAt; fallback updatedAt). Acepta Timestamp|Date|string
  const toLocalHour = (tsLike) => {
    if (!tsLike) return '—';
    let d = null;
    if (typeof tsLike?.toDate === 'function') d = tsLike.toDate(); // Firestore Timestamp
    else if (typeof tsLike?.seconds === 'number') d = new Date(tsLike.seconds * 1000);
    else d = new Date(tsLike);
    if (!d || isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div className="ventas-tabla-wrap">
      <table className="ventas-tabla">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          {cuadres.length === 0 ? (
            <tr>
              <td className="empty" colSpan={headers.length}>Sin registros</td>
            </tr>
          ) : (
            cuadres.map((c) => {
              // Totales desde Arqueo Físico
              const arq = Array.isArray(c.arqueo) ? c.arqueo : [];
              const ef  = arq.reduce((acc, x) => acc + totalEfectivoCaja(x), 0);
              const tar = arq.reduce((acc, x) => acc + n(x.tarjeta), 0);
              const mot = arq.reduce((acc, x) => acc + n(x.motorista), 0);

              // Preferir totalGeneral calculado/guardado; si no, EF+TAR
              const savedRaw = c?.totales?.totalGeneral;
              const hasSaved = savedRaw !== undefined && savedRaw !== null && savedRaw !== '';
              const totalDepositar = hasSaved ? n(savedRaw) : (ef + tar);

              // Usuario (evita renderizar objetos)
              const usuario =
                c?.username ||
                c?.createdBy?.username ||
                c?.createdByUsername ||
                '—';

              // Hora (createdAt > updatedAt)
              const hora = toLocalHour(c?.createdAt || c?.updatedAt);

              if (showAdminCols) {
                // Orden: Fecha | Sucursal | Usuario | Efectivo | Tarjeta | Motorista | Total | Hora | Acciones
                return (
                  <tr key={c.id}>
                    <td data-label={headers[0]}>{formatDate(c.fecha)}</td>
                    <td data-label={headers[1]}>{sucursalesMap[c.sucursalId] || '—'}</td>
                    <td data-label={headers[2]}>{usuario}</td>
                    <td data-label={headers[3]} className="text-right">{toMoney(ef)}</td>
                    <td data-label={headers[4]} className="text-right">{toMoney(tar)}</td>
                    <td data-label={headers[5]} className="text-right">{toMoney(mot)}</td>
                    <td data-label={headers[6]} className="text-right">{toMoney(totalDepositar)}</td>
                    <td data-label={headers[7]}>{hora}</td>
                    <td data-label={headers[8]}><Acciones c={c} /></td>
                  </tr>
                );
              }

              // Viewer (sin columnas de admin)
              // Orden: Fecha | Efectivo | Tarjeta | Motorista | Total | Hora | Acciones
              return (
                <tr key={c.id}>
                  <td data-label={headers[0]}>{formatDate(c.fecha)}</td>
                  <td data-label={headers[1]} className="text-right">{toMoney(ef)}</td>
                  <td data-label={headers[2]} className="text-right">{toMoney(tar)}</td>
                  <td data-label={headers[3]} className="text-right">{toMoney(mot)}</td>
                  <td data-label={headers[4]} className="text-right">{toMoney(totalDepositar)}</td>
                  <td data-label={headers[5]}>{hora}</td>
                  <td data-label={headers[6]}><Acciones c={c} /></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
