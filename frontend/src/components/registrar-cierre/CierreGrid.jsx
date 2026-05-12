// src/components/registrar-cierre/CierreGrid.jsx
import React from 'react';

const ICONS = {
  bill:  '/img/billetes-de-banco.png',
  card:  '/img/pago-tarjeta.png',
  moto:  '/img/repartidor.png',
};

const isEmpty = (v) => v === '' || v === null || v === undefined;

/* Formatea SOLO para UI con separadores de miles, sin forzar .00 */
const formatThousands = (txt) => {
  const s = String(txt ?? '');
  if (!s) return '';
  const [intPartRaw, decPart = ''] = s.split('.');
  // Permitimos que el usuario deje el entero vacío si empieza con "."
  const intPart = intPartRaw.replace(/\D/g, '');
  const intFmt = intPart
    ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : ''; // si está vacío, no mostramos "0" automáticamente
  return decPart !== '' ? `${intFmt}.${decPart}` : intFmt;
};

const MoneyInput = ({
  value,
  onChange,
  placeholder = '0.00',
  ariaLabel,
  disabled,
  width = 200,
}) => {
  const [draft, setDraft] = React.useState('');

  // Sincroniza el draft con el prop 'value' cuando cambia desde el padre
  React.useEffect(() => {
    if (value === '' || value === null || value === undefined) {
      setDraft('');
    } else {
      setDraft(String(value));
    }
  }, [value]);

  return (
    <input
      className="rc-input no-spin"
      type="text"
      inputMode="decimal"
      value={formatThousands(draft)}
      onChange={(e) => {
        // Quita comas visibles y normaliza coma a punto
        let next = e.target.value.replace(/,/g, '').replace(',', '.');

        // Permitir vacío, enteros y decimales con punto (incluye "14." temporal)
        if (next === '' || /^\d*\.?\d*$/.test(next)) {
          setDraft(next);     
          onChange(next);
        }
      }}
      onKeyDown={(e) => {
        // Evita notación científica y signos
        if (['e','E','+','-'].includes(e.key)) e.preventDefault();
      }}
      onWheel={(e) => e.currentTarget.blur()}
      placeholder={placeholder}
      aria-label={ariaLabel}
      disabled={disabled}
      style={{ width, textAlign: 'right' }}
    />
  );
};

export default function CierreGrid({ cierre, setCier, readOnly = false }) {
  const inputsDisabled = readOnly;

  return (
    <section className="rc-card">
      <div className="rc-card-hd">
        <h3 style={{ margin: 0 }}>Cierre de Sistema</h3>
      </div>

      <div className="rc-sheet rc-sheet-3cols">
        {[0, 1, 2].map((i) => {
          const c = cierre[i] || {};
          return (
            <div className="rc-col" key={`cier-${i}`}>
              <div className="rc-col-hd rc-col-hd--stack">
                <span>{`Caja ${i + 1}`}</span>
              </div>

              {/* Efectivo */}
              <div className="rc-row" style={{ alignItems: 'center', gap: 8 }}>
                <span
                  className="rc-cell-label"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <img
                    src={ICONS.bill}
                    alt="Efectivo"
                    width={35}
                    height={35}
                    style={{ objectFit: 'contain' }}
                  />
                  Efectivo
                </span>

                <div className="rc-money-wrap">
                  <span style={{ color: '#6b7280', fontWeight: 600 }}>Q.</span>
                  <MoneyInput
                    value={isEmpty(c.efectivo) ? '' : c.efectivo}
                    onChange={(val) => setCier(i, 'efectivo', val)}
                    placeholder="0.00"
                    ariaLabel={`Efectivo caja ${i + 1}`}
                    disabled={inputsDisabled}
                    width="100%"
                  />
                </div>
              </div>

              {/* Tarjeta */}
              <div className="rc-row" style={{ alignItems: 'center', gap: 8 }}>
                <span
                  className="rc-cell-label rc-label-card"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <img
                    src={ICONS.card}
                    alt="Tarjeta"
                    width={35}
                    height={35}
                    style={{ objectFit: 'contain' }}
                  />
                  Tarjeta
                </span>

                <div className="rc-money-wrap">
                  <span style={{ color: '#6b7280', fontWeight: 600 }}>Q.</span>
                  <MoneyInput
                    value={isEmpty(c.tarjeta) ? '' : c.tarjeta}
                    onChange={(val) => setCier(i, 'tarjeta', val)}
                    placeholder="0.00"
                    ariaLabel={`Tarjeta caja ${i + 1}`}
                    disabled={inputsDisabled}
                    width="100%"
                  />
                </div>
              </div>

              {/* A domicilio */}
              <div className="rc-row" style={{ alignItems: 'center', gap: 8 }}>
                <span
                  className="rc-cell-label rc-label-moto"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
                >
                  <img
                    src={ICONS.moto}
                    alt="A domicilio"
                    width={35}
                    height={35}
                    style={{ objectFit: 'contain' }}
                  />
                  A domicilio
                </span>

                <div className="rc-money-wrap">
                  <span style={{ color: '#6b7280', fontWeight: 600 }}>Q.</span>
                  <MoneyInput
                    value={isEmpty(c.motorista) ? '' : c.motorista}
                    onChange={(val) => setCier(i, 'motorista', val)}
                    placeholder="0.00"
                    ariaLabel={`A domicilio caja ${i + 1}`}
                    disabled={inputsDisabled}
                    width="100%"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
