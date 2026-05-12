// src/utils/kpi.js
import {
  collection, getDocs, query, where, doc, updateDoc
} from 'firebase/firestore';
import { db } from '../services/firebase';

/* ===========================
   Helpers
   =========================== */

// Número seguro (soporta "Q 1,234.56", "1.234,56", etc.)
const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (typeof v !== 'string') return 0;

  const s0 = v.trim();
  const s1 = s0.replace(/[^\d.,-]/g, '');

  let s2;
  if (!s1.includes('.') && (s1.match(/,/g)?.length === 1)) {
    // coma como decimal cuando no hay punto
    s2 = s1.replace(',', '.');
  } else {
    // quita separadores de miles en formato US
    s2 = s1.replace(/,/g, '');
  }

  const x = parseFloat(s2);
  return Number.isFinite(x) ? x : 0;
};

// Extrae "YYYY-MM-DD" desde un doc (prefiere campo 'fecha')
const getFechaStr = (d) => {
  const f = d?.fecha;
  if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f)) return f;

  const ts = d?.createdAt || d?.updatedAt || null;
  try {
    if (ts && typeof ts.toDate === 'function') {
      const iso = ts.toDate().toISOString(); // UTC
      return iso.slice(0, 10); // YYYY-MM-DD
    }
  } catch {}
  return '';
};

// Total "a depositar" desde un cierre (cuadre)
const getKpiFromCuadre = (c) => {
  const candidates = [
    c?.totales?.totalGeneral,      // formato actual
    c?.totalGeneral,               // algunos docs viejos lo guardan al root
    c?.kpiDepositosAtSave,         // snapshot en algunos flujos
    c?.totales?.kpiDepositosAtSave,
  ];
  for (const cand of candidates) {
    const v = num(cand);
    if (v !== 0) return v;
  }
  return 0;
};

/**
 * Calcula el impacto de un documento de pagos en el KPI.
 * - usedFromDepositos: cuánto sale de depósitos (>= 0)
 * - ajusteCC: suma de ítems con categoría "Ajuste de caja chica" (>= 0)
 *
 * Regla:
 *   usedFromDepositos = max( Σ(items !ajuste) - cajaChicaUsada, 0 )
 *   ajusteCC          = Σ(items ajuste)
 *
 * Fallback (docs viejos sin items):
 *   usedFromDepositos = max(totalUtilizado - cajaChicaUsada, 0)
 *   ajusteCC          = 0
 */
const calcPagoImpact = (p) => {
  const items = Array.isArray(p?.items) ? p.items : [];
  const cajaChicaUsada = num(p?.cajaChicaUsada);

  if (items.length > 0) {
    let sumNoAjuste = 0;
    let sumAjuste = 0;

    for (const it of items) {
      const cat = (it?.categoria || '').toString().trim().toLowerCase();
      const monto = num(it?.monto);
      if (cat === 'ajuste de caja chica') {
        sumAjuste += Math.max(monto, 0);
      } else {
        sumNoAjuste += Math.max(monto, 0);
      }
    }

    const usedFromDepositos = Math.max(sumNoAjuste - cajaChicaUsada, 0);
    return { usedFromDepositos, ajusteCC: sumAjuste };
  }

  // Fallback sin items
  const totalUtilizado = num(p?.totalUtilizado);
  const usedFromDepositos = Math.max(totalUtilizado - cajaChicaUsada, 0);
  return { usedFromDepositos, ajusteCC: 0 };
};

/* ===========================
   Recompute por sucursal
   =========================== */

/**
 * Recalcula kpiDepositos de una sucursal.
 *
 * KPI = Σ(cierres.totalGeneral)
 *       − Σ(usedFromDepositos de pagos)
 *       + Σ(ajuste de caja chica en pagos)
 *
 * donde:
 *   usedFromDepositos = max( Σ(items que NO son "Ajuste de caja chica") - cajaChicaUsada, 0 )
 */
export const recomputeSucursalKPI = async (sucursalId) => {
  if (!sucursalId) return;

  const sucRef = doc(db, 'sucursales', sucursalId);
  const cierresRef = collection(db, 'cierres');
  const pagosRef = collection(db, 'pagos');

  let sumCierres = 0;
  let sumUsadoDepositos = 0;
  let sumAjustesCC = 0;

  const dbg = {
    cierres: { total: 0, suma: 0, muestras: [] },
    pagos:   { total: 0, usado: 0, ajustes: 0, muestras: [] },
  };

  try {
    // --- CIERRES de la sucursal ---
    const cierresSnap = await getDocs(query(cierresRef, where('sucursalId', '==', sucursalId)));
    cierresSnap.forEach((d) => {
      const c = d.data() || {};
      dbg.cierres.total += 1;

      const v = getKpiFromCuadre(c);
      sumCierres += v;
      dbg.cierres.suma += v;

      const f = getFechaStr(c);
      if (dbg.cierres.muestras.length < 5) dbg.cierres.muestras.push(`${f || '(s/t)'}:${v.toFixed(2)}`);
    });

    // --- PAGOS de la sucursal ---
    const pagosSnap = await getDocs(query(pagosRef, where('sucursalId', '==', sucursalId)));
    pagosSnap.forEach((d) => {
      const p = d.data() || {};
      dbg.pagos.total += 1;

      const { usedFromDepositos, ajusteCC } = calcPagoImpact(p);
      sumUsadoDepositos += usedFromDepositos;
      sumAjustesCC += ajusteCC;

      const f = getFechaStr(p);
      if (dbg.pagos.muestras.length < 5) {
        dbg.pagos.muestras.push(`${f || '(s/t)'}:used=${usedFromDepositos.toFixed(2)},ajuste=${ajusteCC.toFixed(2)}`);
      }
    });
    
    // KPI final (nunca negativo)
    const saldo = Math.max(sumCierres - sumUsadoDepositos + sumAjustesCC, 0);

    // Log para depuración
    console.log(
      `[KPI] sucursal=${sucursalId} ` +
      `cierres(total/suma)=${dbg.cierres.total}/${dbg.cierres.suma.toFixed(2)} muestras=[${dbg.cierres.muestras.join(', ')}] ` +
      `pagos(total)=${dbg.pagos.total} usado=${sumUsadoDepositos.toFixed(2)} ajustes=${sumAjustesCC.toFixed(2)} muestras=[${dbg.pagos.muestras.join(', ')}] ` +
      `KPI=${saldo.toFixed(2)}`
    );

    // Guardar en la sucursal
    await updateDoc(sucRef, { kpiDepositos: saldo });
  } catch (e) {
    console.warn('recomputeSucursalKPI failed:', e?.code, e?.message);
  }
};

/** Recalcula KPI para TODAS las sucursales. */
export const recomputeAllSucursalesKPI = async () => {
  try {
    const snap = await getDocs(collection(db, 'sucursales'));
    const jobs = [];
    snap.forEach((d) => jobs.push(recomputeSucursalKPI(d.id)));
    await Promise.all(jobs);
  } catch (e) {
    console.warn('recomputeAllSucursalesKPI failed:', e?.message);
  }
};
