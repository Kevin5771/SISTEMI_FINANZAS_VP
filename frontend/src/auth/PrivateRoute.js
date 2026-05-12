// src/PrivateRoute.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

/** Decodificador seguro de JWT (payload) */
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

function getAuthStateFromStorage() {
  const token = localStorage.getItem('token') || '';
  const role = (localStorage.getItem('role') || '').toLowerCase() || null;
  const email = localStorage.getItem('email') || null;

  if (!token) return { token: null, role: null, email: null, expired: true };

  const payload = decodeJwtPayloadSafe(token);
  if (!payload || typeof payload !== 'object') {
    return { token: null, role: null, email: null, expired: true };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const exp = Number(payload.exp || 0);
  const expired = !exp || nowSec >= exp;

  return { token, role, email, expired, payload };
}

function clearAuthStorage() {
  try { localStorage.removeItem('token'); } catch {}
  try { localStorage.removeItem('role'); } catch {}
  try { localStorage.removeItem('email'); } catch {}
  // no tocamos remember_email para respetar preferencia de usuario
}

/**
 * PrivateRoute
 * - Protege rutas comprobando token y expiración.
 * - Si pasas requiredRoles, también valida el rol.
 *
 * Props:
 *  - children: ReactNode
 *  - requiredRoles?: string | string[]   (opcional)
 *  - redirectIfDenied?: string           (ruta si no tiene rol; default: "/")
 *  - redirectIfUnauthed?: string         (ruta si no hay token; default: "/login")
 */
export default function PrivateRoute({
  children,
  requiredRoles,
  redirectIfDenied = '/',
  redirectIfUnauthed = '/login',
}) {
  const location = useLocation();
  const [tick, setTick] = useState(0); // para re-render en cambios de storage

  // Escucha cambios de sesión en otras pestañas
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token' || e.key === 'role' || e.key === 'email') {
        setTick((x) => x + 1);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const { token, role, expired } = useMemo(getAuthStateFromStorage, [tick]);

  // 1) Sin token o vencido -> limpiar y mandarlo a /login
  if (!token || expired) {
    clearAuthStorage();
    return <Navigate to={redirectIfUnauthed} state={{ from: location }} replace />;
  }

  // 2) Validación de roles si corresponde
  if (requiredRoles) {
    const required = Array.isArray(requiredRoles)
      ? requiredRoles.map((r) => String(r).toLowerCase())
      : [String(requiredRoles).toLowerCase()];
    const hasRole = role && required.includes(role);

    if (!hasRole) {
      // No tiene rol adecuado -> redirige a donde definas (dashboard o página 403)
      return <Navigate to={redirectIfDenied} state={{ from: location }} replace />;
    }
  }

  // 3) Todo OK -> renderiza hijos
  return children;
}
