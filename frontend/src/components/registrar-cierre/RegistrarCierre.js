// src/RegistrarCierre.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  increment,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import './styles/base.css';
import './styles/layout-tabs.css';
import './styles/arqueo.css';
import './styles/gastos.css';
import './styles/pedidos-expresso.css';
import './styles/resumen.css';
import './styles/general.css';
import { recomputeSucursalKPI } from '../../utils/kpi';


import { getStorage, ref as sRef, uploadBytes, getDownloadURL } from 'firebase/storage';

import { todayISO } from '../../utils/dates';
import { n } from '../../utils/numbers';
import { useSucursales } from '../../hooks/useSucursales';
import { useRegistrarCierreTotals } from '../../hooks/useRegistrarCierreTotals';

import ArqueoGrid from './ArqueoGrid';
import CierreGrid from './CierreGrid';
import GastosList from './GastosList';
import ResumenPanel from './ResumenPanel';
import CajaChicaModal from './CajaChicaModal';

const formatThousands = (s) => {
  // s: string sin comas. Devuelve string con comas (solo visual)
  if (s === '' || s == null) return '';
  const parts = String(s).split('.');
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
};

const parseMoneyInput = (s) =>
  parseFloat(String(s || '').replace(/,/g, '')) || 0;


const isAjusteCajaChica = (name) =>
  (name || '').toString().trim().toLowerCase() === 'ajuste de caja chica';

const getTotalAjusteCajaChica = (gastos) =>
  (gastos || []).reduce((s, g) => s + (isAjusteCajaChica(g.categoria) ? n(g.cantidad) : 0), 0);

const INIT_GASTO_CATEGORIAS = [
  'Varios',
  'Coca-cola',
  'Servicios',
  'Publicidad',
  'Gas y gasolina',
  'Transporte',
  'Mantenimiento',
  'Ajuste de caja chica',
];

const emptyArqueoCaja = () => ({
  q200: '',
  q100: '',
  q50: '',
  q20: '',
  q10: '',
  q5: '',
  q1: '',
  apertura: 1000,
  tarjeta: '',
  motorista: '',
});

const emptyCierreCaja = () => ({
  efectivo: '',
  tarjeta: '',
  motorista: '',
});

const normalizeArqueo = (arr) => {
  const base = [emptyArqueoCaja(), emptyArqueoCaja(), emptyArqueoCaja()];
  const src = Array.isArray(arr) ? arr : [];
  return base.map((b, i) => {
    const fromDoc = src[i] || {};
    const apertura =
      fromDoc.apertura === 0 || Number.isFinite(+fromDoc.apertura)
        ? fromDoc.apertura
        : 1000;
    return { ...b, ...fromDoc, apertura };
  });
};


const TABS = {
  ARQUEO: 'arqueo',
  CIERRE: 'cierre',
  GASTOS: 'gastos',
  PY: 'py',
  AMEX: 'amex',
  RESUMEN: 'resumen',
};

const AMEX_FLAVORS = [
  'Pepperoni', 'Jamón', 'Only Cheese', 'Hawaiana', 'Magnífica', 'Dúo dinámico',
  'No meat', '4 estaciones', 'Cheese fingers',
  'Border cheese', 'Suprema', 'Full meat', 'Super chilly', 'Tejana',
  'Border champiñones', 'Americana', 'Italiana',
];

const AMEX_PRICES_DEFAULT = AMEX_FLAVORS.reduce((acc, name) => {
  acc[name] = 85;
  return acc;
}, {});
AMEX_PRICES_DEFAULT['Pepperoni'] = 65;
AMEX_PRICES_DEFAULT['Jamón'] = 65;
AMEX_PRICES_DEFAULT['Cheese fingers'] = 40;

const blockWheel = (e) => e.currentTarget.blur();
const blockArrows = (e) => {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
};

