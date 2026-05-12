// src/components/registrar-cierre/ResumenPanel.jsx
import React from 'react';
import { toMoney } from '../../utils/numbers';

export default function ResumenPanel({
  totals = {},
  flags = {},
  cajaChicaUsada = 0,
  onPagarFaltante,
  faltantePagado = 0,
  pedidosYaCantidad = 0,
  amexTotal = 0,
  showPedidosYa = false,
  showAmex = false,
  totalAperturas = 0,
  isAdmin = false,
}) {
  const {
    totalArqueoEfectivoNeto = 0,
    totalArqueoTarjeta = 0,
    totalArqueoMotorista = 0,

    totalCierreEfectivo = 0,
    totalCierreTarjeta = 0,
    totalCierreMotorista = 0,

    totalGastos = 0,
    faltanteEfectivo = 0,

    totalGeneral = 0,
    totalArqueoEfectivo = 0, 
  } = totals;

  const {
    diffEsPositivo = true,
    diffLabel = 'Sobrante',
    diffAbs = 0,
    isDepositNegative = false,
  } = flags;

  const efectivoAdmin = Number.isFinite(totalArqueoEfectivoNeto)
    ? totalArqueoEfectivoNeto
    : Math.max(0, (totalArqueoEfectivo || 0) - (totalAperturas || 0));

  return (
    <section className="rc-card">
      <div className="rc-card-hd">
         <h3 className="card-title">Resumen</h3>
      </div>
     

      <div
        className="rc-resumen-grid"
        style={!isAdmin ? { gridTemplateColumns: '1fr' } : undefined}
      >
        {/* IZQUIERDA - Ventas Total Sistema (solo admin) */}
        {isAdmin && (
          <div className="rc-res-col rc-res-sistema">
            <div className="rc-res-title">Ventas Total Sistema</div>

            <div className="rc-res-item">
              <span>Efectivo</span>
              <b>{toMoney(totalCierreEfectivo)}</b>
            </div>
            <div className="rc-res-item">
              <span>Tarjeta</span>
              <b>{toMoney(totalCierreTarjeta)}</b>
            </div>
            <div className="rc-res-item">
              <span>A domicilio</span>
              <b>{toMoney(totalCierreMotorista)}</b>
            </div>

            <div className={`rc-res-item ${diffEsPositivo ? 'ok' : 'bad'}`}>
              <span>{diffLabel}</span>
              <b>{toMoney(diffAbs)}</b>
            </div>

            {faltanteEfectivo > 0 && faltantePagado === 0 && (
              <div className="rc-res-item">
                <button
                  type="button"
                  className="rc-btn rc-btn-primary"
                  onClick={onPagarFaltante}
                >
                  Pagar faltante 
                  ({toMoney(faltanteEfectivo)})
                </button>
              </div>
            )}

            {faltantePagado > 0 && (
              <div className="rc-res-item ok">
                <span>Faltante pagado</span>
                <b>{toMoney(faltantePagado)}</b>
              </div>
            )}
          </div>
        )}

        {/* DERECHA - Control Administración (visible para todos) */}
        <div className="rc-res-col rc-res-admin">
          <div className="rc-res-title">Control Administración</div>

          <div className="rc-res-item">
            <span>Efectivo</span>
            <b>{toMoney(efectivoAdmin)}</b>
          </div>
          <div className="rc-res-item">
            <span>Tarjeta</span>
            <b>{toMoney(totalArqueoTarjeta)}</b>
          </div>
          <div className="rc-res-item">
            <span>A domicilio</span>
            <b>{toMoney(totalArqueoMotorista)}</b>
          </div>
          <div className="rc-res-item">
            <span>Gastos</span>
            <b>{toMoney(totalGastos)}</b>
          </div>
           <div className="rc-res-item">
            <div className="rc-res-left">
              <span>Caja chica</span>
              <span className="rc-res-sub">(usada)</span>
            </div>
            <b>{toMoney(cajaChicaUsada)}</b>
          </div>

          {showPedidosYa && (
            <div className="rc-res-item">
              <span>Pedidos Ya</span>
              <b>{toMoney(pedidosYaCantidad)}</b>
            </div>
          )}
          {showAmex && (
            <div className="rc-res-item">
              <span>American Express</span>
              <b>{toMoney(amexTotal)}</b>
            </div>
          )}
        </div>
      </div>

      {/* Total a depositar */}
      <div className={`rc-total-deposit ${isDepositNegative ? 'bad' : ''}`}>
        <span className="money">
          <img
            className="rc-total-icon"
            src="/img/billetes-de-banco.png"     // <-- pon aquí tu ruta/imagen
            alt=""
            aria-hidden="true"
          />
          Total a depositar
        </span>
        <b>{toMoney(totalGeneral)}</b>
      </div>
    </section>
  );
}
