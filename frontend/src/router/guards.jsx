// src/router/guards.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export function RequireAdmin({ children }) {
  const role = (localStorage.getItem('role') || 'viewer').toLowerCase();
  const loc = useLocation();
  return role === 'admin'
    ? children
    : <Navigate to="/home" replace state={{ from: loc }} />;
}

/* Opcional: protege todo lo que requiera sesión */
export function RequireAuth({ children }) {
  const token = localStorage.getItem('token');
  const loc = useLocation();
  return token
    ? children
    : <Navigate to="/login" replace state={{ from: loc }} />;
}
