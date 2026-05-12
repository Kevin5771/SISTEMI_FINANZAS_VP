// src/components/registrar-pagos/RegistrarPagos.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDoc,
  doc, updateDoc, serverTimestamp, increment, onSnapshot
} from 'firebase/firestore';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import './RegistrarPagos.css';

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

import { auth, db } from '../../services/firebase';
import { todayISO as getTodayISO } from '../../utils/dates';
import { recomputeSucursalKPI } from '../../utils/kpi';
import CategoriasModal from '../registrar-cierre/CategoriasModal';
import AttachmentViewerModal from '../registrar-cierre/AttachmentViewerModal';

/* Iconos */
const ICONS = {
  attach: '/img/camara.png',
  view: '/img/img.png',
  money: '/img/billetes-de-banco.png',
  pago: '/img/pago-en-efectivo.png',
  guardar: '/img/manana.png',
};

/* ===========================
   Constantes / helpers módulo
   =========================== */
const INIT_CATS = [
  'Varios', 'Servicios', 'Transporte', 'Publicidad', 'Mantenimiento', 'Ajuste de caja chica'
];

const money = (v) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 })
    .format(Number(v) || 0);

const okTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
const n = (v) => {
  const x = typeof v === 'number' ? v : parseFloat(v || 0);
  return Number.isFinite(x) ? x : 0;
};

/* ===========================
   Componente
   =========================== */
