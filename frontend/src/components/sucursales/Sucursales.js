// src/components/sucursales/Sucursales.js
import React, { useState, useEffect, useMemo } from 'react';
import { db, auth } from '../../services/firebase';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import Swal from 'sweetalert2';
import './Sucursales.css';

/* ================= Helpers de rol y JWT ================ */
function decodeJwtPayloadSafe(token) {
  try {
    const base64Url = (token || '').split('.')[1] || '';
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
const lower = (v) => (v ?? '').toString().trim().toLowerCase();

function getRoleFromStorageOrJWT() {
  const lsRole = lower(localStorage.getItem('role') || '');
  if (lsRole) return lsRole;
  const token = localStorage.getItem('token') || '';
  const p = decodeJwtPayloadSafe(token) || {};
  const jwtRole = lower(p.role || p.rol);
  if (jwtRole) return jwtRole;
  if (p.admin === true || p.isAdmin === true) return 'admin';
  return null;
}

/* ================= Componente ================= */
export default function Sucursales() {
  const [sucursales, setSucursales] = useState([]);
  const [loading, setLoading] = useState(false);

  // Perfil del usuario logueado (desde Firestore)
  const [me, setMe] = useState({ role: null, sucursalId: null, loaded: false });

  // Fallback de rol (desde storage/JWT) para no bloquear ediciones de admin
  const [fallbackRole] = useState(getRoleFromStorageOrJWT());

  // Modal + formulario
  const [modalOpen, setModalOpen] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [cajaChica, setCajaChica] = useState('');

  // Extras (checks)
  const [extrasPedidosYa, setExtrasPedidosYa] = useState(false);
  const [extrasAmex, setExtrasAmex] = useState(false);

  const sucursalColRef = collection(db, 'sucursales');

  /* ======== Cargar perfil (usuarios/{uid}) ======== */
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setMe({ role: 'viewer', sucursalId: null, loaded: true });
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        const data = snap.exists() ? snap.data() : {};
        setMe({
          role: lower(data.role || 'viewer'),
          sucursalId: data.sucursalId || null,
          loaded: true,
        });
      } catch (e) {
        // Si no se puede leer usuarios/{uid}, marcamos loaded y usamos fallbackRole
        console.warn('No se pudo leer usuarios/{uid}:', e?.code || e?.message || e);
        setMe({ role: null, sucursalId: null, loaded: true });
      }
    });
    return () => unsub();
  }, []);

  const effectiveRole = me.role || fallbackRole || 'viewer';
  const canManage = effectiveRole === 'admin';

  /* ======== Cargar sucursales según rol ======== */
  const cargarSucursales = async () => {
    try {
      setLoading(true);

      if (effectiveRole === 'admin') {
        // Admin: puede listar todas
        const data = await getDocs(sucursalColRef);
        setSucursales(data.docs.map((d) => ({ ...d.data(), id: d.id })));
      } else {
        // Viewer: NO puede listar. Leer solo su sucursal asignada
        if (!me.sucursalId) {
          setSucursales([]); // no asignado
          return;
        }
        const sRef = doc(db, 'sucursales', me.sucursalId);
        const sSnap = await getDoc(sRef);
        if (sSnap.exists()) {
          setSucursales([{ id: sSnap.id, ...sSnap.data() }]);
        } else {
          setSucursales([]); // asignada pero no existe
        }
      }
    } catch (err) {
      // Manejar permission-denied elegantemente
      const code = err?.code || '';
      if (code === 'permission-denied') {
        if (effectiveRole === 'viewer') {
          // viewer intentando listar (por error de flujo) → mensaje informativo
          console.warn('Viewer no puede listar sucursales. Se intentará solo su doc.');
          setSucursales([]);
        } else {
          Swal.fire('Permiso denegado', 'No tienes permisos para listar sucursales.', 'info');
        }
      } else {
        console.error(err);
        Swal.fire('Error', 'No se pudieron cargar las sucursales', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Espera a conocer el perfil primero
    if (!me.loaded) return;
    cargarSucursales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.loaded, effectiveRole, me.sucursalId]);

  /* ======== Derivados para render ======== */
  const visibleSucursales = useMemo(() => {
    // Ya no filtramos aquí: setSucursales trae lo que corresponde por rol
    return sucursales;
  }, [sucursales]);

  /* ======== Acciones ======== */
  const openNewModal = () => {
    if (!canManage) return Swal.fire('Sin permisos', 'No puedes crear sucursales.', 'info');
    setEditandoId(null);
    setNombre('');
    setEmpresa('');
    setUbicacion('');
    setCajaChica('');
    setExtrasPedidosYa(false);
    setExtrasAmex(false);
    setModalOpen(true);
  };

  const openEditModal = (s) => {
    if (!canManage) return Swal.fire('Sin permisos', 'No puedes editar sucursales.', 'info');
    setEditandoId(s.id);
    setNombre(s.nombre || '');
    setEmpresa(s.empresa || '');
    setUbicacion(s.ubicacion || '');
    setCajaChica(
      typeof s.cajaChica === 'number' ? s.cajaChica.toString() : (s.cajaChica || '')
    );
    const ex = s.extras || {};
    setExtrasPedidosYa(Boolean(ex.pedidosYa));
    setExtrasAmex(Boolean(ex.americanExpress));
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  const validar = () => {
    if (!nombre || !empresa || !ubicacion || cajaChica === '') {
      Swal.fire('Campos incompletos', 'Todos los campos son requeridos', 'warning');
      return false;
    }
    const val = parseFloat(cajaChica);
    if (Number.isNaN(val) || val < 0) {
      Swal.fire('Caja chica inválida', 'Ingresa un monto válido (>= 0)', 'warning');
      return false;
    }
    return true;
  };

  const handleGuardar = async () => {
    if (!canManage) return Swal.fire('Sin permisos', 'No puedes guardar cambios.', 'info');
    if (!validar()) return;

    try {
      const payload = {
        nombre: nombre.trim(),
        empresa: empresa.trim(),
        ubicacion: ubicacion.trim(),
        cajaChica: parseFloat(cajaChica),
        extras: {
          pedidosYa: Boolean(extrasPedidosYa),
          americanExpress: Boolean(extrasAmex),
        },
      };

      if (editandoId) {
        await updateDoc(doc(db, 'sucursales', editandoId), payload);
        Swal.fire('Actualizado', 'Sucursal modificada', 'success');
      } else {
        await addDoc(sucursalColRef, payload);
        Swal.fire('Agregado', 'Sucursal registrada', 'success');
      }

      setModalOpen(false);
      await cargarSucursales();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'permission-denied') {
        Swal.fire('Permiso denegado', 'No tienes permisos para editar sucursales.', 'info');
      } else {
        console.error(err);
        Swal.fire('Error', 'No se pudo guardar la sucursal', 'error');
      }
    }
  };

  const handleEliminar = async (id) => {
    if (!canManage) return Swal.fire('Sin permisos', 'No puedes eliminar sucursales.', 'info');
    const confirm = await Swal.fire({
      title: '¿Eliminar?',
      text: 'Esta acción no se puede deshacer.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
    });
    if (!confirm.isConfirmed) return;
    try {
      await deleteDoc(doc(db, 'sucursales', id));
      await cargarSucursales();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'permission-denied') {
        Swal.fire('Permiso denegado', 'No tienes permisos para eliminar sucursales.', 'info');
      } else {
        console.error(err);
        Swal.fire('Error', 'No se pudo eliminar', 'error');
      }
    }
  };

  /* ================= Render ================= */
  return (
    <div className="sucursales-shell">
      <header className="sucursales-header">
        <h1>Sucursales</h1>
        <div className="sucursales-actions">
          {canManage && (
            <button className="btn btn-primary" onClick={openNewModal}>
              Nueva sucursal
            </button>
          )}
        </div>
      </header>

      {!me.loaded ? (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>Ubicación</th>
                <th>Caja Chica (Q)</th>
                {canManage && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={canManage ? 5 : 4} className="empty">
                  Cargando perfil…
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <div className="tabla-wrap">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Empresa</th>
                <th>Ubicación</th>
                <th>Caja Chica (Q)</th>
                {canManage && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="empty">
                    Cargando…
                  </td>
                </tr>
              ) : visibleSucursales.length ? (
                visibleSucursales.map((s) => (
                  <tr key={s.id}>
                    <td>{s.nombre}</td>
                    <td>{s.empresa}</td>
                    <td>{s.ubicacion}</td>
                    <td>{typeof s.cajaChica === 'number' ? s.cajaChica.toFixed(2) : '0.00'}</td>
                    {canManage && (
                      <td>
                        <div className="acciones">
                          <button className="btn-min" onClick={() => openEditModal(s)}>
                            Editar
                          </button>
                          <button className="btn-min danger" onClick={() => handleEliminar(s.id)}>
                            Eliminar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={canManage ? 5 : 4} className="empty">
                    {effectiveRole === 'viewer'
                      ? (me.sucursalId
                          ? 'No hay datos de tu sucursal.'
                          : 'No tienes una sucursal asignada.')
                      : 'Sin sucursales'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && canManage && (
        <div className="modal-mask" onClick={closeModal}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="card-title">
              {editandoId ? 'Editar sucursal' : 'Nueva sucursal'}
            </h3>

            <div className="form-sucursal">
              <div className="form-row">
                <label>Nombre</label>
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre de la sucursal"
                />
              </div>
              <div className="form-row">
                <label>Empresa</label>
                <input
                  type="text"
                  value={empresa}
                  onChange={(e) => setEmpresa(e.target.value)}
                  placeholder="Empresa"
                />
              </div>
              <div className="form-row">
                <label>Ubicación</label>
                <input
                  type="text"
                  value={ubicacion}
                  onChange={(e) => setUbicacion(e.target.value)}
                  placeholder="Dirección o zona"
                />
              </div>
              <div className="form-row">
                <label>Caja Chica (Q)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cajaChica}
                  onChange={(e) => setCajaChica(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="form-row">
                <label>Extras</label>
                <div className="extras-group" style={{ display: 'grid', gap: 6 }}>
                  <label
                    className="form-check"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={extrasPedidosYa}
                      onChange={(e) => setExtrasPedidosYa(e.target.checked)}
                    />
                    <span>Pedidos Ya</span>
                  </label>

                  <label
                    className="form-check"
                    style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                  >
                    <input
                      type="checkbox"
                      className="form-check-input"
                      checked={extrasAmex}
                      onChange={(e) => setExtrasAmex(e.target.checked)}
                    />
                    <span>American Express</span>
                  </label>
                </div>
                <small className="form-hint" style={{ color: '#6b7280' }}>
                  Estas opciones muestran botones adicionales en Registrar Cierre.
                </small>
              </div>
            </div>

            <div className="form-actions">
              <button className="btn" onClick={closeModal}>
                Cancelar
              </button>
              <button className="btn btn-primary" onClick={handleGuardar}>
                {editandoId ? 'Actualizar' : 'Agregar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
