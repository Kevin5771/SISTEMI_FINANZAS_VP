import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from './../services/firebase';

export function useSucursales() {
  const [sucursales, setSucursales] = useState([]);
  useEffect(() => {
    (async () => {
      const snap = await getDocs(query(collection(db,'sucursales'), orderBy('ubicacion','asc')));
      const list = snap.docs.map(d => {
        const v = d.data();
        return {
          id: d.id,
          nombre: v.ubicacion || v.nombre || d.id,
          ubicacion: v.ubicacion || '',
          cajaChica: typeof v.cajaChica === 'number' ? v.cajaChica : parseFloat(v.cajaChica || 0)
        };
      });
      setSucursales(list);
    })().catch(console.error);
  }, []);
  return sucursales;
}
