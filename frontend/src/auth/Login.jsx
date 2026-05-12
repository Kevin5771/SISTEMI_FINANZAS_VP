// src/auth/Login.jsx
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchUsersForSelect, loginAndGetBackendToken } from '../auth/authService';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';

import './Login.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Helper: refresca el ID token hasta que aparezca el claim `admin` (o se agote el timeout)
async function refreshClaimsUntil(timeoutMs = 3500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await auth.currentUser?.getIdToken(true); // fuerza refresh
      const r = await auth.currentUser?.getIdTokenResult();
      if (r?.claims && ('admin' in r.claims)) return r.claims; // ya bajó el claim
    } catch {
      // ignore y reintenta
    }
    await new Promise(res => setTimeout(res, 250)); // espera 250ms y reintenta
  }
  // último intento: devuelve lo que haya
  try {
    const r = await auth.currentUser?.getIdTokenResult();
    return r?.claims || {};
  } catch {
    return {};
  }
}

// Decode seguro JWT base64url (para leer role del JWT de tu backend si fuera necesario)
function decodeJwtPayload(token) {
  try {
    const base64Url = (token || '').split('.')[1] || '';
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

const lower = (v) => (v ?? '').toString().trim().toLowerCase();

// Fallback por correo si backend/JWT/lista no traen rol
const ADMIN_EMAILS = ['auxiliar.vipizzal@gmail.com', 'admin@example.com'];

// Resuelve 'admin' | 'viewer' desde: respuesta login -> JWT -> lista usuarios -> fallback por correo
function resolveRole(loginRes, selectedEmail, usersList) {
  // 1) loginRes.role
  if (loginRes && typeof loginRes === 'object' && loginRes.role) {
    return lower(loginRes.role);
  }
  // 2) JWT de tu backend (si vino)
  const token = typeof loginRes === 'string' ? loginRes : loginRes?.token;
  if (token) {
    const p = decodeJwtPayload(token);
    const jwtRole = lower(p.role || p.rol || p['https://example.com/role']);
    if (jwtRole) return jwtRole;
    if (typeof p.isAdmin === 'boolean' || typeof p.admin === 'boolean') {
      return (p.isAdmin || p.admin) ? 'admin' : 'viewer';
    }
  }
  // 3) Lista usuarios (por si fetchUsersForSelect trae rol)
  if (Array.isArray(usersList) && usersList.length) {
    const u = usersList.find(x => lower(x.email) === lower(selectedEmail));
    if (u) {
      const fromUser =
        lower(u.role) ||
        lower(u.rol) ||
        lower(u.type) ||
        lower(u?.perfil?.nombre);
      if (fromUser === 'admin' || fromUser === 'viewer') return fromUser;
      if (typeof u.isAdmin === 'boolean') return u.isAdmin ? 'admin' : 'viewer';
    }
  }
  // 4) Fallback por correo
  if (ADMIN_EMAILS.map(lower).includes(lower(selectedEmail))) return 'admin';
  return 'viewer';
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/Finanzas';

  const [users, setUsers] = useState([]);             // sugerencias (si Firestore lo permite)
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(() => !!localStorage.getItem('remember_email'));

  useEffect(() => {
    (async () => {
      setErr(''); setInfo('');
      try {
        const list = await fetchUsersForSelect(); // { email, username, role?, disabled? }
        setUsers(list || []);
        setUsersLoaded(true);

        // preferir recordar si existe y no está deshabilitado
        const remembered = localStorage.getItem('remember_email');
        if (remembered && list.some(u => lower(u.email) === lower(remembered) && !u.disabled)) {
          setEmail(remembered);
          return;
        }

        // si hay algún activo, sugerirlo
        const firstActive = list.find(u => !u.disabled);
        if (firstActive) {
          setEmail(firstActive.email);
          return;
        }

        // si no hay lista o todos deshabilitados, conservar lo que haya en remember_email
        if (remembered) setEmail(remembered);
      } catch {
        // Si falla la carga de usuarios (reglas de lectura), no bloqueamos el login:
        // dejamos email vacío (el usuario lo escribirá manualmente)
        setUsers([]);
        setUsersLoaded(true);
        const remembered = localStorage.getItem('remember_email');
        if (remembered) setEmail(remembered);
        // No mostramos error aquí para no confundir: el login puede continuar igual.
      }
    })();
  }, []);

  // Limpia sesión/tokens locales ante errores
  const clearSession = async () => {
    try { await auth.signOut(); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    // no tocamos remember_email para respetar preferencia
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setInfo('');

    if (!email || !pwd) {
      setErr('Completa todos los campos.');
      return;
    }

    // Si logramos cargar la lista y encontramos el usuario marcado como deshabilitado,
    // prevenimos (si no, dejamos que el backend lo detecte tras signIn).
    if (usersLoaded && users.length) {
      const uSel = users.find(u => lower(u.email) === lower(email));
      if (uSel?.disabled) {
        setErr('Este usuario está deshabilitado. Contacta al administrador.');
        return;
      }
    }

    try {
      setBusy(true);

      if (remember) localStorage.setItem('remember_email', email);
      else localStorage.removeItem('remember_email');

      // Login con Firebase + canje en backend
      const loginRes = await loginAndGetBackendToken(email.trim(), pwd.trim());

      // Refresca el ID token y espera hasta ver el claim admin (robusto)
      try { await refreshClaimsUntil(3500); } catch {}

      // Guarda token si viene (para rutas protegidas por tu app)
      let token = '';
      if (typeof loginRes === 'string') token = loginRes;
      else if (loginRes?.token) token = loginRes.token;
      if (token) localStorage.setItem('token', token);

      // Guarda email
      localStorage.setItem('email', email.trim());

      // Determina y guarda el rol
      const role = resolveRole(loginRes, email.trim(), users);
      localStorage.setItem('role', role);

      navigate(from, { replace: true });
    } catch (e) {
      await clearSession();
      const code = e?.code;
      const msg = (e?.message || '').toLowerCase();

      if (code === 'auth/user-disabled' || msg.includes('deshabilitad')) {
        setErr('Tu cuenta está deshabilitada. Contacta al administrador.');
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setErr('Credenciales inválidas. Verifica usuario y contraseña.');
      } else if (code === 'auth/too-many-requests') {
        setErr('Demasiados intentos fallidos. Intenta más tarde.');
      } else if (code === 'auth/network-request-failed') {
        setErr('Fallo de red. Revisa tu conexión.');
      } else {
        setErr(e?.message || 'Error en el login.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async (e) => {
    e.preventDefault();
    if (busy) return;
    setErr(''); setInfo('');
    if (!email) return setErr('Escribe el correo del usuario para recuperar.');
    try {
      setBusy(true);
      await sendPasswordResetEmail(auth, email.trim());
      setInfo('Te enviamos un correo para restablecer tu contraseña.');
    } catch {
      setErr('No se pudo enviar el correo de recuperación.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-frame">
        <aside className="hero">
          <div className="hero-inner">
            <div className="hero-badge">
              <img src="img/Logosinfondo.png" alt="Brand" className="brand-logo"/>
            </div>
            <div className="hero-brand">American Pizza By Vipizza</div>
            <h1 className="hero-title">Sistema<br/>Finanzas</h1>
            <p className="hero-sub"> </p>
          </div>
          <div className="hero-pattern" aria-hidden />
        </aside>

        <main className="form-area">
          <div className="form-card shadow-sm">
            <h3 className="form-title">Iniciar sesión</h3>

            {err && <div className="alert alert-danger py-2 small mb-3">{err}</div>}
            {info && <div className="alert alert-success py-2 small mb-3">{info}</div>}

            <form onSubmit={onSubmit} noValidate>
              {/* Email (con datalist de sugerencias si existen) */}
              <div className="mb-3">
                <label className="form-label" htmlFor="emailInput">Usuario (correo)</label>
                <div className="input-with-icon">
                  <span className="icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0F3D2E">
                      <path d="M12 12c2.76 0 5-2.69 5-6s-2.24-6-5-6-5 2.69-5 6 2.24 6 5 6Zm0 2c-4.42 0-8 3.13-8 7v1h16v-1c0-3.87-3.58-7-8-7Z"/>
                    </svg>
                  </span>
                  <input
                    id="emailInput"
                    type="email"
                    className="form-control"
                    placeholder="email@dominio.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    list="usersList"
                    autoComplete="username"
                    required
                    disabled={busy}
                  />
                  {/* Sugerencias cuando pudimos leer usuarios */}
                  {usersLoaded && users.length > 0 && (
                    <datalist id="usersList">
                      {users.map((u, i) => (
                        <option key={i} value={u.email}>
                          {u.username}{u.disabled ? ' (deshabilitado)' : ''}
                        </option>
                      ))}
                    </datalist>
                  )}
                </div>
              </div>

              {/* Password */}
              <div className="mb-2">
                <label className="form-label" htmlFor="password">Contraseña</label>
                <div className="input-with-icon">
                  <span className="icon" aria-hidden="true">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#0F3D2E">
                      <path d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2Zm-8 0V7a3 3 0 0 1 6 0v2H9Zm3 5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"/>
                    </svg>
                  </span>
                  <input
                    id="password"
                    type={showPwd ? 'text' : 'password'}
                    className="form-control"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    autoComplete="current-password"
                    required
                    disabled={busy}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    className="toggle-pass"
                    onClick={() => setShowPwd(s => !s)}
                    aria-label={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    title={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    disabled={busy}
                  >
                    {showPwd ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#0F3D2E">
                        <path d="M2 2l20 20-1.5 1.5L18 19.5c-1.8 1-3.8 1.5-6 1.5-5.5 0-10-3.5-12-9 1-2.7 2.7-4.9 4.8-6.5L.5 3.5 2 2Zm5.7 5.7C9.3 7 10.6 6.5 12 6.5c4.1 0 7.5 2.4 9.2 6-1 2.3-2.6 4-4.6 5.1l-2.3-2.3A4.5 4.5 0 0 0 9 9l-1.3-1.3Z"/>
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#0F3D2E">
                        <path d="M12 5c-5 0-9.3 3-11 7 1.7 4 6 7 11 7s9.3-3 11-7c-1.7-4-6-7-11-7Zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10Zm0-2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"/>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="remember-row">
                <div className="form-check m-0">
                  <input
                    id="rememberMe"
                    className="form-check-input"
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    disabled={busy}
                  />
                  <label className="form-check-label" htmlFor="rememberMe">Recordar usuario</label>
                </div>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={onForgot}
                  onKeyDown={(e) => e.key === 'Enter' && onForgot(e)}
                  className="forgot-link"
                >
                  ¿Olvidaste tu contraseña?
                </span>
              </div>

              <button className="btn btn-primary w-100" disabled={busy}>
                {busy ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                    Ingresando…
                  </>
                ) : 'Iniciar sesión'}
              </button>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
