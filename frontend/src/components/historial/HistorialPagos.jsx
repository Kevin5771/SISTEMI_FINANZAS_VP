// src/HistorialPagos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs, increment,
  query, where, updateDoc, orderBy, limit, writeBatch
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './HistorialPagos.css';

import { auth, db } from '../../services/firebase';
import { getTodayLocalISO as getTodayLocalISO_ventas } from '../../utils/dates';
import { exportDepositosPdf, exportPagosGroupedPdf } from '../../pdf/exportadoresPagos'; 
import GroupDownloadModal from '../ventas/GroupDownloadModal';

// Compatibilidad
const getTodayLocalISO = getTodayLocalISO_ventas || (() => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
});

const fmtQ = (val) =>
  (typeof val === 'number' ? val : parseFloat(val || 0))
    .toLocaleString('es-GT', { style: 'currency', currency: 'GTQ' });

const n = (v) => {
  const x = typeof v === 'number' ? v : parseFloat(v || 0);
  return isNaN(x) ? 0 : x;
};

function sumItems(items) {
  return (items || []).reduce((acc, it) => acc + n(it.monto), 0);
}

// --- Helpers para recomputar KPI --- //
const toMillis = (tsLike) => {
  if (!tsLike) return 0;
  if (typeof tsLike?.toDate === 'function') return tsLike.toDate().getTime();
  if (typeof tsLike?.seconds === 'number') return tsLike.seconds * 1000;
  const d = new Date(tsLike);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

const getKpiFromCuadre = (c) => {
  const raw = c?.totales?.totalGeneral;
  const v = typeof raw === 'number' ? raw : parseFloat(raw || 0);
  return Number.isFinite(v) ? v : 0;
};
const getKpiFromPago = (p) =>
  Number(p?.sobranteParaManana ?? p?.kpiDepositosAtSave ?? 0);

// ✅ Versión robusta
const recomputeSucursalKPI = async (sucursalId) => {
  const candidatos = [];
  const pagosRef = collection(db, 'pagos');
  const cierresRef = collection(db, 'cierres');
  const sucRef = doc(db, 'sucursales', sucursalId);

  const pushPago = (p) => {
    if (!p) return;
    candidatos.push({
      ts: toMillis(p.createdAt || p.updatedAt || p.fecha),
      val: getKpiFromPago(p),
    });
  };
  const pushCierre = (c) => {
    if (!c) return;
    candidatos.push({
      ts: toMillis(c.createdAt || c.updatedAt || c.fecha),
      val: getKpiFromCuadre(c),
    });
  };

  const tryQuery = async (q, onDoc) => {
    try {
      const s = await getDocs(q);
      s.forEach(d => onDoc(d.data() || {}));
      return true;
    } catch (e) {
      console.warn('recomputeSucursalKPI query failed:', e?.code, e?.message);
      return false;
    }
  };

  const anyPreferredWorked = (await Promise.all([
    tryQuery(query(pagosRef,  where('sucursalId','==',sucursalId), orderBy('createdAt','desc'), limit(1)), pushPago),
    tryQuery(query(pagosRef,  where('sucursalId','==',sucursalId), orderBy('fecha','desc'),     limit(1)), pushPago),
    tryQuery(query(cierresRef, where('sucursalId','==',sucursalId), orderBy('createdAt','desc'), limit(1)), pushCierre),
    tryQuery(query(cierresRef, where('sucursalId','==',sucursalId), orderBy('fecha','desc'),     limit(1)), pushCierre),
  ])).some(Boolean);

  if (!anyPreferredWorked || candidatos.length === 0) {
    try {
      const sPagos   = await getDocs(query(pagosRef,  where('sucursalId','==',sucursalId)));
      const sCierres = await getDocs(query(cierresRef, where('sucursalId','==',sucursalId)));
      sPagos.forEach(d => pushPago(d.data() || {}));
      sCierres.forEach(d => pushCierre(d.data() || {}));
    } catch (e) {
      console.warn('recomputeSucursalKPI fallback failed:', e?.code, e?.message);
    }
  }

  if (candidatos.length === 0) {
    console.warn('recomputeSucursalKPI: sin candidatos; KPI se mantiene igual.');
    return;
  }

  const best = candidatos.sort((a,b) => (b.ts||0)-(a.ts||0))[0];
  const newKpi = Number(best?.val || 0);
  await updateDoc(sucRef, { kpiDepositos: newKpi });
};

export default function Pagos() {
  const navigate = useNavigate();

  // Perfil del usuario
  const [me, setMe] = useState({ loaded:false, role:'viewer', sucursalId:null });
  const isAdmin = me.role === 'admin';

  // Filtros
  const [fechaFiltro, setFechaFiltro] = useState(getTodayLocalISO());
  const [sucursalFiltro, setSucursalFiltro] = useState('all');

  // Sucursales
  const [sucursalesList, setSucursalesList] = useState([]);
  const [sucursalesMap, setSucursalesMap] = useState({});

  // Datos
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);

  // (conservados para viewer/editor modal de soporte)
  const [viewer, setViewer] = useState({ open:false, doc:null });
  const [editor, setEditor] = useState({ open:false, doc:null, items:[] });

  // Modal agrupado (igual que HistorialCuadres)
  const [showGroup, setShowGroup] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setMe({ loaded:true, role:'viewer', sucursalId:null }); return; }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        // 🔧 FIX ESLint: no reasignar ni usar antes de definir
        const data = snap.exists() ? snap.data() : {};
        setMe({ loaded:true, role: data.role || 'viewer', sucursalId: data.sucursalId || null });
      } catch {
        setMe({ loaded:true, role:'viewer', sucursalId:null });
      }
    });
    return () => unsub();
  }, []);

  // Cargar sucursales
  useEffect(() => {
    (async () => {
      try {
        const qs = await getDocs(collection(db, 'sucursales'));
        const arr = qs.docs.map(d => {
          const data = d.data() || {};
          const ubicacion = data.ubicacion ?? data['ubicación'] ?? '';
          return {
            id: d.id,
            ...data,
            nombre: data.nombre || d.id,
            ubicacion
          };
        });
        setSucursalesList(arr);
        const m = {};
        arr.forEach(s => { m[s.id] = s.ubicacion || s.nombre; });
        setSucursalesMap(m);
      } catch {
        setSucursalesList([]);
        setSucursalesMap({});
      }
    })();
  }, []);

  // Cargar pagos según filtros
  const currentSucursalValue = isAdmin ? sucursalFiltro : (me.sucursalId || 'all');

  const refetch = async () => {
    if (!me.loaded) return;
    setLoading(true);
    try {
      const col = collection(db, 'pagos');
      const conditions = [];
      if (fechaFiltro) conditions.push(where('fecha','==',fechaFiltro));
      if (currentSucursalValue && currentSucursalValue !== 'all') {
        conditions.push(where('sucursalId','==',currentSucursalValue));
      }
      const qRef = query(col, ...conditions, orderBy('fecha','desc'));
      const snap = await getDocs(qRef);
      const rows = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
      setPagos(rows);
    } catch (e) {
      console.error(e);
      setPagos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me.loaded) return;
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.loaded, fechaFiltro, currentSucursalValue]);

  const uiSucursalesList = useMemo(() => {
    if (!me.loaded) return [];
    return isAdmin ? sucursalesList : sucursalesList.filter(s => s.id === me.sucursalId);
  }, [sucursalesList, me, isAdmin]);

  // Acciones → ir a RegistrarPagos
  const handleVer = (row) => navigate(`/Finanzas/RegistrarPagos?id=${row.id}&mode=view`);
  const handleEditar = async (row) => {
    if (!isAdmin) { await Swal.fire('Solo lectura', 'No tienes permisos para editar.', 'info'); return; }
    navigate(`/Finanzas/RegistrarPagos?id=${row.id}&mode=edit`);
  };

  const handleEliminar = async (id) => {
     if (!isAdmin) {
      await Swal.fire('Solo lectura', 'No tienes permisos para eliminar.', 'info');
      return;
    }
    const confirmar = await Swal.fire({
      title: '¿Eliminar pago?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirmar.isConfirmed) return;

    try {
      // 1) Lee el pago para saber sucursal y caja chica usada
      const pagoRef = doc(db, 'pagos', id);
      const pagoSnap = await getDoc(pagoRef);
      if (!pagoSnap.exists()) {
        await Swal.fire('No encontrado', 'El pago ya no existe.', 'info');
        return;
      }
      const pago = pagoSnap.data() || {};
      const sucursalId = pago.sucursalId;
      const cajaChicaUsada = Number(pago.cajaChicaUsada || 0);

      // 2) Borra y devuelve caja chica en batch
      const batch = writeBatch(db);
      const sucRef = doc(db, 'sucursales', sucursalId);

      batch.delete(pagoRef);
      if (cajaChicaUsada !== 0) {
        batch.update(sucRef, { cajaChica: increment(cajaChicaUsada) });
      }
      await batch.commit();

      // 3) Recalcula KPI mirando pagos/cierres restantes
      await recomputeSucursalKPI(sucursalId);

      await Swal.fire({ icon: 'success', title: 'Pago eliminado', timer: 1200, showConfirmButton: false });

      setPagos(prev => prev.filter(p => p.id !== id));
      await refetch();
    } catch (e) {
      console.error(e);
      Swal.fire('Error', e?.message || 'No se pudo eliminar.', 'error');
    }
  };

  // UI
  if (!me.loaded) {
    return (
      <div className="ventas-shell">
        <header className="ventas-header"><h1>Historial de Pagos </h1></header>
        <div className="empty">Cargando perfil…</div>
      </div>
    );
  }

  return (
    <div className="ventas-shell">
      <header className="ventas-header">
        <h1>Historial de Pagos</h1>

        {/* Exportación agrupada (según filtros actuales) */}
        <div className="ventas-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              // Abrir modal con todos preseleccionados
              setSelectedIds(pagos.map(p => p.id));
              setShowGroup(true);
            }}
            title="Descargar PDF agrupado por los filtros actuales"
          >
            Descargar PDF Agrupado
          </button>
        </div>
      </header>

      {/* Filtros */}
      <div className="ventas-filtros">
         <div className="filtro">
          <label>Fecha:</label>
          <input type="date" value={fechaFiltro} onChange={(e)=> setFechaFiltro(e.target.value)} />
        </div>
        <div className="filtro">
          <label>Sucursal:</label>
          {isAdmin ? (
            <select value={currentSucursalValue} onChange={(e)=> setSucursalFiltro(e.target.value)}>
              <option value="all">Todas</option>
              {sucursalesList.map(s => <option key={s.id} value={s.id}>{s.ubicacion}</option>)}
            </select>
          ) : (
            <select value={currentSucursalValue} disabled>
              {uiSucursalesList.map(s => (
                <option key={s.id} value={s.id}>{s.ubicacion}</option>
              ))}
            </select>
          )}
        </div>
       
      </div>

      {/* Tabla con estilos de Ventas */}
      <div className="ventas-tabla-wrap">
        {loading ? (
          <div className="empty">Cargando…</div>
        ) : pagos.length === 0 ? (
          <div className="empty">Sin registros</div>
        ) : (
          <table className="ventas-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sucursal</th>
                <th>Items</th>
                <th>Total utilizado</th>
                <th>Sobrante p/ mañana</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pagos.map(p => {
                const sucNom = sucursalesMap[p.sucursalId] || p.sucursalId || '—';
                const total = n(p.totalUtilizado ?? sumItems(p.items));
                const sob = n(p.sobranteParaManana);
                const count = (p.items || []).length;

                return (
                  <tr key={p.id}>
                    <td data-label="Fecha">{p.fecha || '—'}</td>
                    <td data-label="Sucursal">{sucNom}</td>
                    <td data-label="Items">{count}</td>
                    <td data-label="Total utilizado" className="text-right">{fmtQ(total)}</td>
                    <td data-label="Sobrante p/ mañana" className="text-right">{fmtQ(sob)}</td>
                    <td data-label="Acciones">
                      <div className="acciones">
                        <button className="btn-min" type="button" onClick={()=>handleVer(p)}>Ver</button>
                        <button
                          className="btn-min"
                          type="button"
                          onClick={()=>handleEditar(p)}
                          disabled={!isAdmin}
                          title={isAdmin ? '' : 'Solo admin'}
                        >
                          Editar
                        </button>
                        <button
                          className="btn-min danger"
                          type="button"
                          onClick={()=>handleEliminar(p.id)}
                          disabled={!isAdmin}
                          title={isAdmin ? '' : 'Solo admin'}
                        >
                          Eliminar
                        </button>
                        {/* Descargar depósitos: solo Descripción y Cantidad */}
                        <button
                          className="btn-min"
                          type="button"
                          title="Descargar depósitos (Descripción y Cantidad)"
                          onClick={() => {
                            const sucNom2 = sucursalesMap[p.sucursalId] || p.sucursalId || '';
                            exportDepositosPdf(p, sucNom2, `Depositos_${sucNom2}_${p.fecha || ''}`);
                          }}
                        >
                          Descargar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Viewer Modal */}
      {viewer.open && viewer.doc && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-hd">
              <h3>Detalle de pagos</h3>
              <button className="rc-btn rc-btn-ghost" onClick={()=>setViewer({open:false, doc:null})}>✕</button>
            </div>
            <div className="modal-bd">
              <div>
                <strong>Fecha:</strong> {viewer.doc.fecha || '—'} · <strong>Sucursal:</strong> {sucursalesMap[viewer.doc.sucursalId] || viewer.doc.sucursalId || '—'}
              </div>
              <table className="ventas-tabla">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th>Ref</th>
                    <th>Categoría</th>
                    <th>Adjunto</th>
                  </tr>
                </thead>
                <tbody>
                  {(viewer.doc.items || []).map((it, idx) => (
                    <tr key={idx}>
                      <td>{it.descripcion || '—'}</td>
                      <td>{fmtQ(it.monto || 0)}</td>
                      <td>{it.ref || '—'}</td>
                      <td>{it.categoria || '—'}</td>
                      <td>
                        {it.fileUrl ? (
                          <a href={it.fileUrl} target="_blank" rel="noreferrer">Abrir</a>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-ft">
              <button className="rc-btn" onClick={()=>setViewer({ open:false, doc:null })}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Editor Modal */}
      {editor.open && editor.doc && (
        <div className="modal-overlay">
          <div className="modal" >
            <div className="modal-hd">
              <h3>Editar pagos</h3>
              <button className="rc-btn rc-btn-ghost" onClick={()=>setEditor({ open:false, doc:null, items:[] })}>✕</button>
            </div>
            <div className="modal-bd">
              <div>
                <strong>Fecha:</strong> {editor.doc.fecha || '—'} · <strong>Sucursal:</strong> {sucursalesMap[editor.doc.sucursalId] || editor.doc.sucursalId || '—'}
              </div>
              <table className="rc-table">
                <thead>
                  <tr>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th>Ref</th>
                    <th>Categoría</th>
                    <th>Adjunto</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {editor.items.length === 0 && (
                    <tr><td colSpan={6} className="rc-empty">Sin items</td></tr>
                  )}
                  {editor.items.map((it, idx) => (
                    <tr key={idx}>
                      <td>
                        <input
                          className="rc-input"
                          value={it.descripcion || ''}
                          onChange={(e)=> {
                            const v = e.target.value;
                            setEditor(prev => {
                              const arr = [...prev.items]; arr[idx] = { ...arr[idx], descripcion: v }; return { ...prev, items: arr };
                            });
                          }}
                          placeholder="Descripción"
                        />
                      </td>
                      <td>
                        <input
                          className="rc-input rc-qty no-spin"
                          type="number" min="0" step="0.01" inputMode="decimal"
                          value={it.monto ?? ''}
                          onChange={(e)=> {
                            const v = e.target.value;
                            setEditor(prev => {
                              const arr = [...prev.items]; arr[idx] = { ...arr[idx], monto: v }; return { ...prev, items: arr };
                            });
                          }}
                          onWheel={(e)=>e.currentTarget.blur()}
                        />
                      </td>
                      <td>
                        <input
                          className="rc-input"
                          value={it.ref || ''}
                          onChange={(e)=> {
                            const v = e.target.value;
                            setEditor(prev => {
                              const arr = [...prev.items]; arr[idx] = { ...arr[idx], ref: v }; return { ...prev, items: arr };
                            });
                          }}
                          placeholder="Referencia"
                        />
                      </td>
                      <td>
                        <input
                          className="rc-input"
                          value={it.categoria || ''}
                          onChange={(e)=> {
                            const v = e.target.value;
                            setEditor(prev => {
                              const arr = [...prev.items]; arr[idx] = { ...arr[idx], categoria: v }; return { ...prev, items: arr };
                            });
                          }}
                          placeholder="Categoría"
                        />
                      </td>
                      <td>
                        {it.fileUrl ? <a href={it.fileUrl} target="_blank" rel="noreferrer">Abrir</a> : '—'}
                      </td>
                      <td>
                        <button
                          className="rc-btn rc-btn-ghost"
                          type="button"
                          onClick={()=>{
                            setEditor(prev => {
                              const arr = prev.items.slice();
                              arr.splice(idx,1);
                              return { ...prev, items: arr };
                            });
                          }}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total: {fmtQ(sumItems(editor.items))}</td>
                  </tr>
                </tfoot>
              </table>
              <div>
                <button
                  className="rc-btn rc-btn-outline"
                  type="button"
                  onClick={()=>setEditor(prev => ({
                    ...prev,
                    items: [...prev.items, { descripcion:'', monto:'', ref:'', categoria:'Varios', fileUrl:'', fileName:'', fileMime:'' }]
                  }))}
                >
                  + Agregar item
                </button>
              </div>
              <div>* La edición de adjuntos se realiza desde <em>Registrar Pagos</em>.</div>
            </div>
            <div className="modal-ft">
              <button className="rc-btn" onClick={()=>setEditor({ open:false, doc:null, items:[] })}>Cancelar</button>
              <button className="rc-btn rc-btn-primary" onClick={async ()=>{
                try {
                  const docId = editor.doc.id;
                  const newItems = editor.items.map(it => ({
                    descripcion: it.descripcion || '',
                    monto: n(it.monto),
                    ref: it.ref || '',
                    categoria: it.categoria || 'Varios',
                    fileUrl: it.fileUrl || '',
                    fileName: it.fileName || '',
                    fileMime: it.fileMime || '',
                  }));
                  const totalUtilizado = sumItems(newItems);
                  const prevTotal = n(editor.doc.totalUtilizado || 0);
                  const prevSobrante = n(editor.doc.sobranteParaManana || 0);
                  const delta = totalUtilizado - prevTotal;
                  const newSobrante = prevSobrante - delta;

                  await updateDoc(doc(db, 'pagos', docId), {
                    items: newItems,
                    totalUtilizado,
                    sobranteParaManana: newSobrante,
                  });
                  await recomputeSucursalKPI(editor.doc.sucursalId);
                  await Swal.fire({ icon:'success', title:'Pago actualizado', timer:1200, showConfirmButton:false });
                  setEditor({ open:false, doc:null, items:[] });
                  refetch();
                } catch (e) {
                  console.error(e);
                  Swal.fire('Error', e.message || 'No se pudo actualizar.', 'error');
                }
              }}>Guardar cambios</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal para descarga agrupada */}
      {isAdmin && (
        <GroupDownloadModal
          visible={showGroup}
          cuadres={pagos}
          sucursalesMap={sucursalesMap}
          selectedIds={selectedIds}
          onToggleAll={() =>
            setSelectedIds(selectedIds.length === pagos.length ? [] : pagos.map(p=>p.id))
          }
          onToggleOne={(id) =>
            setSelectedIds((prev)=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
          }
          onCancel={()=> setShowGroup(false)}
          onDownload={async () => {
            try {
              const docs = pagos.filter(p => selectedIds.includes(p.id));
              if (!docs.length) {
                await Swal.fire('Selecciona al menos un registro','','warning');
                return;
              }
              const nombre = `Pagos_Agrupados_${fechaFiltro || 'todas'}`;
              await exportPagosGroupedPdf(docs, sucursalesMap, nombre);
              setShowGroup(false);
            } catch (e) {
              console.error(e);
              Swal.fire('Error', e?.message || 'No se pudo generar el PDF.', 'error');
            }
          }}
        />
      )}
    </div>
  );
}
