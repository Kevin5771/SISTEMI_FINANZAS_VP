// src/components/finanzas/Finanzas.js
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import MyCalendar from '../calendario/MyCalendar';
import './Finanzas.css';

/* ========= Helpers ========= */
const nnum = (v) => (typeof v === 'number' ? v : parseFloat(v || 0)) || 0;
const isAjusteCat = (c) => (c || '').toString().trim().toLowerCase() === 'ajuste de caja chica';

const extractTotalADepositar = (d) => {
  const t = d?.totales || {};
  if (t?.totalGeneral != null && !isNaN(t.totalGeneral)) {
    return nnum(t.totalGeneral);
  }
  return 0;
};

const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/* ======== Persistencia local del checklist (sin latencia) ======== */
const checklistKey = (sucursalId, iso) => `finanzas_checked_${sucursalId || 'NA'}_${iso}`;
const loadCheckedTexts = (sucursalId, iso) => {
  try {
    const raw = localStorage.getItem(checklistKey(sucursalId, iso));
    const arr = JSON.parse(raw || '[]');
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};
const saveCheckedTexts = (sucursalId, iso, texts) => {
  try {
    localStorage.setItem(checklistKey(sucursalId, iso), JSON.stringify(texts || []));
  } catch {}
};

export default function Finanzas() {
  // Rol dinámico (Admin/Viewer)
  const [isAdmin, setIsAdmin] = useState(false);

  const [ready, setReady] = useState(false);
  const [sucursales, setSucursales] = useState([]);
  const [selectedSucursal, setSelectedSucursal] = useState('');
  const [userSucursalId, setUserSucursalId] = useState(null);
  const [userLoaded, setUserLoaded] = useState(false);

  // KPI por sucursal
  const [kpiBySucursal, setKpiBySucursal] = useState({});
  // “Pagos del día” (por sucursal)
  const [todayPayments, setTodayPayments] = useState({});
  // Estado local para checklist (id sucursal → índices completados)
  const [checkedPayments, setCheckedPayments] = useState({});

  const calendarRef = useRef(null);

  // Perfil (obtener sucursal del usuario y rol)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setUserSucursalId(null);
        setIsAdmin(false);
        setUserLoaded(true);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setUserSucursalId(data.sucursalId || null);
        const role = (data.rol || data.role || '').toString().toLowerCase();
        setIsAdmin(role === 'admin');
      } catch {
        setUserSucursalId(null);
        setIsAdmin(false);
      } finally {
        setUserLoaded(true);
      }
    });
    return () => unsub();
  }, []);

  const money = (n) =>
    new Intl.NumberFormat('es-GT', {
      style: 'currency',
      currency: 'GTQ',
      maximumFractionDigits: 2
    }).format(n || 0);

  // Cargar sucursales
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = await getDocs(collection(db, 'sucursales'));
        const list = qs.docs.map((snap) => {
          const d = snap.data() || {};
          return {
            id: snap.id,
            nombre: d.nombre || d.name || snap.id,
            ubicacion: d.ubicacion || d.location || '',
          };
        });
        if (!cancelled) {
          setSucursales(list);
          if (list.length) localStorage.setItem('sucursales', JSON.stringify(list));
        }
      } catch (e) {
        console.warn('No se pudieron cargar sucursales:', e?.message || e);
        if (!cancelled) setSucursales([]);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Fijar la sucursal inicial
  useEffect(() => {
    if (!ready || !userLoaded) return;
    let initial = userSucursalId;
    if (!initial && sucursales.length) initial = sucursales[0].id;
    setSelectedSucursal(initial || '');
    if (initial) localStorage.setItem('activeSucursalId', initial);
  }, [ready, userLoaded, userSucursalId, sucursales]);

  // Recalcular KPI
  useEffect(() => {
    if (!ready || !selectedSucursal) return;

    const recalc = async () => {
      const id = selectedSucursal;

      try {
        const sSnap = await getDoc(doc(db, 'sucursales', id));
        const sData = sSnap.exists() ? (sSnap.data() || {}) : {};
        const cajaChicaDisp = Number(sData.cajaChica || 0);

        const cierresRef = collection(db, 'cierres');
        const qCierres = query(cierresRef, where('sucursalId', '==', id));
        const cierresSnap = await getDocs(qCierres);
        let sumaCierres = 0;
        cierresSnap.forEach(d => { sumaCierres += extractTotalADepositar(d.data() || {}); });

        const pagosRef = collection(db, 'pagos');
        const qPagos = query(pagosRef, where('sucursalId', '==', id));
        const pagosSnap = await getDocs(qPagos);

        let sumNoAjuste = 0;
        let sumAjuste = 0;
        let sumCajaChicaUsada = 0;

        pagosSnap.forEach((snap) => {
          const p = snap.data() || {};
          const items = Array.isArray(p.items) ? p.items : [];
          items.forEach((it) => {
            const monto = nnum(it?.monto);
            if (isAjusteCat(it?.categoria)) sumAjuste += monto;
            else sumNoAjuste += monto;
          });
          sumCajaChicaUsada += nnum(p?.cajaChicaUsada);
        });

        const kpi = Math.max(0, (sumaCierres - sumNoAjuste) + sumAjuste + sumCajaChicaUsada);

        // -- Calcular Gastos de Servicios del Mes --
        const serviciosRef = collection(db, 'servicios');
        const todayDate = new Date();
        const currentMonthPrefix = `${todayDate.getFullYear()}-${String(todayDate.getMonth() + 1).padStart(2, '0')}`;
        
        const qServicios = query(serviciosRef, where('sucursalId', '==', id));
        const serviciosSnap = await getDocs(qServicios);
        let sumServiciosMes = 0;
        serviciosSnap.forEach((snap) => {
          const s = snap.data() || {};
          if (s.fecha && s.fecha.startsWith(currentMonthPrefix)) {
             sumServiciosMes += nnum(s.totalUtilizado);
          }
        });

        setKpiBySucursal({ [id]: { cajaChica: cajaChicaDisp, ventas: kpi, serviciosMes: sumServiciosMes } });
      } catch {
        setKpiBySucursal({ [selectedSucursal]: { cajaChica: 0, ventas: 0, serviciosMes: 0 } });
      }
    };

    recalc();
  }, [ready, selectedSucursal]);

  // “Pagos del día”
  useEffect(() => {
    if (!ready || !selectedSucursal) return;

    (async () => {
      const id = selectedSucursal;
      const iso = todayISO();
      try {
        const qs = await getDocs(
          query(collection(db, 'pagos'), where('sucursalId', '==', id), where('fecha', '==', iso))
        );
        const arr = [];
        qs.forEach(s => {
          const d = s.data() || {};
          (d.items || []).forEach(it => {
            const name = (it.descripcion || '').trim() || (it.categoria || '').trim();
            if (name) arr.push(name);
          });
        });

        // Persistencia: cargar lo marcado desde localStorage (por sucursal+fecha)
        const storedCheckedTexts = loadCheckedTexts(id, iso);
        const storedSet = new Set(storedCheckedTexts);

        // Mapear a índices actuales (si coincide por texto)
        const indicesChecked = [];
        arr.forEach((txt, idx) => {
          if (storedSet.has(txt)) indicesChecked.push(idx);
        });

        setTodayPayments({ [id]: arr.slice(0, 10) });
        setCheckedPayments((prev) => ({ ...prev, [id]: indicesChecked }));
      } catch {
        setTodayPayments({ [id]: [] });
        setCheckedPayments((prev) => ({ ...prev, [id]: [] }));
      }
    })();
  }, [ready, selectedSucursal]);

  const abrirModalActividad = () => {
    calendarRef.current?.openAddModal?.();
  };

  const branchLabel = (s) => s.ubicacion || s.nombre || s.id;

  const visibleCards = useMemo(() => {
    return sucursales.filter(s => s.id === selectedSucursal);
  }, [selectedSucursal, sucursales]);

  const togglePago = (sucursalId, idx) => {
    const iso = todayISO();
    const items = todayPayments[sucursalId] || [];

    // 1) Actualiza estado (índices)
    setCheckedPayments((prev) => {
      const current = new Set(prev[sucursalId] || []);
      if (current.has(idx)) current.delete(idx);
      else current.add(idx);
      const updated = { ...prev, [sucursalId]: [...current] };

      // 2) Persistencia por texto (más robusto si cambia el orden)
      const checkedIdx = updated[sucursalId] || [];
      const checkedTexts = checkedIdx.map(i => items[i]).filter(Boolean);
      saveCheckedTexts(sucursalId, iso, checkedTexts);

      return updated;
    });
  };

  return (
    <div className="home-shell">
      {/* TOPBAR */}
      <section className="topbar">
        <header className="home-header">
          <h1>Sistema Finanzas</h1>

          {/* Botón admin (solo Admin) */}
          {isAdmin && (
            <button className="add-task-btn" onClick={abrirModalActividad}>
              ➕ Añadir tarea
            </button>
          )}

          {/* Selector de sucursal (solo Admin) */}
          {isAdmin && (
            <div className="branch-selector">
              <label htmlFor="branchSelect" className="branch-selector__label">Seleccionar sucursal</label>
              <select
                id="branchSelect"
                className="branch-selector__select"
                value={selectedSucursal}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedSucursal(val);
                  localStorage.setItem('activeSucursalId', val);
                }}
              >
                {sucursales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {branchLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>
      </section>

      {/* CONTENIDO: KPI izq + calendario der */}
      <section className="content-row">
        <div className="kpi-left">
          {visibleCards.map((s) => {
            const stats = kpiBySucursal[s.id] || { cajaChica: 0, ventas: 0 };
            const pagosHoy = todayPayments[s.id] || [];
            const checked = new Set(checkedPayments[s.id] || []);

            return (
              <div className="kpi-card" key={s.id}>
                {/* Encabezado sucursal */}
                <div className="kpi-branch">Sucursal: {branchLabel(s)}</div>

                {/* Chip: Dinero para depósitos */}
                <div className="kpi-chip kpi-chip--green">
                  <span className="chip-legend">Dinero para depósitos</span>
                  <strong className="chip-value">{money(stats.ventas)}</strong>
                  <img className="chip-icon" src="/img/billetes-de-banco.png" alt="Depósitos" />
                </div>

                {/* Chip: Caja chica */}
                <div className="kpi-chip kpi-chip--green">
                  <span className="chip-legend">Caja chica disponible</span>
                  <strong className="chip-value">{money(stats.cajaChica)}</strong>
                  <img className="chip-icon" src="/img/billetes-de-banco.png" alt="Caja chica" />
                </div>

                {/* Chip: Gastos de Servicios */}
                <div className="kpi-chip kpi-chip--green" style={{ background: 'linear-gradient(135deg, #3f51b5 0%, #1a237e 100%)' }}>
                  <span className="chip-legend">Servicios Pagados (Mes)</span>
                  <strong className="chip-value">{money(stats.serviciosMes || 0)}</strong>
                  <img className="chip-icon" src="/img/factura.png" alt="Servicios" />
                </div>

                {/* Pagos del día (solo Viewer) */}
                {!isAdmin && (
                  <div className="kpi-daycard">
                    <div className="kpi-daycard-title">Pagos del día</div>
                    <ul className="kpi-checklist">
                      {pagosHoy.length
                        ? pagosHoy.map((txt, idx) => (
                            <li key={`${txt}-${idx}`}>
                              <label className={`pago-item ${checked.has(idx) ? 'checked' : ''}`}>
                                <input
                                  type="checkbox"
                                  checked={checked.has(idx)}
                                  onChange={() => togglePago(s.id, idx)}
                                />
                                <span>{txt}</span>
                              </label>
                            </li>
                          ))
                        : <li className="muted">Sin pagos hoy</li>}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="home-calendar-card">
          {ready ? (
            <MyCalendar ref={calendarRef} showAddButton={isAdmin} />
          ) : (
            <div className="text-muted">Cargando sucursales…</div>
          )}
        </div>
      </section>
    </div>
  );
}