export default function RegistrarCierre() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const editId = sp.get('id') || null;
  const mode = (sp.get('mode') || '').toLowerCase();
  const isViewing = mode === 'view';
  const isEditingExisting = !!editId && mode === 'edit';
  const [originalDoc, setOriginalDoc] = useState(null);

  // Perfil usuario
  const [me, setMe] = useState({ loaded: false, role: 'viewer', sucursalId: null, username: '' });
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe({ loaded: true, role: 'viewer', sucursalId: null, username: '' });
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setMe({
          loaded: true,
          role: data.role || 'viewer',
          sucursalId: data.sucursalId || null,
          username: data.username || '',
        });
      } catch (e) {
        console.error(e);
        setMe({ loaded: true, role: 'viewer', sucursalId: null, username: '' });
      }
    });
    return () => unsub();
  }, []);
  const isAdmin = me.role === 'admin';

  const isReadOnlyUI = isViewing; 

  // Sucursales
  const sucursales = useSucursales();

  const sucursalesVisibles = useMemo(() => {
    if (!me.loaded) return [];
    return isAdmin ? sucursales : sucursales.filter((s) => s.id === me.sucursalId);
  }, [sucursales, me, isAdmin]);

  const [activeSucursalId, setActiveSucursalId] = useState(null);
  const [activeSucursalDoc, setActiveSucursalDoc] = useState(null);

  useEffect(() => {
    if (!me.loaded || !sucursalesVisibles.length) return;
    setActiveSucursalId((prev) => prev || sucursalesVisibles[0]?.id || null);
  }, [me.loaded, sucursalesVisibles]);

  useEffect(() => {
    (async () => {
      if (!activeSucursalId) { setActiveSucursalDoc(null); return; }
      try {
        const sSnap = await getDoc(doc(db, 'sucursales', activeSucursalId));
        setActiveSucursalDoc(sSnap.exists() ? { id: sSnap.id, ...sSnap.data() } : null);
      } catch (e) {
        console.error('No se pudo leer la sucursal activa:', e);
        setActiveSucursalDoc(null);
      }
    })();
  }, [activeSucursalId]);

  const [amexItems, setAmexItems] = useState({});
  const [amexTotal, setAmexTotal] = useState(0);

  // 👇 NUEVO: función para dejar el form limpio
  const resetForm = React.useCallback(() => {
    setOriginalDoc(null);
    setFecha(todayISO());
    setArqueo([emptyArqueoCaja(), emptyArqueoCaja(), emptyArqueoCaja()]);
    setCierre([emptyCierreCaja(), emptyCierreCaja(), emptyCierreCaja()]);
    setGastos([{
      categoria: INIT_GASTO_CATEGORIAS[0],
      descripcion: '',
      cantidad: '',
      ref: '',
      locked: false,
      fileUrl: '',
      fileBlob: null,
      filePreview: '',
      fileMime: '',
      fileName: '',
    }]);
    setCategorias(INIT_GASTO_CATEGORIAS);
    setComentario('');
    setCajaChicaUsada(0);
    setFaltantePagado(0);
    setPedidosYaText('');
    setAmexItems({});
    setAmexTotal(0);
    // Nota: NO tocamos activeSucursalId para respetar la selección visible
  }, []);

  const [fecha, setFecha] = useState(todayISO());

  const [arqueo, setArqueo] = useState([emptyArqueoCaja(), emptyArqueoCaja(), emptyArqueoCaja()]);
  const [cierre, setCierre] = useState([emptyCierreCaja(), emptyCierreCaja(), emptyCierreCaja()]);
  const [categorias, setCategorias] = useState(INIT_GASTO_CATEGORIAS);
  const [gastos, setGastos] = useState([
    {
      categoria: INIT_GASTO_CATEGORIAS[0],
      descripcion: '',
      cantidad: '',
      ref: '',
      locked: false,
      fileUrl: '',
      fileBlob: null,
      filePreview: '',
      fileMime: '',
      fileName: '',
    },
  ]);
  const [comentario, setComentario] = useState('');
  const [cajaChicaUsada, setCajaChicaUsada] = useState(0);
  const [faltantePagado, setFaltantePagado] = useState(0);

  // texto crudo que escribe el usuario (sin comas)
  const [pedidosYaText, setPedidosYaText] = useState('');

  // número derivado para cálculos/guardar
  const pedidosYaCantidad = React.useMemo(
    () => parseMoneyInput(pedidosYaText),
    [pedidosYaText]
  );


  useEffect(() => {
    if (!editId) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'cierres', editId));
        if (!snap.exists()) return;
        const d = snap.data() || {};
        setOriginalDoc(d);

        setActiveSucursalId(d.sucursalId || null);
        setFecha(d.fecha || todayISO());

        const arqNorm = normalizeArqueo(d.arqueo);
        setArqueo(arqNorm);

        setCierre(Array.isArray(d.cierre) && d.cierre.length ? d.cierre : [emptyCierreCaja(), emptyCierreCaja(), emptyCierreCaja()]);

        setGastos(Array.isArray(d.gastos) ? d.gastos : []);
        setCategorias(Array.isArray(d.categorias) && d.categorias.length ? d.categorias : INIT_GASTO_CATEGORIAS);

        setComentario(d.comentario || '');
        setCajaChicaUsada(n(d.cajaChicaUsada));
        setFaltantePagado(n(d.faltantePagado));

        const py = (d.extras && d.extras.pedidosYaCantidad != null)
          ? d.extras.pedidosYaCantidad
          : (d.pedidosYaCantidad != null ? d.pedidosYaCantidad : 0);

        // guardamos como texto limpio (sin comas), así el input puede formatear
        setPedidosYaText(String(py || ''));

        const ax = d.extras?.americanExpress;
        if (ax && typeof ax === 'object') {
          setAmexItems(ax.items || {});
          setAmexTotal(n(ax.total));
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, [editId]);

  // si no hay editId (ruta /RegistrarCierre), limpia el formulario
  useEffect(() => {
    if (!editId) resetForm();
  }, [editId, mode, resetForm]);

  const [busy, setBusy] = useState(false);

  const [showCajaChica, setShowCajaChica] = useState(false);

  const activeFromHook = useMemo(
    () => sucursales.find((s) => s.id === activeSucursalId) || null,
    [sucursales, activeSucursalId]
  );

  const cajaChicaActual =
    (activeSucursalDoc?.cajaChica ?? activeFromHook?.cajaChica) || 0;

  const cajaChicaDisponibleUI = isViewing
    ? (originalDoc?.cajaChicaDisponibleAtSave ??
       originalDoc?.cajaChicaDisponible ??
       cajaChicaActual)
    : cajaChicaActual;


  const totalAperturas = (arqueo || []).reduce((s, c) => s + (Number.isFinite(+c?.apertura) ? +c.apertura : 1000), 0);

  const truthy = (v) =>
    v === true || v === 1 || v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');

  const resolveExtras = (srcA, srcB) => {
    const a = srcA || {};
    const b = srcB || {};
    const ax = a.extras || {};
    const bx = b.extras || {};

    const pedidosYa =
      truthy(ax.pedidosYa ?? a.pedidosYa ?? bx.pedidosYa ?? b.pedidosYa ?? ax.py ?? bx.py ?? ax.pedidos_y ?? bx.pedidos_y ?? false);

    const americanExpress =
      truthy(
        ax.americanExpress ??
          a.americanExpress ??
          bx.americanExpress ??
          b.americanExpress ??
          ax.amex ?? bx.amex ??
          ax.american_express ?? bx.american_express ??
          ax.ae ?? bx.ae ?? false
      );

    return { pedidosYa, americanExpress };
  };

  const { pedidosYa: _py, americanExpress: _amex } = resolveExtras(activeSucursalDoc, activeFromHook);

  const showPedidosYaBtn = _py;
  const showAmexBtn = _amex;

  const amexPrices = useMemo(() => {
    const exA = activeSucursalDoc?.extras || {};
    const exB = activeFromHook?.extras || {};
    const fromDb =
      exA.americanExpressPrices ||
      activeSucursalDoc?.americanExpressPrices ||
      exA.amexPrices ||
      exB.americanExpressPrices ||
      activeFromHook?.americanExpressPrices ||
      exB.amexPrices ||
      null;
    return { ...AMEX_PRICES_DEFAULT, ...(fromDb || {}) };
  }, [activeSucursalDoc, activeFromHook]);

  useEffect(() => {
    const total = AMEX_FLAVORS.reduce((sum, name) => {
      const qty = n(amexItems?.[name]);
      const price = amexPrices[name] ?? 0;
      return sum + qty * price;
    }, 0);
    setAmexTotal(total);
  }, [amexItems, amexPrices]);

  const { totals, flags } = useRegistrarCierreTotals({
    arqueo,
    cierre,
    gastos,
    cajaChicaUsada,
    faltantePagado,
  });
  const { faltanteEfectivo, faltantePorGastos } = totals;

  // Monto sugerido = Total de gastos - Total de efectivo del Arqueo (neto)
  const montoSugeridoCajaChica = useMemo(() => {
    const tg  = Number(totals?.totalGastos) || 0;
    const teN = Number(totals?.totalArqueoEfectivoNeto) || 0;
    const val = tg - teN;
    return val > 0 ? val : 0; // nunca negativo
  }, [totals?.totalGastos, totals?.totalArqueoEfectivoNeto]);



  const setArq = (idx, field, value) => {
    if (isReadOnlyUI) return;
    setArqueo((prev) => {
      const copy = prev.map((c) => ({ ...c }));
      copy[idx][field] = value;
      return copy;
    });
  };

  const setCier = (idx, field, value) => {
    if (isReadOnlyUI) return;
    setCierre((prev) => {
      const copy = prev.map((c) => ({ ...c }));
      copy[idx][field] = value;
      return copy;
    });
  };

  // Handlers para la fila "Caja chica usada"
  const handleEditCajaChica = () => setShowCajaChica(true); // reabre el modal
  const handleRemoveCajaChica = () => setCajaChicaUsada(0); // limpia el monto

  const addGasto = () => {
    if (isReadOnlyUI) return;
    setGastos((g) => {
      const prevLocked = g.map((item) => ({ ...item, locked: true }));
      const nuevo = {
        categoria: categorias[0] || '',
        descripcion: '',
        cantidad: '',
        ref: '',
        locked: false,
        fileUrl: '',
        fileBlob: null,
        filePreview: '',
        fileMime: '',
        fileName: '',
      };
      return [...prevLocked, nuevo];
    });
  };

  const setGasto = (i, field, val) => {
    if (isReadOnlyUI) return;
    setGastos((prev) => {
      const c = [...prev];
      c[i] = { ...c[i], [field]: val };
      return c;
    });
  };

  const removeGasto = (i) => {
    if (isReadOnlyUI) return;
    setGastos((prev) => prev.filter((_, idx) => idx !== i));
  };


  const handlePagarFaltante = async () => {
    if (!isAdmin) {
      return Swal.fire('Solo administradores', 'No puedes pagar faltante.', 'info');
    }
    if (isViewing) {
      return Swal.fire('Solo lectura', 'No puedes pagar faltante en modo ver.', 'info');
    }
    if (faltanteEfectivo <= 0) return;

    const { isConfirmed } = await Swal.fire({
      title: 'Pagar faltante',
      text: `Se sumará ${Number(faltanteEfectivo).toFixed(2)} al depósito.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, pagar',
      cancelButtonText: 'Cancelar',
    });
    if (!isConfirmed) return;

    // 1) Actualiza estado local para que el admin lo vea de inmediato
    const nuevoFaltantePagado = faltanteEfectivo;
    setFaltantePagado(nuevoFaltantePagado);

    
    // 2) Si es un cuadre EXISTENTE, persistimos de una vez en Firestore
    if (isEditingExisting && editId) {
      try {
        const sucId = activeSucursalDoc?.id ?? activeFromHook?.id;

        // Recalcula el totalGeneral con el nuevo faltantePagado (mismo cálculo del hook)
        const totalGeneralRecalc =
          (totals?.totalArqueoEfectivoNeto || 0)
          - (totals?.totalGastos || 0)
          + n(cajaChicaUsada)
          + n(nuevoFaltantePagado);

        // Un único update para mantener coherencia en el documento
        await updateDoc(doc(db, 'cierres', editId), {
          faltantePagado: nuevoFaltantePagado,
          'totales.totalGeneral': totalGeneralRecalc,
          updatedAt: serverTimestamp(),
        });

        // (Opcional pero recomendado) Mantén el KPI de la sucursal alineado
        if (sucId) {
          await recomputeSucursalKPI(sucId);
        }

        await Swal.fire({
          icon: 'success',
          title: 'Faltante pagado',
          text: `Se agregó Q ${nuevoFaltantePagado.toFixed(2)} al total a depositar y se guardó en el cuadre.`,
          timer: 1500,
          showConfirmButton: false,
        });
      } catch (e) {
        console.error(e);
        await Swal.fire('Error', e.message || 'No se pudo guardar el faltante pagado.', 'error');
      }
    } else {
      // Si es un cuadre NUEVO (sin editId), se guardará al presionar "Guardar"
      await Swal.fire({
        icon: 'success',
        title: 'Faltante pagado',
        text: `Se agregará Q ${nuevoFaltantePagado.toFixed(2)} cuando guardes el cuadre.`,
        timer: 1400,
        showConfirmButton: false,
      });
    }
  };


  const validate = () => {
    const activeId = activeSucursalDoc?.id ?? activeFromHook?.id;

    if (!activeId) {
      Swal.fire('Sucursal', 'Selecciona una sucursal.', 'warning');
      return false;
    }
    if (!isAdmin && me.loaded && me.sucursalId && activeId !== me.sucursalId) {
      Swal.fire('Permisos', 'Solo puedes registrar en tu sucursal asignada.', 'warning');
      return false;
    }
    if (!fecha) {
      Swal.fire('Fecha', 'Selecciona una fecha válida.', 'warning');
      return false;
    }
    if (n(cajaChicaUsada) > n(cajaChicaDisponibleUI)) {
      Swal.fire('Caja chica', `No puedes usar más de lo disponible (Q ${Number(cajaChicaDisponibleUI).toFixed(2)}).`, 'warning');
      return false;
    }
    return true;
  };

  const onSave = async () => {
    if (busy || isViewing) return;
    if (!validate()) return;

    setBusy(true);
    try {
      const cierresRef = collection(db, 'cierres');

      const sucId = activeSucursalDoc?.id ?? activeFromHook?.id;
      const sucNombre = activeSucursalDoc?.nombre ?? activeFromHook?.nombre;

      if (!isEditingExisting) {
        const fechaQ = query(cierresRef, where('fecha', '==', fecha));
        const snap = await getDocs(fechaQ);
        const existe = snap.docs.some((d) => (d.data()?.sucursalId || '') === sucId);
        if (existe) {
          await Swal.fire({ icon: 'warning', title: 'Ya existe un cuadre', text: `Ya hay un cuadre registrado para "${sucNombre}" en la fecha ${fecha}.` });
          return;
        }
      }

      // === Subir adjuntos de gastos (si hay) ===
      const storage = getStorage(); // usa la app por defecto
      const folder = `comprobantes/${sucId}/${fecha}`;

      const gastosListos = await Promise.all(
        (gastos || []).map(async (g, i) => {
          const { fileBlob, filePreview, ...rest } = g;
          if (fileBlob) {
            // nombre seguro (evita caracteres que rompen rutas)
            const safeName = (g.fileName || fileBlob.name || `gasto_${i}`)
              .replace(/[^\w.-]+/g, '_'); // <- OJO al rango
            const path = `${folder}/${Date.now()}_${i}_${safeName}`;
            const fileRef = sRef(storage, path);
            await uploadBytes(fileRef, fileBlob, {
              contentType: g.fileMime || fileBlob.type || 'application/octet-stream',
            });
            const url = await getDownloadURL(fileRef);
            return {
              ...rest,
              fileUrl: url,
              fileName: safeName,
              fileMime: g.fileMime || fileBlob.type || '',
            };
          }
          // si no hay blob nuevo (edición), conserva lo existente
          return {
            ...rest,
            fileUrl: g.fileUrl || '',
            fileName: g.fileName || '',
            fileMime: g.fileMime || '',
          };
        })
      );

      const actor = {
        uid: auth.currentUser?.uid || null,
        username: me.username || '',
        email: auth.currentUser?.email || '',
      };

      // 👉 BASE PARA EL KPI: total del cuadre (totalGeneral)
      const kpiBase = Number(totals?.totalGeneral ?? 0);

      const payloadBase = {
        fecha,
        sucursalId: sucId,
        arqueo,
        cierre,
        gastos: gastosListos,
        comentario,
        categorias,
        cajaChicaUsada,
        faltantePagado,
        kpiDepositosAtSave: kpiBase,
        cajaChicaDisponibleAtSave: originalDoc?.cajaChicaDisponibleAtSave ?? cajaChicaActual,
        extras: {
          pedidosYaCantidad: pedidosYaCantidad,
          americanExpress: {
            items: amexItems,
            total: amexTotal,
          },
        },
        totales: { ...totals },
      };


      if (isEditingExisting) {
        await updateDoc(doc(db, 'cierres', editId), { ...payloadBase, updatedAt: serverTimestamp() });

        const oldAjuste = getTotalAjusteCajaChica(originalDoc?.gastos || []);
        const newAjuste = getTotalAjusteCajaChica(gastos);
        const oldUsada = n(originalDoc?.cajaChicaUsada);
        const newUsada = n(cajaChicaUsada);
        const deltaCaja = -(newUsada - oldUsada) + (newAjuste - oldAjuste);
        if (deltaCaja !== 0) {
          await updateDoc(doc(db, 'sucursales', sucId), { cajaChica: increment(deltaCaja) });
        }

        // deja el KPI de la sucursal igual al total del cuadre editado
        await recomputeSucursalKPI(sucId);

        await Swal.fire({ icon: 'success', title: 'Actualizado', text: 'El cuadre se actualizó correctamente.', timer: 1600, showConfirmButton: false });
      } else {
        await addDoc(cierresRef, {
          ...payloadBase,
          createdAt: serverTimestamp(),
          username: actor.username,
          createdBy: actor,
        });

        const ajustePositivo = getTotalAjusteCajaChica(gastos);
        const delta = -n(cajaChicaUsada) + n(ajustePositivo);
        if (delta !== 0) {
          await updateDoc(doc(db, 'sucursales', sucId), { cajaChica: increment(delta) });
        }
        await recomputeSucursalKPI(sucId);
        await Swal.fire({ icon: 'success', title: 'Guardado', text: 'El cuadre se guardó correctamente.', timer: 1600, showConfirmButton: false });
      }
      navigate('/Finanzas/HistorialCuadres');
    } catch (err) {
      console.error(err);
      Swal.fire('Error', err.message || 'No se pudo guardar.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const [activeTab, setActiveTab] = useState(TABS.ARQUEO);

  const hideAdminButtonsCss = !isAdmin ? `
    .hide-cats .rc-card-hd > .rc-btn.rc-btn-outline:last-child { display: none !important; }
    .hide-pay  .rc-res-item .rc-btn.rc-btn-primary { display: none !important; }
  ` : '';

  if (!me.loaded) {
    return (
      <div className="rc-shell">
        <div className="rc-header"><h1>Registrar cuadre</h1></div>
        <div className="rc-tab-empty">Cargando permisos…</div>
      </div>
    );
  }

  const setAmexQty = (name, raw) => {
    if (isViewing) return;
    const v = Math.max(0, parseInt(raw ?? '0', 10) || 0);
    setAmexItems((prev) => ({ ...prev, [name]: v }));
  };

  return (
    <div className="rc-shell">
      {hideAdminButtonsCss && <style>{hideAdminButtonsCss}</style>}

      <div className="rc-header">
        <div className="rc-header-left">
          <h1>Registrar cuadre {isEditingExisting ? '(editando)' : isViewing ? '(viendo)' : ''}</h1>

          <div className="rc-date" style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="rc-fecha">Fecha</label>
              <input
                id="rc-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                disabled={isReadOnlyUI}
                readOnly={isReadOnlyUI}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="rc-sucursal">Sucursal</label>
              <select
                id="rc-sucursal"
                value={activeSucursalId || ''}
                onChange={(e) => {
                  const next = e.target.value || null;
                  if (isReadOnlyUI) return;
                  if (!isAdmin && me.sucursalId && next !== me.sucursalId) return;
                  setActiveSucursalId(next);
                  setCajaChicaUsada(0);
                  setFaltantePagado(0);
                }}
                disabled={isReadOnlyUI || !sucursalesVisibles.length}
              >
                {!sucursalesVisibles.length && <option value="">(Sin sucursales)</option>}
                {sucursalesVisibles.map((s) => (
                  <option key={s.id} value={s.id}>{s.nombre}</option>
                ))}
              </select>
            </div>

            <div className="rc-tabs-actions" style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {!isReadOnlyUI && (
                <button
                  type="button"
                  className="rc-btn rc-btn-accent"
                  onClick={onSave}
                  disabled={busy}
                  title={isEditingExisting ? 'Actualizar cuadre' : 'Guardar cuadre'}
                >
                  {busy ? 'Guardando…' : isEditingExisting ? 'Actualizar' : 'Guardar'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="rc-tabs-row rc-tabs-attached">
        <div className="rc-tabs rc-tabs-browser" role="tablist" aria-label="Secciones">
          <button className={`rc-tab ${activeTab === TABS.ARQUEO ? 'active' : ''}`} onClick={() => setActiveTab(TABS.ARQUEO)} type="button" role="tab" aria-selected={activeTab === TABS.ARQUEO}>Arqueo físico</button>

          {isAdmin && (
            <button
              className={`rc-tab ${activeTab === TABS.CIERRE ? 'active' : ''}`}
              onClick={() => setActiveTab(TABS.CIERRE)}
              type="button"
              role="tab"
              aria-selected={activeTab === TABS.CIERRE}
            >
              Cierre de sistema
            </button>
          )}

          <button className={`rc-tab ${activeTab === TABS.GASTOS ? 'active' : ''}`} onClick={() => setActiveTab(TABS.GASTOS)} type="button" role="tab" aria-selected={activeTab === TABS.GASTOS}>Gastos</button>

          {showPedidosYaBtn && (
            <button className={`rc-tab ${activeTab === TABS.PY ? 'active' : ''}`} onClick={() => setActiveTab(TABS.PY)} type="button" role="tab" aria-selected={activeTab === TABS.PY}>Pedidos Ya</button>
          )}

          {showAmexBtn && (
            <button className={`rc-tab ${activeTab === TABS.AMEX ? 'active' : ''}`} onClick={() => setActiveTab(TABS.AMEX)} type="button" role="tab" aria-selected={activeTab === TABS.AMEX}>American Express</button>
          )}

          <button className={`rc-tab ${activeTab === TABS.RESUMEN ? 'active' : ''}`} onClick={() => setActiveTab(TABS.RESUMEN)} type="button" role="tab" aria-selected={activeTab === TABS.RESUMEN}>Resumen</button>
        </div>
      </div>

      {activeTab === TABS.ARQUEO && (
        <div className="rc-grid">
          <ArqueoGrid
            arqueo={arqueo}
            setArq={setArq}
            cajaChicaDisponible={cajaChicaDisponibleUI}
            readOnly={isReadOnlyUI}
          />
        </div>
      )}

      {activeTab === TABS.CIERRE && (
        <div className="rc-grid">
          {isAdmin ? (
            <CierreGrid cierre={cierre} setCier={setCier} readOnly={isReadOnlyUI} />
          ) : (
            <div className="rc-tab-empty">Solo administradores</div>
          )}
        </div>
      )}

      {activeTab === TABS.GASTOS && (
        <div className="rc-grid rc-grid-bottom">
          <GastosList
            gastos={gastos}
            categorias={categorias}
            setGasto={setGasto}
            addGasto={addGasto}
            removeGasto={removeGasto}
            onUseCajaChica={() => setShowCajaChica(true)}
            activeSucursalNombre={activeSucursalDoc?.nombre ?? activeFromHook?.nombre}
            cajaChicaDisponible={cajaChicaDisponibleUI}
            faltantePorGastos={faltantePorGastos}
            readOnly={isReadOnlyUI}
            isAdmin={isAdmin} 
            cajaChicaUsada={cajaChicaUsada}
            onEditCajaChica={handleEditCajaChica}
            onRemoveCajaChica={handleRemoveCajaChica}
          />
        </div>
      )}

      {activeTab === TABS.PY && showPedidosYaBtn && (
        <section className="rc-card">
          <div className="rc-card-hd">
            <h3>Pedidos Ya</h3>
          </div>

          <div
            className="rc-card-bd"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <label className="rc-cell-label strong">Cantidad vendida</label>

            {/* Prefijo Q. afuera */}
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--dark)' }}>
              Q.
            </span>

            <input
            className="rc-input rc-no-spin"
            type="text"
            inputMode="decimal"
            value={formatThousands(pedidosYaText)}   // 👈 se muestran comas SOLO en UI
            placeholder="0.00"
            onChange={(e) => {
              // 1) quitar comas previas y normalizar coma a punto
              let raw = e.target.value.replace(/,/g, '').replace(',', '.');

              // 2) permitir vacío o patrón decimal válido
              if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
                // guardamos SIEMPRE sin comas (texto crudo)
                setPedidosYaText(raw);
              }
            }}
            disabled={isReadOnlyUI}
            style={{
              width: 220,
              height: 52,
              fontSize: '1.2rem',
              textAlign: 'center',
            }}
          />
          </div>
        </section>
      )}

      {activeTab === TABS.AMEX && showAmexBtn && (
        <section className="rc-card">
          <div className="rc-card-hd">
            <h3>American Express</h3>
          </div>
          <div className="amex-grid">
            {AMEX_FLAVORS.map((name) => {
              const val = amexItems?.[name]; // <-- usa tu estado real
              return (
                <div
                  key={name}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 6px' }}
                >
                  <span style={{ fontWeight: 700, color: 'var(--slate)' }}>{name}</span>

                  <input
                    className="rc-input amex-input rc-no-spin"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={(val === 0 || val === '0' || val == null) ? '' : String(val)}
                    placeholder="0"
                    onChange={(e) => {
                      const clean = e.target.value.replace(/[^\d]/g, '');
                      // '' para ver placeholder si está vacío o es "0"; si no, entero >= 0
                      setAmexQty(name, (clean === '' || clean === '0') ? '' : parseInt(clean, 10));
                    }}
                    onWheel={blockWheel}
                    onKeyDown={blockArrows}
                    disabled={isReadOnlyUI}
                    aria-label={`Cantidad ${name}`}
                    style={{ width: 100, textAlign: 'center', background: '#cfeee0', border: '1px solid #cfe8db', borderRadius: 12, fontWeight: 800 }}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
            <b style={{ fontSize: 20 }}>Total</b>
            <span style={{ fontSize: 20, fontWeight: 800 }}>
              Q { (Number(amexTotal) || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              }) }
            </span>
          </div>
        </section>
      )}

      {activeTab === TABS.RESUMEN && (
        <>
          <div className={isAdmin ? '' : 'hide-pay'}>
            <ResumenPanel
              totals={totals || {}}
              flags={flags || {}}
              cajaChicaUsada={cajaChicaUsada}
              onPagarFaltante={isAdmin ? handlePagarFaltante : undefined}
              faltantePagado={faltantePagado}
              pedidosYaCantidad={pedidosYaCantidad}
              amexTotal={amexTotal}
              showPedidosYa={showPedidosYaBtn}
              showAmex={showAmexBtn}
              totalAperturas={totalAperturas}
              isAdmin={isAdmin}
            />
          </div>

          {isAdmin && (
            <section className="rc-card">
              <h3>Comentario</h3>
              <div className="rc-comentario">
                <textarea
                  id="rc-comentario"
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Agrega un comentario"
                  rows={3}
                  disabled={isViewing}
                  readOnly={isViewing}
                />
              </div>
            </section>
          )}
        </>
      )}
      
      <CajaChicaModal
        open={showCajaChica}
        onClose={() => setShowCajaChica(false)}
        cajaChicaDisponible={cajaChicaDisponibleUI}
        faltantePorGastos={faltantePorGastos}
        montoSugerido={montoSugeridoCajaChica} 
        onApply={(monto) => { if (isViewing) return; setCajaChicaUsada((prev) => prev + monto); }}
      />
    </div>
  );
}