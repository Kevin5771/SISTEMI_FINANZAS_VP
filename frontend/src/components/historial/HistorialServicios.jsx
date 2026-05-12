import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, doc, getDoc, getDocs,
  query, where, updateDoc, orderBy, deleteDoc
} from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './HistorialPagos.css';

import { auth, db } from '../../services/firebase';
import { getTodayLocalISO as getTodayLocalISO_ventas } from '../../utils/dates';

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

export default function HistorialServicios() {
  const navigate = useNavigate();

  const [me, setMe] = useState({ loaded:false, role:'viewer', sucursalId:null });
  const isAdmin = me.role === 'admin';

  const [fechaFiltro, setFechaFiltro] = useState(getTodayLocalISO().slice(0, 7));
  const [sucursalFiltro, setSucursalFiltro] = useState('all');

  const [sucursalesList, setSucursalesList] = useState([]);
  const [sucursalesMap, setSucursalesMap] = useState({});

  const [servicios, setServicios] = useState([]);
  const [loading, setLoading] = useState(true);

  const [viewer, setViewer] = useState({ open:false, doc:null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setMe({ loaded:true, role:'viewer', sucursalId:null }); return; }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setMe({ loaded:true, role: data.role || 'viewer', sucursalId: data.sucursalId || null });
      } catch {
        setMe({ loaded:true, role:'viewer', sucursalId:null });
      }
    });
    return () => unsub();
  }, []);

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

  const currentSucursalValue = isAdmin ? sucursalFiltro : (me.sucursalId || 'all');

  const refetch = async () => {
    if (!me.loaded) return;
    setLoading(true);
    try {
      const col = collection(db, 'servicios');
      const conditions = [];
      if (currentSucursalValue && currentSucursalValue !== 'all') {
        conditions.push(where('sucursalId','==',currentSucursalValue));
      }
      const qRef = query(col, ...conditions, orderBy('fecha','desc'));
      const snap = await getDocs(qRef);
      let rows = snap.docs.map(d => ({ id:d.id, ...(d.data()||{}) }));
      
      if (fechaFiltro) {
        rows = rows.filter(r => r.fecha && r.fecha.startsWith(fechaFiltro));
      }
      
      setServicios(rows);
    } catch (e) {
      console.error(e);
      setServicios([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!me.loaded) return;
    refetch();
  }, [me.loaded, fechaFiltro, currentSucursalValue]);

  const uiSucursalesList = useMemo(() => {
    if (!me.loaded) return [];
    return isAdmin ? sucursalesList : sucursalesList.filter(s => s.id === me.sucursalId);
  }, [sucursalesList, me, isAdmin]);

  const handleVer = (row) => navigate(`/Finanzas/RegistrarServicios?id=${row.id}&mode=view`);
  const handleEditar = async (row) => {
    if (!isAdmin) { await Swal.fire('Solo lectura', 'No tienes permisos para editar.', 'info'); return; }
    navigate(`/Finanzas/RegistrarServicios?id=${row.id}&mode=edit`);
  };

  const handleEliminar = async (id) => {
     if (!isAdmin) {
      await Swal.fire('Solo lectura', 'No tienes permisos para eliminar.', 'info');
      return;
    }
    const confirmar = await Swal.fire({
      title: '¿Eliminar servicio?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirmar.isConfirmed) return;

    try {
      await deleteDoc(doc(db, 'servicios', id));
      await Swal.fire({ icon: 'success', title: 'Servicio eliminado', timer: 1200, showConfirmButton: false });
      setServicios(prev => prev.filter(p => p.id !== id));
    } catch (e) {
      console.error(e);
      Swal.fire('Error', e?.message || 'No se pudo eliminar.', 'error');
    }
  };

  if (!me.loaded) {
    return (
      <div className="ventas-shell">
        <header className="ventas-header"><h1>Historial de Servicios </h1></header>
        <div className="empty">Cargando perfil…</div>
      </div>
    );
  }

  return (
    <div className="ventas-shell">
      <header className="ventas-header">
        <h1>Historial de Servicios</h1>
        <div className="ventas-actions">
            <button
              className="btn btn-primary"
              style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => navigate('/Finanzas/RegistrarServicios')}
            >
              ➕ Registrar Nuevo Servicio
            </button>
        </div>
      </header>

      <div className="ventas-filtros">
         <div className="filtro">
          <label>Mes:</label>
          <input type="month" value={fechaFiltro} onChange={(e)=> setFechaFiltro(e.target.value)} />
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

      <div className="ventas-tabla-wrap">
        {loading ? (
          <div className="empty">Cargando…</div>
        ) : servicios.length === 0 ? (
          <div className="empty">Sin registros</div>
        ) : (
          <table className="ventas-tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Sucursal</th>
                <th>Items</th>
                <th>Total Gastado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map(p => {
                const sucNom = sucursalesMap[p.sucursalId] || p.sucursalId || '—';
                const total = n(p.totalUtilizado ?? sumItems(p.items));
                const count = (p.items || []).length;

                return (
                  <tr key={p.id}>
                    <td data-label="Fecha">{p.fecha || '—'}</td>
                    <td data-label="Sucursal">{sucNom}</td>
                    <td data-label="Items">{count}</td>
                    <td data-label="Total Gastado" className="text-right">{fmtQ(total)}</td>
                    <td data-label="Acciones">
                      <div className="acciones">
                        <button className="btn-min" type="button" onClick={()=>handleVer(p)}>Ver</button>
                        <button className="btn-min" type="button" onClick={()=>handleEditar(p)} disabled={!isAdmin} title={isAdmin ? '' : 'Solo admin'}>Editar</button>
                        <button className="btn-min danger" type="button" onClick={()=>handleEliminar(p.id)} disabled={!isAdmin} title={isAdmin ? '' : 'Solo admin'}>Eliminar</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {viewer.open && viewer.doc && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-hd">
              <h3>Detalle de servicios</h3>
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
    </div>
  );
}
