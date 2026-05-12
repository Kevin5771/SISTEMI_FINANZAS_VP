import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './../../firebase';

export function useAuthUser() {
  const [loading, setLoading] = useState(true);
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [profile, setProfile] = useState(null); // {username,email,role,assignedSucursalId}

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setFirebaseUser(u);
      if (!u) {
        setProfile(null);
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', u.uid));
        setProfile(snap.exists() ? snap.data() : null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const role = profile?.role || 'viewer';
  const assignedSucursalId = profile?.assignedSucursalId || null;
  const isAdmin = role === 'admin';
  const isViewer = role === 'viewer';

  return { loading, user: firebaseUser, profile, role, isAdmin, isViewer, assignedSucursalId };
}
