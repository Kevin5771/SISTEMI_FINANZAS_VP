// src/App.js
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import PrivateRoute from './auth/PrivateRoute.js'; // tu guard mejorado por token/exp/roles
import DashboardLayout from './components/nav-bar/DashboardLayout.js';

import Finanzas from './components/finanzas/Finanzas.js';
import RegistrarCierre from './components/registrar-cierre/RegistrarCierre.js';
import HistorialCuadres from './components/historial/HistorialCuadres.js';

import Sucursales from './components/sucursales/Sucursales.js';
import Usuarios from './components/usuarios/Usuarios.js';

import RegistrarPagos from './components/registrar-pagos/RegistrarPagos.jsx';
import HistorialPagos from './components/historial/HistorialPagos.jsx';

import RegistrarServicios from './components/registrar-servicios/RegistrarServicios.jsx';
import HistorialServicios from './components/historial/HistorialServicios.jsx';

import Login from './auth/Login'; // tu login

export default function App() {
  return (
    <Routes>
      {/* Rutas públicas */}
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />

      {/* Rutas protegidas: Dashboard y anidadas */}
      <Route
        path="/Finanzas"
        element={
          <PrivateRoute>
            <DashboardLayout />
          </PrivateRoute>
        }
      >
        {/* Cualquiera autenticado */}
        <Route index element={<Finanzas />} />
        <Route path="RegistrarCierre" element={<RegistrarCierre />} />
        <Route path="HistorialCuadres" element={<HistorialCuadres />} />

        {/* Solo ADMIN (usa requiredRoles="admin") */}
        <Route
          path="HistorialPagos"
          element={
            <PrivateRoute requiredRoles="admin" redirectIfDenied="/Finanzas">
              <HistorialPagos />
            </PrivateRoute>
          }
        />
        <Route
          path="RegistrarPagos"
          element={
            <PrivateRoute requiredRoles="admin" redirectIfDenied="/Finanzas">
              <RegistrarPagos />
            </PrivateRoute>
          }
        />
        <Route
          path="HistorialServicios"
          element={
            <PrivateRoute redirectIfDenied="/Finanzas">
              <HistorialServicios />
            </PrivateRoute>
          }
        />
        <Route
          path="RegistrarServicios"
          element={
            <PrivateRoute redirectIfDenied="/Finanzas">
              <RegistrarServicios />
            </PrivateRoute>
          }
        />
        <Route
          path="Sucursales"
          element={
            <PrivateRoute requiredRoles="admin" redirectIfDenied="/Finanzas">
              <Sucursales />
            </PrivateRoute>
          }
        />
        <Route
          path="Usuarios"
          element={
            <PrivateRoute requiredRoles="admin" redirectIfDenied="/Finanzas">
              <Usuarios />
            </PrivateRoute>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
