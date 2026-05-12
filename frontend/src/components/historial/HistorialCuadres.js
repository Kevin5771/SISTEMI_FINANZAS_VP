// src/components/ventas/HistorialCuadres.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import {
  doc, getDoc, collection, getDocs,
  query, where, orderBy, limit, writeBatch, updateDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../services/firebase';

import { useCuadres } from '../../hooks/useCuadres';
import { getTodayLocalISO, formatDate } from '../../utils/dates';
import VentasTable from '../ventas/HistorialCuadreTable';
import GroupDownloadModal from '../ventas/GroupDownloadModal';
import { exportSingleCuadrePdf, exportGroupedPdf } from '../../pdf/exportadores';
import '../ventas/Ventas.css';

// ★ Encabezados EXACTOS que quieres ver también en móvil
const HEADERS = [
  'Fecha',
  'Sucursal',
  'Usuario',
  'Efectivo',
  'Tarjeta',
  'Motorista',
  'Total a depositar',
  'Hora',
  'Acciones'
];

// Convierte Timestamp|Date|string a ms
const toMillis = (tsLike) => {
  if (!tsLike) return 0;
  if (typeof tsLike?.toDate === 'function') return tsLike.toDate().getTime(); // Firestore Timestamp
  if (typeof tsLike?.seconds === 'number') return tsLike.seconds * 1000;      // Timestamp-like
  const d = new Date(tsLike);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
};

// Valor base del cuadre (prefiere totales.totalGeneral)
const getKpiFromCuadre = (c) => {
  const raw = c?.totales?.totalGeneral;
  const v = typeof raw === 'number' ? raw : parseFloat(raw || 0);
  return Number.isFinite(v) ? v : 0;
};

// Valor base desde un pago (sobrante o snapshot)
const getKpiFromPago = (p) =>
  Number(p?.sobranteParaManana ?? p?.kpiDepositosAtSave ?? 0);

// Recalcula KPI sucursal usando el doc más reciente entre pagos/cierres
const recomputeSucursalKPI = async (sucursalId) => {
  const candidatos = [];

  try {
    const s1 = await getDocs(query(
      collection(db, 'pagos'),
      where('sucursalId', '==', sucursalId),
      orderBy('createdAt', 'desc'),
      limit(1)
    ));
    s1.forEach(d => {
      const p = d.data() || {};
      candidatos.push({ ts: toMillis(p.createdAt || p.updatedAt || p.fecha), val: getKpiFromPago(p) });
    });
  } catch {}
  try {
    const s2 = await getDocs(query(
      collection(db, 'pagos'),
      where('sucursalId', '==', sucursalId),
      orderBy('fecha', 'desc'),
      limit(1)
    ));
    s2.forEach(d => {
      const p = d.data() || {};
      candidatos.push({ ts: toMillis(p.createdAt || p.updatedAt || p.fecha), val: getKpiFromPago(p) });
    });
  } catch {}

  try {
    const s3 = await getDocs(query(
      collection(db, 'cierres'),
      where('sucursalId', '==', sucursalId),
      orderBy('createdAt', 'desc'),
      limit(1)
    ));
    s3.forEach(d => {
      const c = d.data() || {};
      candidatos.push({ ts: toMillis(c.createdAt || c.updatedAt || c.fecha), val: getKpiFromCuadre(c) });
    });
  } catch {}
  try {
    const s4 = await getDocs(query(
      collection(db, 'cierres'),
      where('sucursalId', '==', sucursalId),
      orderBy('fecha', 'desc'),
      limit(1)
    ));
    s4.forEach(d => {
      const c = d.data() || {};
      candidatos.push({ ts: toMillis(c.createdAt || c.updatedAt || c.fecha), val: getKpiFromCuadre(c) });
    });
  } catch {}

  const best = candidatos.sort((a,b) => (b.ts||0) - (a.ts||0))[0];
  const newKpi = Number(best?.val || 0);
  await updateDoc(doc(db, 'sucursales', sucursalId), { kpiDepositos: newKpi });
};

