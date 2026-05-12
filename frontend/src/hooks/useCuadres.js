import { useEffect, useState, useCallback } from 'react';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from './../services/firebase';

export function useCuadres({ fecha, sucursalId }) {
  const [cuadres, setCuadres] = useState([]);
  const [sucursalesMap, setSucursalesMap] = useState({});
  const [cajaChicaMap, setCajaChicaMap] = useState({});
  const [sucursalesList, setSucursalesList] = useState([]);

  const obtenerCuadres = useCallback(async () => {
    const ref = collection(db, 'cierres');
    const q = fecha ? query(ref, where('fecha', '==', fecha)) : ref;
    const snap = await getDocs(q);
    let data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (sucursalId && sucursalId !== 'all') data = data.filter(c => c.sucursalId === sucursalId);
    setCuadres(data);
  }, [fecha, sucursalId]);

  useEffect(() => { (async () => {
    const snap = await getDocs(collection(db, 'sucursales'));
    const list = snap.docs.map(d => ({ id: d.id, nombre: d.data().ubicacion || d.data().nombre || 'Sin nombre' }));
    setSucursalesList(list.sort((a,b)=>a.nombre.localeCompare(b.nombre)));
  })(); }, []);

  useEffect(() => { obtenerCuadres(); }, [obtenerCuadres]);

  useEffect(() => {
    (async () => {
      const ids = Array.from(new Set(cuadres.map(c => c.sucursalId).filter(Boolean)));
      const ubic = {}, caja = {};
      await Promise.all(ids.map(async id => {
        const sd = await getDoc(doc(db, 'sucursales', id));
        if (sd.exists()) {
          const d = sd.data();
          ubic[id] = d.ubicacion || d.nombre || 'Sin lugar';
          caja[id] = parseFloat(d.cajaChica) || 0;
        } else { ubic[id] = 'Sucursal no encontrada'; caja[id] = 0; }
      }));
      setSucursalesMap(ubic); setCajaChicaMap(caja);
    })();
  }, [cuadres]);

  return { cuadres, sucursalesList, sucursalesMap, cajaChicaMap, refetch: obtenerCuadres };
}
