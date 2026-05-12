// src/components/registrar-cierre/CajaChicaModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { toMoney } from '../../utils/numbers';

export default function CajaChicaModal({
  open,
  onClose,
  cajaChicaDisponible,
  faltantePorGastos,
  onApply,
  // Sugerido = totalGastos - totalArqueoEfectivoNeto (lo calculas en el padre)
  montoSugerido = 0,
}) {
  const [monto, setMonto] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Helpers centavos
  const toCents = (n) => Math.round(Number(n || 0) * 100);
  const fromCents = (c) => (c || 0) / 100;

  // Límites (en centavos)
  const disponibleCents = useMemo(() => toCents(cajaChicaDisponible), [cajaChicaDisponible]);
  const maxCents = useMemo(
    () => Math.min(disponibleCents, toCents(faltantePorGastos)),
    [disponibleCents, faltantePorGastos]
  );

  // Prefill: usar montoSugerido clampeado, o vacío si 0
  useEffect(() => {
    if (!open) {
      setMonto('');
      setErrorMsg('');
      return;
    }
    const sugeridoCents = Math.max(0, toCents(montoSugerido || 0));
    const inicialCents = Math.min(sugeridoCents, maxCents); // clamp
    const inicial = fromCents(inicialCents);
    setMonto(inicial > 0 ? inicial.toFixed(2) : '');
    setErrorMsg('');
  }, [open, montoSugerido, maxCents]);

  if (!open) return null;

  // Sanitiza texto dinero (solo dígitos y un punto, máx 2 decimales)
  const sanitizeMoney = (raw) => {
    let v = (raw || '').replace(',', '.').replace(/[^\d.]/g, '');
    const firstDot = v.indexOf('.');
    if (firstDot !== -1) v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, '');
    const parts = v.split('.');
    if (parts[1]?.length > 2) v = parts[0] + '.' + parts[1].slice(0, 2);
    return v;
  };

  const handleChange = (e) => {
    setMonto(sanitizeMoney(e.target.value));
    if (errorMsg) setErrorMsg('');
  };

  const handleBlur = () => {
    if (monto === '' || monto === '.') return;
    const val = parseFloat(monto);
    if (!isNaN(val)) setMonto(val.toFixed(2));
  };

  const showError = (msg) => setErrorMsg(msg || 'Ingresa un dato válido');

  const handleGuardar = () => {
    const val = parseFloat(monto);

    if (!val || isNaN(val) || val <= 0) {
      showError('Ingresa un monto válido (ej. 0.00)');
      return;
    }

    const valCents = toCents(val);

    // No superar caja chica disponible
    if (valCents > disponibleCents) {
      showError(`El monto supera la caja chica disponible (${toMoney(fromCents(disponibleCents))})`);
      return;
    }

    // También respetar faltantePorGastos (si aplica)
    if (valCents > maxCents) {
      showError(`No puedes usar más de ${toMoney(fromCents(maxCents))}`);
      return;
    }

    onApply(fromCents(valCents)); // devolver en quetzales exactos
    onClose();
  };

  return (
    <>
      {/* Modal principal */}
      <div className="rc-modal-mask" role="dialog" aria-modal="true">
        <div className="rc-modal-card">
          <div className="rc-modal-hd">
            <h4>Utilizar caja chica</h4>
            <div className="rc-modal-actions">
              <button className="rc-btn rc-btn-outline" onClick={onClose}>Cerrar</button>
              <button className="rc-btn rc-btn-primary" onClick={handleGuardar}>Aplicar</button>
            </div>
          </div>

          <div className="rc-modal-body">
            
            <div style={{ marginTop: 8 }}>
              <label className="rc-cell-label">Monto a usar (Q)</label>
              <input
                className="rc-input"
                type="text"
                inputMode="decimal"
                value={monto}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="0.00"
                aria-invalid={!!errorMsg}
                aria-describedby="monto-error"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Modal de error */}
      {errorMsg && (
        <div className="rc-modal-mask" role="dialog" aria-modal="true" aria-labelledby="error-title">
          <div className="rc-modal-card" style={{ maxWidth: 420 }}>
            <div className="rc-modal-hd">
              <h4 id="error-title">Error</h4>
              <div className="rc-modal-actions">
                <button className="rc-btn rc-btn-primary" onClick={() => setErrorMsg('')} autoFocus>
                  Aceptar
                </button>
              </div>
            </div>
            <div className="rc-modal-body">
              <p id="monto-error" style={{ margin: 0 }}>
                {errorMsg || 'Ingresa un dato válido (0.00)'}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