export default function HistorialCuadres() {
  const navigate = useNavigate();

  // Perfil del usuario (rol + sucursal asignada si viewer)
  const [me, setMe] = useState({ loaded: false, role: 'viewer', sucursalId: null });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe({ loaded: true, role: 'viewer', sucursalId: null });
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setMe({
          loaded: true,
          role: data.role || 'viewer',
          sucursalId: data.sucursalId || null,
        });
      } catch (e) {
        console.error(e);
        setMe({ loaded: true, role: 'viewer', sucursalId: null });
      }
    });
    return () => unsub();
  }, []);

  const isAdmin = me.role === 'admin';
  const canManage = isAdmin;    // Editar / Eliminar
  const canDownload = isAdmin;  // Descargar PDF (individual y agrupado)

  // ⚠️ Si quieres empezar SIN filtro de fecha, usa: useState('')
  const [fechaFiltro, setFechaFiltro] = useState(getTodayLocalISO());
  // const [fechaFiltro, setFechaFiltro] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState('all');

  // Hook de cuadres (para viewer forzamos su sucursal asignada)
  const { cuadres, sucursalesList, sucursalesMap, refetch } = useCuadres({
    fecha: fechaFiltro,
    sucursalId: isAdmin ? sucursalFiltro : (me.sucursalId || 'all'),
  });

  // Lista ordenada: si NO hay fecha, ordena DESC por (createdAt|updatedAt|fecha)
  const cuadresOrdenados = useMemo(() => {
    if (!Array.isArray(cuadres)) return [];
    if (!fechaFiltro) {
      return [...cuadres].sort((a, b) => {
        const ta = toMillis(a.createdAt || a.updatedAt || a.fecha);
        const tb = toMillis(b.createdAt || b.updatedAt || b.fecha);
        return tb - ta; // más reciente primero
      });
    }
    return cuadres;
  }, [cuadres, fechaFiltro]);

  // Sucursales visibles en filtro
  const uiSucursalesList = useMemo(() => {
    if (!me.loaded) return [];
    return isAdmin
      ? sucursalesList
      : sucursalesList.filter((s) => s.id === me.sucursalId);
  }, [sucursalesList, me, isAdmin]);

  // Navegar a RegistrarCierre con modo
  const handleVer = (c) => {
    navigate(`/Finanzas/RegistrarCierre?id=${c.id}&mode=view`);
  };
  const handleEditar = (c) => {
    if (!canManage) {
      Swal.fire('Solo lectura', 'No tienes permisos para editar.', 'info');
      navigate(`/Finanzas/RegistrarCierre?id=${c.id}&mode=view`);
      return;
    }
    navigate(`/Finanzas/RegistrarCierre?id=${c.id}&mode=edit`);
  };

  // Eliminar registro
  const handleEliminar = async (id) => {
    if (!canManage) {
      Swal.fire('Solo lectura', 'No tienes permisos para eliminar.', 'info');
      return;
    }

    const confirmar = await Swal.fire({
      title:'¿Eliminar registro?',
      text:'Esta acción no se puede deshacer.',
      icon:'warning',
      showCancelButton:true
    });
    if (!confirmar.isConfirmed) return;

    try {
      // 1) Lee el cuadre para saber sucursal
      const cierreRef = doc(db, 'cierres', id);
      const cierreSnap = await getDoc(cierreRef);
      if (!cierreSnap.exists()) {
        await Swal.fire('No encontrado', 'El cuadre ya no existe.', 'info');
        return;
      }
      const cierre = cierreSnap.data() || {};
      const sucursalId = cierre.sucursalId;

      // 2) Borra y recalcula KPI
      const batch = writeBatch(db);
      batch.delete(cierreRef);
      await batch.commit();

      await recomputeSucursalKPI(sucursalId);

      await Swal.fire('Eliminado', 'El registro ha sido eliminado.', 'success');
      await refetch();
    } catch (e) {
      console.error(e);
      Swal.fire('Error', e?.message || 'No se pudo eliminar.', 'error');
    }
  };

  // PDFs
  const handleDescargarPDF = (c) => {
    if (!canDownload) {
      Swal.fire('Solo lectura', 'No tienes permisos para descargar.', 'info');
      return;
    }
    exportSingleCuadrePdf(c, sucursalesMap[c.sucursalId] || '—', formatDate);
  };

  // Agrupado
  const [showGroup, setShowGroup] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Esperar perfil
  if (!me.loaded) {
    return (
      <div className="ventas-shell">
        <header className="ventas-header">
            <h1>Historial de Cuadres</h1>
        </header>
        <div className="empty" style={{ background:'#fff', padding:16, borderRadius:12, border:'1px solid #e7e2d9' }}>
          Cargando perfil…
        </div>
      </div>
    );
  }

  const currentSucursalValue = isAdmin ? sucursalFiltro : (me.sucursalId || '');

  return (
    <div className="ventas-shell">
      <header className="ventas-header">
        <h1>Historial de Cuadres</h1>
        <div className="ventas-actions">
          {isAdmin && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setSelectedIds(cuadresOrdenados.map(c => c.id)); // ← usar ordenados
                setShowGroup(true);
              }}
            >
              Descargar PDF Agrupado
            </button>
          )}
        </div>
      </header>

      <div className="ventas-filtros">
        <div className="filtro">
          <label>Fecha:</label>
          <input
            type="date"
            value={fechaFiltro}
            onChange={(e)=> setFechaFiltro(e.target.value)}
            placeholder="(sin filtro)"
          />
        </div>
        <div className="filtro">
          <label>Sucursal:</label>
          {isAdmin ? (
            <select
              value={currentSucursalValue}
              onChange={(e)=> setSucursalFiltro(e.target.value)}
            >
              <option value="all">Todas</option>
              {sucursalesList.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          ) : (
            <select value={currentSucursalValue} disabled>
              {uiSucursalesList.map(s => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Igual que HistorialPagos: si no hay registros, NO renderizar la tabla */}
      <div className="ventas-tabla-wrap">
        {cuadresOrdenados.length === 0 ? (
          <div className="empty">Sin registros</div>
        ) : (
          <VentasTable
            headers={HEADERS}
            cuadres={cuadresOrdenados}
            sucursalesMap={sucursalesMap}
            onVer={handleVer}
            onEditar={handleEditar}
            onDescargar={handleDescargarPDF}
            onEliminar={handleEliminar}
            canManage={canManage}
            canDownload={canDownload}
            isAdmin={isAdmin}
          />
        )}
      </div>

      {/* MODAL AGRUPADO */}
      {isAdmin && (
        <GroupDownloadModal
          visible={showGroup}
          cuadres={cuadresOrdenados} // ← usar ordenados también en el modal
          sucursalesMap={sucursalesMap}
          selectedIds={selectedIds}
          onToggleAll={() =>
            setSelectedIds(
              selectedIds.length === cuadresOrdenados.length ? [] : cuadresOrdenados.map(c => c.id)
            )
          }
          onToggleOne={(id) =>
            setSelectedIds((prev)=> prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id])
          }
          onCancel={()=> setShowGroup(false)}
          onDownload={() => {
            const docs = cuadresOrdenados.filter(c => selectedIds.includes(c.id));
            if (!docs.length) return Swal.fire('Selecciona al menos un registro','','warning');
            const nombre = `Cuadre-${fechaFiltro || 'todas'}`;
            exportGroupedPdf(docs, sucursalesMap, nombre, formatDate);
            setShowGroup(false);
          }}
        />
      )}
    </div>
  );
}
