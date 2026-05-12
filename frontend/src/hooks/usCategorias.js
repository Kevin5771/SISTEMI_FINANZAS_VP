// src/hooks/useCategorias.js
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './../services/firebase';

const docRefFromPath = (path) => {
  const parts = String(path).split('/').filter(Boolean);
  return doc(db, ...parts);
};

/**
 * Hook para leer categorías desde Firestore (con suscripción).
 * - Crea el documento si no existe con un arreglo por defecto.
 * - NO persiste cambios automáticamente (eso lo hace tu modal).
 */
export default function useCategorias(persistDocPath, options = {}) {
  const { defaultCategorias = ['General'] } = options;

  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const ref = useMemo(
    () => (persistDocPath ? docRefFromPath(persistDocPath) : null),
    [persistDocPath]
  );

  useEffect(() => {
    if (!ref) {
      setLoading(false);
      return;
    }
    let unsub = () => {};

    (async () => {
      setLoading(true);
      try {
        // 1) Si no existe, lo creamos con defaultCategorias
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(
            ref,
            { categorias: defaultCategorias, createdAt: Date.now(), updatedAt: Date.now() },
            { merge: true }
          );
          setCategorias(defaultCategorias);
        } else {
          const arr = Array.isArray(snap.data()?.categorias) ? snap.data().categorias : [];
          setCategorias(arr);
        }

        // 2) Suscripción en tiempo real
        unsub = onSnapshot(ref, (s) => {
          const arr = Array.isArray(s.data()?.categorias) ? s.data().categorias : [];
          setCategorias(arr);
        });
      } catch (e) {
        console.error(e);
        setError(e);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      try { unsub(); } catch {}
    };
  }, [ref, defaultCategorias]);

  // Refresh manual opcional
  const refresh = async () => {
    if (!ref) return;
    setLoading(true);
    try {
      const snap = await getDoc(ref);
      const arr = Array.isArray(snap.data()?.categorias) ? snap.data().categorias : [];
      setCategorias(arr);
    } catch (e) {
      console.error(e);
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  // Guardado opcional (por si algún día quieres persistir desde el padre)
  // ⚠️ Si usas el modal que ya persiste, NO llames saveCategorias para evitar doble escritura.
  const saveCategorias = async (arr) => {
    if (!ref) throw new Error('persistDocPath requerido');
    await setDoc(ref, { categorias: arr, updatedAt: Date.now() }, { merge: true });
  };

  return { categorias, setCategorias, loading, error, refresh, saveCategorias };
}
