import { useReducer, useMemo } from 'react';
import { n, totalEfectivoCaja } from '../utils/numbers';

// Helper para detectar categoría "Ajuste de caja chica"
const isAjusteCajaChica = (name) =>
  (name || '').toString().trim().toLowerCase() === 'ajuste de caja chica';

function reducer(state, action) {
  switch (action.type) {
    case 'LOAD': return { ...action.payload, isEditing: true };
    case 'FIELD_ARQUEO': {
      const { idx, field, value } = action;
      const arq = state.arqueo.map((c, i) => i === idx ? { ...c, [field]: value } : c);
      return { ...state, arqueo: arq };
    }
    case 'FIELD_CIERRE': {
      const { idx, field, value } = action;
      const cier = state.cierre.map((c, i) => i === idx ? { ...c, [field]: value } : c);
      return { ...state, cierre: cier };
    }
    case 'FIELD_GASTO': {
      const { i, field, value } = action;
      const gastos = state.gastos.map((g, idx) => idx === i ? { ...g, [field]: value } : g);
      return { ...state, gastos };
    }
    case 'SET': return { ...state, [action.key]: action.value };
    case 'RESET': return null;
    default: return state;
  }
}

export function useCuadreEdicion(fuente) {
  const [state, dispatch] = useReducer(reducer, null);

  const cargar = (c) => dispatch({ type: 'LOAD', payload: {
    arqueo: (c.arqueo || [{},{},{}]).map(x=>({...x})),
    cierre: (c.cierre || [{},{},{}]).map(x=>({...x})),
    gastos: (c.gastos || []).map(x=>({...x})),
    comentario: c.comentario || '',
    cajaChicaUsada: n(c.cajaChicaUsada),
    faltantePagado: n(c.faltantePagado),
  }});

  const metrics = useMemo(() => {
    const arqueo = state?.arqueo || fuente?.arqueo || [{},{},{}];
    const cierre = state?.cierre || fuente?.cierre || [{},{},{}];
    const gastos = state?.gastos || fuente?.gastos || [];

    // Arqueo bruto
    const totalArqEf = arqueo.reduce((a,c)=> a + totalEfectivoCaja(c), 0);
    const totalArqTar = arqueo.reduce((a,c)=> a + n(c.tarjeta), 0);
    const totalArqMot = arqueo.reduce((a,c)=> a + n(c.motorista), 0);

    // 🔹 Apertura total y EFECTIVO NETO
    const aperturaTotal = arqueo.reduce((a,c)=> a + n(c.apertura ?? 1000), 0);
    const totalArqEfNeto = totalArqEf - aperturaTotal;

    // Cierre
    const totalCieEf = cierre.reduce((a,c)=> a + n(c.efectivo), 0);
    const totalCieTar = cierre.reduce((a,c)=> a + n(c.tarjeta), 0);
    const totalCieMot = cierre.reduce((a,c)=> a + n(c.motorista), 0);

    // Gastos + Ajuste de caja chica
    const totalGastos = gastos.reduce((s,g)=> s + n(g.cantidad), 0);
    const totalAjusteCajaChica = gastos.reduce(
      (s,g)=> s + (isAjusteCajaChica(g.categoria) ? n(g.cantidad) : 0),
      0
    );

    const cajaChicaUsada = n(state?.cajaChicaUsada ?? fuente?.cajaChicaUsada);
    const faltantePagado = n(state?.faltantePagado ?? fuente?.faltantePagado);

    // 🔹 Diferencia y depósito con EFECTIVO NETO
    const diffEf = totalArqEfNeto - totalCieEf;

    // Depósito: neto - gastos + ajuste + faltantePagado
    const totalGeneral = totalArqEfNeto - totalGastos + totalAjusteCajaChica + faltantePagado;

    return {
      // Arqueo
      totalArqEf,        // bruto (puedes mostrarlo si quieres)
      totalArqEfNeto,    // 👈 usar para diferencias y depósito en UI
      totalArqTar, totalArqMot,

      // Cierre
      totalCieEf, totalCieTar, totalCieMot,

      // Gastos / ajustes
      totalGastos, totalAjusteCajaChica,

      // Caja chica / faltante
      cajaChicaUsada, faltantePagado,

      // Métricas clave
      diffEf, totalGeneral
    };
  }, [state, fuente]);

  return { state, dispatch, cargar, metrics };
}
