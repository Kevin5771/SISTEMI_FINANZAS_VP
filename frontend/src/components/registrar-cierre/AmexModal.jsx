import React, { useEffect, useMemo, useState } from "react";
import { toMoney } from "../../utils/numbers";

/* === Constantes === */
const FLAVORS = [
  // Columna izquierda
  "Pepperoni",
  "Jamón",
  "Only Cheese",
  "Hawaiana",
  "Magnífica",
  "Dúo dinámico",
  "No meat",
  "4 estaciones",
  "Cheese fingers",
  // Columna derecha
  "Border cheese",
  "Suprema",
  "Full meat",
  "Super chilly",
  "Tejana",
  "Border champiñones",
  "Americana",
  "Italiana",
];

const priceFor = (name) => {
  if (name === "Pepperoni" || name === "Jamón") return 65;
  if (name === "Cheese fingers") return 40;
  return 85; // las demás
};

export default function AmexModal({
  open,
  onClose,
  onSave,
  initialItems = {},
  readOnly = false,
}) {
  /* Hooks SIEMPRE al inicio (sin returns antes) */
  const [qty, setQty] = useState(() => {
  const base = {};
  FLAVORS.forEach((f) => {
    const v = Number.isFinite(initialItems[f]) ? initialItems[f] : 0;
    base[f] = v > 0 ? v : '';   // <-- '' para mostrar placeholder
  });
  return base;
});


  // Sincroniza cantidades cuando el modal abre o cambian los datos iniciales
  useEffect(() => {
  if (!open) return;
  const next = {};
  FLAVORS.forEach((f) => {
    const v = Number.isFinite(initialItems[f]) ? initialItems[f] : 0;
    next[f] = v > 0 ? v : '';   // <-- '' para placeholder
  });
  setQty(next);
}, [open, initialItems]);


  const total = useMemo(
    () =>
      FLAVORS.reduce((acc, f) => {
        const q = Number(qty[f]) || 0;
        return acc + q * priceFor(f);
      }, 0),
    [qty]
  );

  const handleChange = (flavor, val) => {
  if (readOnly) return;
  const clean = String(val).replace(/[^\d]/g, '');
  // Si es vacío o "0", guardamos '' para que se vea el placeholder
  const next = (clean === '' || clean === '0') ? '' : parseInt(clean, 10);
  setQty(prev => ({ ...prev, [flavor]: next }));
};


  const renderCol = (arr) => (
    <div className="amex-col">
      {arr.map((f) => (
        <div className="amex-row" key={f}>
          <div className="amex-label">{f}</div>
          <input
            className="rc-input amex-input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={qty[f]}
            onChange={(e) => handleChange(f, e.target.value)}
            placeholder=""
            disabled={readOnly}
            aria-label={`Cantidad ${f}`}
          />
        </div>
      ))}
    </div>
  );

  const left = FLAVORS.slice(0, 9);
  const right = FLAVORS.slice(9);

  const onConfirm = () => {
    if (readOnly) return;
    const items = {};
    Object.keys(qty).forEach((k) => {
      const v = Number(qty[k]) || 0;
      if (v > 0) items[k] = v;
    });
    onSave?.({ items, total });
  };

  /* Recién aquí cortamos el render si está cerrado */
  if (!open) return null;

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal-card amex-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="card-title" style={{ textAlign: "center" }}>
          American Express
        </h3>

        <div className="amex-grid">
          {renderCol(left)}
          {renderCol(right)}
        </div>

        <div className="amex-footer">
          <div className="amex-total">
            <span>Total</span>
            <b>{toMoney(total)}</b>
          </div>
        </div>
      </div>
    </div>
  );
}
