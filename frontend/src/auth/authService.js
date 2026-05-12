// src/auth/authService.js
import { auth } from '../services/firebase';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db } from '../services/firebase';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';

// =============================
// Config API base
// =============================
const API = (process.env.REACT_APP_API_URL || '/api').replace(/\/+$/, '');

// =============================
// Utils
// =============================
async function safeGetUserDisabled(uid) {
  try {
    const ref = doc(db, 'usuarios', uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() || {};
      return !!data.disabled;
    }
  } catch (e) {
    // Si no tienes permiso de lectura (permission-denied), no bloquees el login
    // Solo registra a consola para debug y asume "no deshabilitado".
    console.warn('safeGetUserDisabled() no pudo leer usuarios/%s:', uid, e?.code || e?.message || e);
  }
  return false;
}

async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);

  // Mapeo especial: 403 con "deshabilit" => auth/user-disabled
  if (!resp.ok) {
    let txt = '';
    try { txt = await resp.text(); } catch {}
    if (resp.status === 403 && (txt || '').toLowerCase().includes('deshabilit')) {
      const err = new Error('Tu cuenta está deshabilitada. Contacta al administrador.');
      err.code = 'auth/user-disabled';
      throw err;
    }
    const err = new Error(`HTTP ${resp.status} en ${url}: ${txt || 'Error'}`);
    err.status = resp.status;
    throw err;
  }

  const ct = resp.headers.get('content-type') || '';
  return ct.includes('application/json') ? resp.json() : resp.text();
}

// =============================
// API público
// =============================

/** Lee la colección 'usuarios' y devuelve [{email, username, role?, disabled?, emailLower?}] */
export async function fetchUsersForSelect() {
  const qs = await getDocs(collection(db, 'usuarios'));
  return qs.docs.map((snap) => {
    const d = snap.data() || {};
    return {
      email: d.email,
      emailLower: d.emailLower || (d.email ? String(d.email).toLowerCase() : undefined),
      username: d.username || d.email,
      role: d.role || d.rol || (d.isAdmin ? 'admin' : undefined),
      disabled: !!d.disabled,
    };
  });
}

/** Login con Firebase y canje en backend */
export async function loginAndGetBackendToken(email, password) {
  const emailTrim = String(email || '').trim();
  const passTrim = String(password || '').trim();

  // 1) Login Firebase
  const cred = await signInWithEmailAndPassword(auth, emailTrim, passTrim);
  const user = cred.user;

  // 2) Validar que NO esté deshabilitado (en tu app) leyendo Firestore (si se puede)
  const isDisabled = await safeGetUserDisabled(user.uid);
  if (isDisabled) {
    await signOut(auth).catch(() => {});
    const err = new Error('Tu cuenta está deshabilitada. Contacta al administrador.');
    err.code = 'auth/user-disabled';
    throw err;
  }

  // 3) ID token fresco de Firebase (importante si usas custom claims)
  const idToken = await user.getIdToken(true);

  // 4) Intercambio con backend
  const url = `${API}/auth/login`;
  const data = await fetchJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    credentials: 'omit',
    body: JSON.stringify({ idToken }),
  }).catch(async (e) => {
    // Si falla el canje, cierra sesión para evitar estados raros
    await signOut(auth).catch(() => {});
    throw e;
  });

  if (!data?.token) {
    await signOut(auth).catch(() => {});
    throw new Error(data?.message || 'Respuesta inválida del servidor (falta token)');
  }

  // 5) Persistir en localStorage para tu app
  localStorage.setItem('email', user.email || '');
  localStorage.setItem('token', data.token);
  if (data.role) localStorage.setItem('role', String(data.role).toLowerCase());

  return {
    user,
    token: data.token,
    role: data.role || data.rol,
    backend: data,
  };
}

/** (Opcional) Obtiene doc de usuario por UID */
export async function getUserDoc(uid) {
  const ref = doc(db, 'usuarios', uid);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

const authService = { fetchUsersForSelect, loginAndGetBackendToken, getUserDoc };
export default authService;