export default function RegistrarPagos() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const editId = sp.get('id') || null;
  const mode = (sp.get('mode') || '').toLowerCase();
  const isViewing = mode === 'view';
  const isEditingExisting = !!editId && mode === 'edit';

  const [me, setMe] = useState({ loaded: false, role: 'viewer', uid: null, username: '' });
  const isAdmin = me.role === 'admin';

  // sucursales
  const [sucursales, setSucursales] = useState([]);
  const [activeSucursalId, setActiveSucursalId] = useState(null);

  // fecha (por día)
  const [fecha, setFecha] = useState(getTodayISO());

  // KPI por sucursal (dinero para depósitos) y caja chica
  const [kpiDepositosBySuc, setKpiDepositosBySuc] = useState({}); // { [id]: number }
  const [cajaChicaBySuc, setCajaChicaBySuc] = useState({});        // { [id]: number }

  // categorías
  const [categorias, setCategorias] = useState(INIT_CATS);
  const [showCatModal, setShowCatModal] = useState(false);

  // pagos por sucursal (estado local)
  // map por sucursal: { items: [...], cajaChicaUsada: number }
  const [pagosMap, setPagosMap] = useState({});

  // visor
  const [viewer, setViewer] = useState({ open:false, url:'', mime:'', name:'', rowIndex:-1 });

  // Para deltas al editar y snapshots
  const [originalDoc, setOriginalDoc] = useState(null);

  /* ===========
     resetForm
     =========== */
  const resetForm = React.useCallback(() => {
    setOriginalDoc(null);
    setFecha(getTodayISO());
    setCategorias(INIT_CATS);

    // Construir mapa inicial con una fila vacía por sucursal visible
    setPagosMap(() => {
      const m = {};
      (sucursales || []).forEach((s) => {
        m[s.id] = {
          items: [{
            descripcion: '',
            monto: '',
            ref: '',
            categoria: (INIT_CATS[0] || 'Varios'),
            fileBlob: null,
            fileUrl: '',
            fileName: '',
            fileMime: '',
            filePreview: '',
            locked: false,
          }],
          cajaChicaUsada: 0,
        };
      });
      return m;
    });

    setShowCatModal(false);
    setViewer({ open: false, url: '', mime: '', name: '' });
    // Nota: NO tocamos activeSucursalId para respetar la selección actual (si ya existe)
  }, [sucursales]);

  // Resetea si entras a /RegistrarPagos (sin id)
  useEffect(() => {
    if (!editId) resetForm();
  }, [editId, mode, resetForm]);

  /* ===========================
     Auth
     =========================== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe({ loaded:true, role:'viewer', uid:null, username:'' });
        return;
      }
      try {
        const us = await getDoc(doc(db, 'usuarios', user.uid));
        const ud = us.exists() ? us.data() : {};
        setMe({ loaded:true, role: (ud.role||'viewer'), uid:user.uid, username: ud.username || '' });
      } catch {
        setMe({ loaded:true, role:'viewer', uid:user.uid, username:'' });
      }
    });
    return () => unsub();
  }, []);

  /* ===========================
     Sucursales + KPI + CajaChica (RT)
     =========================== */
  useEffect(() => {
    if (!me.loaded) return;

    const colRef = collection(db, 'sucursales');
    const unsub = onSnapshot(colRef, (qs) => {
      // 1) Mapeo de sucursales
      const arr = qs.docs.map((snap) => {
        const d = snap.data() || {};
        return {
          id: snap.id,
          nombre: d.nombre || d.name || snap.id,
          ubicacion: d.ubicacion || d.location || '',
          ...d,
        };
      });
      setSucursales(arr);

      if (!editId) {
        setActiveSucursalId(prev => prev || arr[0]?.id || null);
      }

      // 2) Caja chica + KPI desde el doc de sucursal (siempre en vivo)
      const caja = {};
      const kpi  = {};
      arr.forEach(s => {
        caja[s.id] = Number(s?.cajaChica || 0);
        kpi[s.id]  = Number(s?.kpiDepositos || 0);
      });

      // 3) En modo ver, para la sucursal del documento, ancla KPI/caja chica al snapshot guardado
      if (isViewing && originalDoc?.sucursalId) {
        const sid = originalDoc.sucursalId;
        kpi[sid] = Number(originalDoc?.kpiDepositosAtSave ?? originalDoc?.sobranteParaManana ?? 0);
        if (typeof originalDoc?.cajaChicaDisponibleAtSave === 'number') {
          caja[sid] = Number(originalDoc.cajaChicaDisponibleAtSave);
        }
      }

      setKpiDepositosBySuc(kpi);
      setCajaChicaBySuc(caja);
    }, (err) => {
      console.error('onSnapshot sucursales:', err);
    });

    return () => unsub();
  }, [
    me.loaded,
    editId,
    isViewing,
    originalDoc?.sucursalId,
    originalDoc?.kpiDepositosAtSave,
    originalDoc?.sobranteParaManana,
    originalDoc?.cajaChicaDisponibleAtSave
  ]);

  /* ===========================
     Inicializa slots en pagosMap al cargar sucursales
     =========================== */
  useEffect(() => {
    if (!sucursales.length) return;
    setPagosMap((prev) => {
      const copy = { ...prev };
      sucursales.forEach(s => {
        if (!copy[s.id]) {
          copy[s.id] = {
            items: [
              { descripcion:'', monto:'', ref:'', categoria: INIT_CATS[0] || 'Varios',
                fileBlob:null, fileUrl:'', fileName:'', fileMime:'', filePreview:'', locked:false }
            ],
            cajaChicaUsada: 0,
          };
        }
      });
      return copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursales.length]);

  /* ===========================
     Precarga desde HistorialPagos (view/edit)
     =========================== */
  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'pagos', editId));
        if (!snap.exists()) {
          await Swal.fire('No encontrado', 'El registro de pagos no existe.', 'warning');
          return;
        }
        const d = snap.data() || {};
        setOriginalDoc({ id: editId, ...d });

        // Fijar sucursal y fecha del documento
        setActiveSucursalId(d.sucursalId || null);
        setFecha(d.fecha || getTodayISO());

        // Asegurar slot y cargar items del doc
        setPagosMap(prev => {
          const copy = { ...prev };
          if (!copy[d.sucursalId]) {
            copy[d.sucursalId] = { items: [], cajaChicaUsada: 0 };
          }
          copy[d.sucursalId].items = (Array.isArray(d.items) ? d.items : []).map(it => ({
            descripcion: it.descripcion || '',
            monto: n(it.monto),
            ref: it.ref || '',
            categoria: it.categoria || 'Varios',
            fileUrl: it.fileUrl || '',
            fileName: it.fileName || '',
            fileMime: it.fileMime || '',
            fileBlob: null,
            filePreview: '',
            locked: false,
          }));
          copy[d.sucursalId].cajaChicaUsada = n(d.cajaChicaUsada);
          return copy;
        });

        // Para la UI: ancla KPI/caja chica a los snapshots de ESTE doc
        const kpiVal = Number(d?.kpiDepositosAtSave ?? d?.sobranteParaManana ?? 0);
        setKpiDepositosBySuc(prev => ({ ...prev, [d.sucursalId]: kpiVal }));

        if (typeof d?.cajaChicaDisponibleAtSave === 'number') {
          setCajaChicaBySuc(prev => ({ ...prev, [d.sucursalId]: Number(d.cajaChicaDisponibleAtSave) }));
        }
      } catch (e) {
        console.error(e);
        Swal.fire('Error', e?.message || 'No se pudo cargar el registro.', 'error');
      }
    })();
  }, [editId]);

  /* ===========================
     Limpia previews al desmontar / cambiar
     =========================== */
  useEffect(() => {
    return () => {
      Object.values(pagosMap).forEach(suc => {
        (suc?.items || []).forEach(it => {
          if (it?.filePreview) {
            try { URL.revokeObjectURL(it.filePreview); } catch {}
          }
        });
      });
    };
  }, [pagosMap]);

  /* ===========================
     Derivados
     =========================== */
  const active = activeSucursalId;
  const state = pagosMap[active] || { items:[], cajaChicaUsada:0 };
  const readOnly = isViewing;

  const totalUtilizado = useMemo(
    () =>
      (state.items || []).reduce(
        (sum, it) => sum + (parseFloat(it.monto || 0) || 0),
        0
      ),
    [state.items]
  );

  if (!me.loaded) {
    return <div className="rc-tab-empty">Cargando permisos…</div>;
  }
  if (!isAdmin && !isViewing) {
    return <div className="rc-tab-empty">Solo administradores</div>;
  }

  /* ===========================
     Totales / Caja chica
     =========================== */
  // Caja chica **RESTA** al dinero para depositar
  const kpiDepositos = (() => {
    if (!active) return 0;
    const live = Number(kpiDepositosBySuc[active] || 0);
    const isSameSucursal = originalDoc?.sucursalId === active;

    if ((isViewing || isEditingExisting) && isSameSucursal) {
      const snap = Number(
        originalDoc?.kpiDepositosAtSave ?? originalDoc?.sobranteParaManana ?? 0
      );
      return Number.isFinite(snap) ? snap : live;
    }
    return live;
  })();

  const cajaChicaDisponible = active ? Number(cajaChicaBySuc[active] || 0) : 0;

  const sobranteFinal = Math.max(
    0,
    (kpiDepositos - totalUtilizado) - (state.cajaChicaUsada || 0)
  );

  const usarCajaChica = async () => {
    if (readOnly) return;

    const yaUsado = n(state.cajaChicaUsada || 0);
    const maxPermitido = Math.max(0, cajaChicaDisponible - yaUsado);

    if (maxPermitido <= 0) {
      return Swal.fire('Caja chica', 'No hay caja chica disponible', 'info');
    }

    const { value } = await Swal.fire({
      title: 'Usar caja chica',
      input: 'number',
      inputLabel: `Disponible: ${money(cajaChicaDisponible)} · Ya usado aquí: ${money(yaUsado)} · Restante: ${money(maxPermitido)}`,
      inputAttributes: { min: '0', step: '0.01' },
      inputValue: maxPermitido.toFixed(2),
      showCancelButton: true,
      confirmButtonText: 'Aplicar',
      cancelButtonText: 'Cancelar',
      preConfirm: (raw) => {
        const v = parseFloat(raw || 0);
        if (!Number.isFinite(v) || v <= 0) return 'Ingresa un monto válido';
        if (v > maxPermitido) return `No puedes usar más de ${money(maxPermitido)}`;
        return v;
      }
    });

    if (!value || typeof value === 'string') return;

    setPagosMap(prev => {
      const m = { ...prev };
      m[active] = { ...(m[active] || {}), cajaChicaUsada: Number(yaUsado + value) };
      return m;
    });

    await Swal.fire({ icon: 'success', title: 'Caja chica aplicada', timer: 1000, showConfirmButton: false });
  };


  /* ===========================
     Visor adjuntos (¡REINSERTADO!)
     =========================== */
  const openViewer = ({ url, mime, name, rowIndex }) =>
    setViewer({ open: true, url, mime: mime || '', name: name || '', rowIndex });

  const closeViewer = () =>
    setViewer({ open: false, url: '', mime: '', name: '', rowIndex: -1 });

  const handleModalChange = () => {
    if (readOnly) return;
    if (viewer.rowIndex < 0) return;
    handlePickFile(viewer.rowIndex);
  };

  const handleModalRemove = () => {
    if (readOnly) return;
    if (viewer.rowIndex < 0) return;
    clearFile(viewer.rowIndex);
    closeViewer();
  };

  /* ===========================
     Archivos
     =========================== */
  const setRow = (i, field, val) => {
    if (readOnly) return;
    setPagosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])];
      arr[i] = { ...arr[i], [field]: val };
      m[active] = { ...(m[active]||{}), items: arr };
      return m;
    });
  };

  const addRow = () => {
    if (readOnly) return;
    setPagosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])].map(x => ({ ...x, locked:true }));
      arr.push({
        descripcion:'', monto:'', ref:'', categoria: INIT_CATS[0] || 'Varios',
        fileBlob:null, filePreview:'', fileUrl:'', fileName:'', fileMime:'', locked:false
      });
      m[active] = { ...(m[active]||{}), items: arr };
      return m;
    });
  };

  const removeRow = (i) => {
    if (readOnly) return;
    setPagosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])];
      arr.splice(i,1);
      m[active] = { ...(m[active]||{}), items: arr };
      return m;
    });
  };

  const handlePickFile = (i) => {
    if (readOnly) return;
    const el = document.getElementById(`pago-file-${active}-${i}`);
    if (el) el.click();
  };

  const handleFileChange = (i, e) => {
    if (readOnly) return;
    const file = e.target?.files?.[0];
    if (!file) return;

    if (!okTypes.includes(file.type)) {
      Swal.fire('Formato no permitido', 'Solo PNG, JPG o PDF', 'warning');
      e.target.value = '';
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      Swal.fire('Archivo muy grande', 'Máximo 8MB', 'warning');
      e.target.value = '';
      return;
    }

    try {
      const prev = (pagosMap[active]?.items || [])[i]?.filePreview;
      if (prev) URL.revokeObjectURL(prev);
    } catch {}

    const preview = URL.createObjectURL(file);

    setRow(i, 'fileBlob', file);
    setRow(i, 'filePreview', preview);
    setRow(i, 'fileName', file.name);
    setRow(i, 'fileMime', file.type);
    setRow(i, 'fileUrl', '');
  };

  const clearFile = (i) => {
    const item = (pagosMap[active]?.items || [])[i];
    if (item?.filePreview) {
      try { URL.revokeObjectURL(item.filePreview); } catch {}
    }
    setRow(i, 'fileBlob', null);
    setRow(i, 'filePreview', '');
    setRow(i, 'fileMime', '');
    setRow(i, 'fileName', '');
    setRow(i, 'fileUrl', '');
  };

  /* ===========================
     Guardar
     =========================== */
  const onSave = async () => {
    try {
      if (!active) return Swal.fire('Sucursal', 'Selecciona una sucursal', 'warning');
      if (!fecha) return Swal.fire('Fecha', 'Selecciona una fecha', 'warning');

      const items = state.items || [];
      if (!items.length) return Swal.fire('Pagos', 'Agrega al menos un pago', 'warning');

      const storage = getStorage();
      const folder = `pagos/${active}/${fecha}`;

      const ready = await Promise.all(items.map(async (r, i) => {
        const { fileBlob, filePreview, ...rest } = r;
        if (fileBlob) {
          const safe = (r.fileName || fileBlob.name || `pago_${i}`).replace(/[^\w.-]+/g, '_');
          const path = `${folder}/${Date.now()}_${i}_${safe}`;
          const fileRef = sRef(storage, path);
          await uploadBytes(fileRef, fileBlob, {
            contentType: r.fileMime || fileBlob.type || 'application/octet-stream',
          });
          const url = await getDownloadURL(fileRef);
          return { ...rest, fileUrl: url, fileName: safe, fileMime: (r.fileMime || fileBlob.type || '') };
        }
        return { ...rest };
      }));

      const totalUtilizadoCalc = ready.reduce((s, it) => s + n(it.monto), 0);
      const cajaChicaUsada = n(state.cajaChicaUsada || 0);

      // Base que ves en pantalla (anclada al snapshot si estás editando ese doc)
      const kpiBase = kpiDepositos;

      // Caja chica **RESTA** al sobrante (dinero a depositar)
      const sobranteParaManana = Math.max(
        0,
        (kpiBase - totalUtilizadoCalc) - cajaChicaUsada
      );

      const actor = { uid: me.uid, username: me.username };

      // snapshots visibles en ver/editar
      const kpiSnapshot = kpiBase;
      const cajaChicaSnapshot = active ? Number(cajaChicaBySuc[active] || 0) : 0;

      if (isEditingExisting) {
        const prevCaja = n(originalDoc?.cajaChicaUsada);
        const deltaCajaChica = -(cajaChicaUsada - prevCaja);

        await updateDoc(doc(db, 'pagos', editId), {
          fecha,
          sucursalId: active,
          items: ready,
          totalUtilizado: totalUtilizadoCalc,
          cajaChicaUsada,
          sobranteParaManana,
          // snapshots
          kpiDepositosAtSave: kpiSnapshot,
          cajaChicaDisponibleAtSave: cajaChicaSnapshot,
          updatedAt: serverTimestamp(),
          updatedBy: actor,
        });

        if (deltaCajaChica !== 0) {
          await updateDoc(doc(db, 'sucursales', active), { cajaChica: increment(deltaCajaChica) });
          setCajaChicaBySuc(prev => ({ ...prev, [active]: n(prev[active]) + deltaCajaChica }));
        }

        // Recalcular KPI según documento más reciente (pago/cierre)
        await recomputeSucursalKPI(active);

        await Swal.fire({ icon: 'success', title: 'Actualizado', text: 'Los pagos se guardaron correctamente.' });
        navigate('/Finanzas/HistorialPagos');
      } else {
        await addDoc(collection(db, 'pagos'), {
          fecha,
          sucursalId: active,
          items: ready,
          totalUtilizado: totalUtilizadoCalc,
          cajaChicaUsada,
          sobranteParaManana,
          // snapshots
          kpiDepositosAtSave: kpiSnapshot,
          cajaChicaDisponibleAtSave: cajaChicaSnapshot,
          createdBy: actor,
          createdAt: serverTimestamp(),
        });

        const deltaCajaChica = -cajaChicaUsada;
        if (deltaCajaChica !== 0) {
          await updateDoc(doc(db, 'sucursales', active), { cajaChica: increment(deltaCajaChica) });
        }

        // Recalcular KPI (el nuevo pago normalmente será el más reciente)
        await recomputeSucursalKPI(active);

        setCajaChicaBySuc(prev => ({ ...prev, [active]: Number(prev[active] || 0) + deltaCajaChica }));

        await Swal.fire({ icon: 'success', title: 'Pagos guardados', timer: 1200, showConfirmButton: false });
        navigate('/Finanzas/HistorialPagos');
      }
    } catch (e) {
      console.error(e);
      Swal.fire('Error', e.message || 'No se pudo guardar.', 'error');
    }
  };

  /* ===========================
     Render
     =========================== */
  const headerSuffix = isEditingExisting ? '(editando)' : isViewing ? '(viendo)' : '';

  return (
    <div className="rc-shell registrar-pagos">
      <div className="rc-header">
        <div className="rc-header-left">
          <h1>
            Registrar Pagos {headerSuffix && <span>{headerSuffix}</span>}
          </h1>
          <div className="rc-date" style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr', alignItems:'end' }}>
            {/* FECHA */}
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e)=>setFecha(e.target.value)}
                disabled={isViewing}
                readOnly={isViewing}
              />
            </div>

            {/* Acciones */}
            <div className="rc-tabs-actions" style={{ gridColumn:'1 / -1', display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
              {!isViewing && (
                <button type="button" className="rc-btn rc-btn-accent" onClick={onSave}>
                  {isEditingExisting ? 'Actualizar pagos' : 'Guardar pagos'}
                </button>
              )}
            </div>

            {/* KPI compacto */}
            <section className="rc-card" style={{ marginTop: 8 }}>
              <div className="rc-card-bd" style={{ display:'flex', gap:18, alignItems:'center', flexWrap:'wrap' }}>
                <div>
                  <div className="kpi-title">
                    <img src={ICONS.pago} alt="Dinero" width={35} height={35} style={{ display: 'inline-block', objectFit: 'contain' }} />
                    Dinero para depósitos</div>
                  <div className="kpi-value">{money(kpiDepositos)}</div>
                </div>
                <div>
                  <div className="kpi-title">
                    <img src={ICONS.money} alt="Dinero" width={35} height={35} style={{ display: 'inline-block', objectFit: 'contain' }} />
                    Caja chica disponible</div>
                  <div className="kpi-value">{money(cajaChicaDisponible)}</div>
                </div>
                <div>
                  <div className="kpi-title">
                    <img src={ICONS.guardar} alt="Dinero" width={35} height={35} style={{ display: 'inline-block', objectFit: 'contain' }} />
                    Sobrante para mañana</div>
                  <div className="kpi-value" style={{ color: sobranteFinal > 0 ? 'var(--accent)' : 'var(--dark)' }}>
                    {money(sobranteFinal)}
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>
      </div>

      {/* PILS de sucursal (muestran UBICACIÓN) */}
      <div className="rc-tabs-row rc-tabs-attached">
        <div
          className="rc-tabs rc-tabs-browser"
          role="tablist"
          aria-label="Sucursales"
          style={{ flexWrap:'nowrap' }}
        >
          {sucursales.map((s) => (
            <button
              key={s.id}
              className={`rc-tab ${active === s.id ? 'active' : ''}`}
              onClick={()=>!isViewing && setActiveSucursalId(s.id)}
              type="button"
              role="tab"
              aria-selected={active === s.id}
              disabled={isViewing}
              title={isViewing ? 'Vista de solo lectura' : ''}
              style={{ flex:'0 0 auto' }}
            >
              {s?.ubicacion || s?.nombre || s?.id}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA */}
      <section className="rc-card">
        <div className="rc-card-hd"><h3>Asignar pagos</h3></div>

        <table className="rc-table rc-gastos-table rc-pagos-table">
          <colgroup>
            <col style={{width:'200px'}}/>{/* Categoría */}
            <col style={{width:'240px'}}/>{/* Descripción */}
            <col style={{width:'200px'}}/>{/* Monto */}
            <col style={{width:'200px'}}/>{/* Ref */}
            <col style={{width:'140px'}}/>{/* Img */}
            <col style={{width:'120px'}}/>{/* Acciones */}
          </colgroup>

          <thead>
            <tr>
              <th style={{textAlign:'center'}}>Categoría</th>
              <th style={{textAlign:'center'}}>Descripción</th>
              <th style={{textAlign:'center'}}>Cantidad</th>
              <th style={{textAlign:'center'}}>No. de ref</th>
              <th style={{textAlign:'center'}}>Comprobante</th>
              <th style={{textAlign:'center'}}>Acciones</th>
            </tr>
          </thead>

          <tbody>
            {(!state.items || !state.items.length) && (
              <tr><td colSpan={6} className="rc-empty">Sin pagos</td></tr>
            )}

            {state.items?.map((r, i) => {
              return (
                <tr key={`${active}-${i}`}>
                  {/* Categoría */}
                  <td data-label="Categoría">
                    <select
                      className="rc-input rc-select"
                      value={r.categoria}
                      onChange={(e)=>setRow(i,'categoria',e.target.value)}
                      disabled={isViewing}
                    >
                      {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </td>

                  {/* Descripción */}
                  <td data-label="Descripción">
                    <input
                      className="rc-input rc-desc"
                      placeholder="Descripción"
                      value={r.descripcion}
                      onChange={(e)=>setRow(i,'descripcion',e.target.value)}
                      disabled={isViewing}
                      readOnly={isViewing}
                    />
                  </td>

                  {/* Monto */}
                  <td data-label="Cantidad">
                    <input
                      className="rc-input rc-qty no-spin"
                      type="number" min="0" step="0.01" inputMode="decimal"
                      value={r.monto ?? ''}
                      onChange={(e)=>setRow(i,'monto',e.target.value)}
                      onWheel={(e)=>e.currentTarget.blur()}
                      disabled={isViewing}
                      readOnly={isViewing}
                    />
                  </td>

                  {/* Ref */}
                  <td data-label="Ref">
                    <input
                      className="rc-input"
                      placeholder="Referencia"
                      value={r.ref || ''}
                      onChange={(e)=>setRow(i,'ref',e.target.value)}
                      disabled={isViewing}
                      readOnly={isViewing}
                    />
                  </td>

                  {/* Comprobante (Img/PDF) */}
                  <td data-label="Comprobante" className="img-cell">
                    <div className="rc-proof-cell">
                      {(() => {
                        const viewUrl = r.filePreview || r.fileUrl || '';
                        const hasFile = !!viewUrl;
                        return hasFile ? (
                          <button
                            type="button"
                            className="rc-iconbtn"
                            onClick={() =>
                              openViewer({
                                url: viewUrl,
                                mime: r.fileMime || '',
                                name: r.fileName || '',
                                rowIndex: i,
                              })
                            }
                            title="Abrir comprobante"
                          >
                            <img src={ICONS.view} alt="Ver" width={25} height={25} />
                          </button>
                        ) : (
                          !isViewing && (
                            <button
                              type="button"
                              className="rc-iconbtn"
                              onClick={() => handlePickFile(i)}
                              title="Adjuntar comprobante"
                            >
                              <img src={ICONS.attach} alt="Adjuntar" width={25} height={25} />
                            </button>
                          )
                        );
                      })()}

                      {/* input oculto por fila */}
                      <input
                        id={`pago-file-${active}-${i}`}
                        type="file"
                        accept="image/png,image/jpeg,image/jpg,image/webp,application/pdf"
                        onChange={(e) => handleFileChange(i, e)}
                        style={{ display: 'none' }}
                        disabled={isViewing}
                      />
                    </div>
                  </td>

                  {/* Acciones */}
                  <td data-label="Acciones" style={{textAlign:'center'}}>
                    <button className="rc-btn rc-btn-ghost" type="button" onClick={()=>removeRow(i)} disabled={isViewing}>✕</button>
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <td></td>
              <td style={{ fontWeight:800, textAlign:'right', color:'var(--dark)' }}>
                Total utilizado
              </td>
              <td style={{ fontWeight:800, textAlign:'right', color:'var(--dark)' }}>
                {money(totalUtilizado)}
              </td>
              <td colSpan={4}></td>
            </tr>

            <tr>
              <td></td>
              <td style={{ fontWeight:800, textAlign:'right', color:'var(--dark)' }}>
                Sobrante para mañana
              </td>
              <td style={{ fontWeight:800, textAlign:'right', color: sobranteFinal >= 0 ? 'var(--accent)' : 'var(--dark)' }}>
                {money(sobranteFinal)}
              </td>
              <td colSpan={4} style={{ textAlign:'right' }}>
                {!isViewing && (
                  <button className="rc-btn rc-btn-primary" type="button" onClick={usarCajaChica}>
                    Usar caja chica
                  </button>
                )}
                {state.cajaChicaUsada > 0 && (
                  <span style={{ marginLeft:12, fontWeight:700, color:'var(--dark)' }}>
                    Se tomó de caja chica: {money(state.cajaChicaUsada)}
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>

        {!isViewing && (
          <div className="rc-gastos-actions" style={{ marginTop:10 }}>
            <button type="button" className="rc-btn rc-btn-outline" onClick={addRow}>+ Agregar pago</button>
          </div>
        )}
      </section>

      {/* Modales */}
      <CategoriasModal
        open={showCatModal}
        onClose={()=>setShowCatModal(false)}
        categorias={categorias}
        onChangeCategorias={(nextCats, oldName, newName) => {
          if (isViewing) return;
          setCategorias(nextCats);
          if (oldName) {
            setPagosMap(prev => {
              const copy = { ...prev };
              Object.keys(copy).forEach(k => {
                copy[k].items = copy[k].items.map(it => (
                  it.categoria === oldName ? { ...it, categoria: (newName || nextCats[0] || 'Varios') } : it
                ));
              });
              return copy;
            });
          }
        }}
      />

      <AttachmentViewerModal
        open={viewer.open}
        url={viewer.url}
        mime={viewer.mime}
        name={viewer.name}
        onClose={closeViewer}
        onChangeFile={handleModalChange}
        onRemoveFile={handleModalRemove}
      />
    </div>
  );
}
