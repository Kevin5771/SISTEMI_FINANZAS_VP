import React, { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection, addDoc, getDoc,
  doc, updateDoc, serverTimestamp, onSnapshot
} from 'firebase/firestore';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import '../registrar-pagos/RegistrarPagos.css';

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

import { auth, db } from '../../services/firebase';
import { todayISO as getTodayISO } from '../../utils/dates';

const ICONS = {
  view: '/img/img.png',
  money: '/img/billetes-de-banco.png',
  guardar: '/img/manana.png',
};

const INIT_CATS = [
  'Agua', 'Luz', 'Internet/Teléfono', 'Alquiler', 'Limpieza', 'Mantenimiento', 'Otros'
];

const money = (v) =>
  new Intl.NumberFormat('es-GT', { style: 'currency', currency: 'GTQ', maximumFractionDigits: 2 })
    .format(Number(v) || 0);

const okTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'];
const n = (v) => {
  const x = typeof v === 'number' ? v : parseFloat(v || 0);
  return Number.isFinite(x) ? x : 0;
};

export default function RegistrarServicios() {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const editId = sp.get('id') || null;
  const mode = (sp.get('mode') || '').toLowerCase();
  const isViewing = mode === 'view';
  const isEditingExisting = !!editId && mode === 'edit';

  const [me, setMe] = useState({ loaded: false, role: 'viewer', uid: null, username: '' });
  const isAdmin = me.role === 'admin';

  const [sucursales, setSucursales] = useState([]);
  const [activeSucursalId, setActiveSucursalId] = useState(null);
  const [fecha, setFecha] = useState(getTodayISO());
  const [categorias] = useState(INIT_CATS);
  const [serviciosMap, setServiciosMap] = useState({});
  const [viewer, setViewer] = useState({ open:false, url:'', mime:'', name:'', rowIndex:-1 });
  const [originalDoc, setOriginalDoc] = useState(null);

  const resetForm = React.useCallback(() => {
    setOriginalDoc(null);
    setFecha(getTodayISO());
    setServiciosMap(() => {
      const m = {};
      (sucursales || []).forEach((s) => {
        m[s.id] = {
          items: [{
            descripcion: '',
            monto: '',
            ref: '',
            categoria: (INIT_CATS[0] || 'Agua'),
            fileBlob: null,
            fileUrl: '',
            fileName: '',
            fileMime: '',
            filePreview: '',
            locked: false,
          }],
        };
      });
      return m;
    });
    setViewer({ open: false, url: '', mime: '', name: '' });
  }, [sucursales]);

  useEffect(() => {
    if (!editId) resetForm();
  }, [editId, mode, resetForm]);

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

  useEffect(() => {
    if (!me.loaded) return;
    const colRef = collection(db, 'sucursales');
    const unsub = onSnapshot(colRef, (qs) => {
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
      if (!editId) setActiveSucursalId(prev => prev || arr[0]?.id || null);
    });
    return () => unsub();
  }, [me.loaded, editId]);

  useEffect(() => {
    if (!sucursales.length) return;
    setServiciosMap((prev) => {
      const copy = { ...prev };
      sucursales.forEach(s => {
        if (!copy[s.id]) {
          copy[s.id] = {
            items: [
              { descripcion:'', monto:'', ref:'', categoria: INIT_CATS[0] || 'Agua',
                fileBlob:null, fileUrl:'', fileName:'', fileMime:'', filePreview:'', locked:false }
            ]
          };
        }
      });
      return copy;
    });
  }, [sucursales.length]);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'servicios', editId));
        if (!snap.exists()) {
          await Swal.fire('No encontrado', 'El registro de servicios no existe.', 'warning');
          return;
        }
        const d = snap.data() || {};
        setOriginalDoc({ id: editId, ...d });
        setActiveSucursalId(d.sucursalId || null);
        setFecha(d.fecha || getTodayISO());
        setServiciosMap(prev => {
          const copy = { ...prev };
          if (!copy[d.sucursalId]) copy[d.sucursalId] = { items: [] };
          copy[d.sucursalId].items = (Array.isArray(d.items) ? d.items : []).map(it => ({
            descripcion: it.descripcion || '',
            monto: n(it.monto),
            ref: it.ref || '',
            categoria: it.categoria || 'Agua',
            fileUrl: it.fileUrl || '',
            fileName: it.fileName || '',
            fileMime: it.fileMime || '',
            fileBlob: null,
            filePreview: '',
            locked: false,
          }));
          return copy;
        });
      } catch (e) {
        Swal.fire('Error', e?.message || 'No se pudo cargar el registro.', 'error');
      }
    })();
  }, [editId]);

  useEffect(() => {
    return () => {
      Object.values(serviciosMap).forEach(suc => {
        (suc?.items || []).forEach(it => {
          if (it?.filePreview) {
            try { URL.revokeObjectURL(it.filePreview); } catch {}
          }
        });
      });
    };
  }, [serviciosMap]);

  const active = activeSucursalId;
  const state = serviciosMap[active] || { items:[] };
  const readOnly = isViewing;

  const totalUtilizado = useMemo(
    () => (state.items || []).reduce((sum, it) => sum + (parseFloat(it.monto || 0) || 0), 0),
    [state.items]
  );

  if (!me.loaded) return <div className="rc-tab-empty">Cargando permisos…</div>;

  const openViewer = ({ url, mime, name, rowIndex }) => setViewer({ open: true, url, mime: mime || '', name: name || '', rowIndex });
  const closeViewer = () => setViewer({ open: false, url: '', mime: '', name: '', rowIndex: -1 });

  const setRow = (i, field, val) => {
    if (readOnly) return;
    setServiciosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])];
      arr[i] = { ...arr[i], [field]: val };
      m[active] = { items: arr };
      return m;
    });
  };

  const addRow = () => {
    if (readOnly) return;
    setServiciosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])].map(x => ({ ...x, locked:true }));
      arr.push({
        descripcion:'', monto:'', ref:'', categoria: INIT_CATS[0] || 'Agua',
        fileBlob:null, filePreview:'', fileUrl:'', fileName:'', fileMime:'', locked:false
      });
      m[active] = { items: arr };
      return m;
    });
  };

  const removeRow = (i) => {
    if (readOnly) return;
    setServiciosMap(prev => {
      const m = { ...prev };
      const arr = [...(m[active]?.items || [])];
      arr.splice(i,1);
      m[active] = { items: arr };
      return m;
    });
  };

  const handlePickFile = (i) => {
    if (readOnly) return;
    const el = document.getElementById(`servicio-file-${active}-${i}`);
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
    const preview = URL.createObjectURL(file);
    setRow(i, 'fileBlob', file);
    setRow(i, 'filePreview', preview);
    setRow(i, 'fileName', file.name);
    setRow(i, 'fileMime', file.type);
    setRow(i, 'fileUrl', '');
  };

  const clearFile = (i) => {
    setRow(i, 'fileBlob', null);
    setRow(i, 'filePreview', '');
    setRow(i, 'fileMime', '');
    setRow(i, 'fileName', '');
    setRow(i, 'fileUrl', '');
  };

  const onSave = async () => {
    try {
      if (!active) return Swal.fire('Sucursal', 'Selecciona una sucursal', 'warning');
      if (!fecha) return Swal.fire('Fecha', 'Selecciona una fecha', 'warning');

      const items = state.items || [];
      if (!items.length) return Swal.fire('Servicios', 'Agrega al menos un servicio', 'warning');

      const storage = getStorage();
      const folder = `servicios/${active}/${fecha}`;

      const ready = await Promise.all(items.map(async (r, i) => {
        const { fileBlob, filePreview, ...rest } = r;
        if (fileBlob) {
          const safe = (r.fileName || fileBlob.name || `servicio_${i}`).replace(/[^\w.-]+/g, '_');
          const path = `${folder}/${Date.now()}_${i}_${safe}`;
          const fileRef = sRef(storage, path);
          await uploadBytes(fileRef, fileBlob, { contentType: r.fileMime || fileBlob.type || 'application/octet-stream' });
          const url = await getDownloadURL(fileRef);
          return { ...rest, fileUrl: url, fileName: safe, fileMime: (r.fileMime || fileBlob.type || '') };
        }
        return { ...rest };
      }));

      const totalUtilizadoCalc = ready.reduce((s, it) => s + n(it.monto), 0);
      const actor = { uid: me.uid, username: me.username };

      if (isEditingExisting) {
        await updateDoc(doc(db, 'servicios', editId), {
          fecha, sucursalId: active, items: ready, totalUtilizado: totalUtilizadoCalc,
          updatedAt: serverTimestamp(), updatedBy: actor,
        });
        await Swal.fire({ icon: 'success', title: 'Actualizado', text: 'Los servicios se guardaron correctamente.' });
        navigate('/Finanzas/HistorialServicios');
      } else {
        await addDoc(collection(db, 'servicios'), {
          fecha, sucursalId: active, items: ready, totalUtilizado: totalUtilizadoCalc,
          createdBy: actor, createdAt: serverTimestamp(),
        });
        await Swal.fire({ icon: 'success', title: 'Servicios guardados', timer: 1200, showConfirmButton: false });
        navigate('/Finanzas/HistorialServicios');
      }
    } catch (e) {
      Swal.fire('Error', e.message || 'No se pudo guardar.', 'error');
    }
  };

  const headerSuffix = isEditingExisting ? '(editando)' : isViewing ? '(viendo)' : '';

  return (
    <div className="rc-shell registrar-pagos">
      <div className="rc-header">
        <div className="rc-header-left">
          <h1>Registrar Servicios {headerSuffix && <span>{headerSuffix}</span>}</h1>
          <div className="rc-date" style={{ display:'grid', gap:8, gridTemplateColumns:'1fr 1fr', alignItems:'end' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              <label>Fecha</label>
              <input type="date" value={fecha} onChange={(e)=>setFecha(e.target.value)} disabled={isViewing} readOnly={isViewing} />
            </div>
            <div className="rc-tabs-actions" style={{ gridColumn:'1 / -1', display:'flex', gap:8, flexWrap:'wrap', marginTop:8 }}>
              {!isViewing && (
                <button type="button" className="rc-btn rc-btn-accent" onClick={onSave}>
                  {isEditingExisting ? 'Actualizar servicios' : 'Guardar servicios'}
                </button>
              )}
            </div>
            <section className="rc-card" style={{ marginTop: 8 }}>
              <div className="rc-card-bd" style={{ display:'flex', gap:18, alignItems:'center', flexWrap:'wrap' }}>
                <div>
                  <div className="kpi-title">
                    <img src={ICONS.money} alt="Dinero" width={35} height={35} style={{ display: 'inline-block', objectFit: 'contain' }} />
                    Total Gastado en Servicios
                  </div>
                  <div className="kpi-value">{money(totalUtilizado)}</div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      <div className="rc-tabs-row rc-tabs-attached">
        <div className="rc-tabs rc-tabs-browser" role="tablist" style={{ flexWrap:'nowrap' }}>
          {sucursales.map((s) => (
            <button
              key={s.id} className={`rc-tab ${active === s.id ? 'active' : ''}`}
              onClick={()=>!isViewing && setActiveSucursalId(s.id)} type="button" role="tab" aria-selected={active === s.id} disabled={isViewing}
              style={{ flex:'0 0 auto' }}
            >
              {s?.ubicacion || s?.nombre || s?.id}
            </button>
          ))}
        </div>
      </div>

      <section className="rc-card">
        <div className="rc-card-hd"><h3>Asignar pagos de servicios</h3></div>
        <table className="rc-table rc-gastos-table rc-pagos-table">
          <colgroup>
            <col style={{width:'200px'}}/><col style={{width:'240px'}}/><col style={{width:'200px'}}/><col style={{width:'200px'}}/><col style={{width:'140px'}}/><col style={{width:'120px'}}/>
          </colgroup>
          <thead>
            <tr>
              <th style={{textAlign:'center'}}>Categoría</th>
              <th style={{textAlign:'center'}}>Descripción</th>
              <th style={{textAlign:'center'}}>Monto</th>
              <th style={{textAlign:'center'}}>No. de ref / Recibo</th>
              <th style={{textAlign:'center'}}>Comprobante</th>
              <th style={{textAlign:'center'}}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(!state.items || !state.items.length) && (<tr><td colSpan={6} className="rc-empty">Sin servicios</td></tr>)}
            {state.items?.map((r, i) => (
              <tr key={`${active}-${i}`}>
                <td data-label="Categoría">
                  <select className="rc-input rc-select" value={r.categoria} onChange={(e)=>setRow(i,'categoria',e.target.value)} disabled={isViewing}>
                    {categorias.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </td>
                <td data-label="Descripción">
                  <input className="rc-input rc-desc" placeholder="Descripción" value={r.descripcion} onChange={(e)=>setRow(i,'descripcion',e.target.value)} disabled={isViewing} />
                </td>
                <td data-label="Monto">
                  <input className="rc-input rc-qty no-spin" type="number" min="0" step="0.01" value={r.monto ?? ''} onChange={(e)=>setRow(i,'monto',e.target.value)} onWheel={(e)=>e.currentTarget.blur()} disabled={isViewing} />
                </td>
                <td data-label="Ref">
                  <input className="rc-input" placeholder="Referencia" value={r.ref || ''} onChange={(e)=>setRow(i,'ref',e.target.value)} disabled={isViewing} />
                </td>
                <td data-label="Comprobante" className="img-cell">
                  <div className="rc-proof-cell">
                    {r.filePreview || r.fileUrl ? (
                      <button type="button" className="rc-iconbtn" onClick={() => openViewer({ url: r.filePreview || r.fileUrl, mime: r.fileMime || '', name: r.fileName || '', rowIndex: i })}><img src={ICONS.view} alt="Ver" width={25} height={25} /></button>
                    ) : (
                      !isViewing && <button type="button" className="rc-btn rc-btn-outline" onClick={()=>handlePickFile(i)}>Subir</button>
                    )}
                    <input type="file" id={`servicio-file-${active}-${i}`} accept={okTypes.join(',')} style={{display:'none'}} onChange={(e)=>handleFileChange(i, e)} />
                  </div>
                </td>
                <td data-label="Acciones" className="actions-cell">
                  {!isViewing && (
                    <>
                      {r.fileBlob && <button type="button" className="rc-btn rc-btn-ghost text-danger" onClick={()=>clearFile(i)}>✕</button>}
                      <button type="button" className="rc-btn rc-btn-ghost text-danger" onClick={()=>removeRow(i)}>Eliminar</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isViewing && (
          <div className="rc-card-ft">
            <button type="button" className="rc-btn rc-btn-outline" onClick={addRow}>+ Agregar otro servicio</button>
          </div>
        )}
      </section>

      {viewer.open && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-hd">
              <h3>Comprobante</h3>
              <button className="rc-btn rc-btn-ghost" onClick={closeViewer}>✕</button>
            </div>
            <div className="modal-bd" style={{textAlign:'center'}}>
              {viewer.mime.includes('pdf') ? (
                <iframe src={viewer.url} title="PDF Preview" width="100%" height="400px" />
              ) : (
                <img src={viewer.url} alt="Comprobante" style={{maxWidth:'100%', maxHeight:'60vh', objectFit:'contain'}} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
