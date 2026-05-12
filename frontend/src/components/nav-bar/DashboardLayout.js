// src/DashboardLayout.jsx
import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate, NavLink, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import './DashboardLayout.css';

function DashboardLayout({ userEmail, userRole }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Email mostrado
  const email = userEmail || localStorage.getItem('email') || 'user@example.com';

  // Rol
  const getRole = () =>
    String(userRole || localStorage.getItem('role') || 'viewer').toLowerCase();
  const [role, setRole] = useState(getRole());
  const isAdmin = role === 'admin';

  // Tema
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  // Estados de submenús
  const path = location.pathname.toLowerCase();
  const registrarActive =
    path.includes('/registrarcierre') || path.includes('/registrarpagos') || path.includes('/registrarservicios');
  const historialActive = path.includes('/ventas') || path.includes('/historialpagos') || path.includes('/historialservicios');

  const [openRegistrar, setOpenRegistrar] = useState(registrarActive);
  const [openHistorial, setOpenHistorial] = useState(historialActive);

  useEffect(() => {
    setRole(getRole());

    const onStorage = (e) => {
      if (e.key === 'role') setRole(String(e.newValue || 'viewer').toLowerCase());
      if (e.key === 'theme') {
        const val = e.newValue || 'light';
        setTheme(val);
        document.documentElement.classList.toggle('alt-theme', val === 'dark');
      }
    };
    const onFocus = () => setRole(getRole());

    // aplicar tema al cargar
    document.documentElement.classList.toggle('alt-theme', theme === 'dark');

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole]);

  // Bloqueo de scroll cuando el drawer móvil está abierto
  useEffect(() => {
    document.documentElement.classList.toggle('drawer-open', isSidebarOpen);
  }, [isSidebarOpen]);

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('alt-theme', next === 'dark');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('email');
    navigate('/login', { replace: true });
  };

  return (
    <div className="admin-container">
      <Helmet>
        <link rel="stylesheet" href="https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap"
        />
      </Helmet>

      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sb-header">
          {/* Cerrar drawer en móvil */}
          <button
            type="button"
            className="menu-btn"
            onClick={() => setIsSidebarOpen(false)}
            aria-label="Cerrar menú"
          >
            <i className="bx bx-chevron-left"></i>
          </button>

          <div className="brand">
            <img src="/img/Logosinfondo.png" alt="American Pizza" />
          </div>
        </div>


        <nav id="sidebar-menu" className="menu-container">
          <ul className="menu">
            {/* Finanzas (home) */}
            <li className="menu-item">
              <NavLink
                to="/Finanzas"
                end
                className={({ isActive }) => `menu-link ${isActive ? 'active' : ''}`}
              >
                <img src="/img/casa.png" alt="" />
                <span>Finanzas</span>
              </NavLink>
            </li>

            {/* ===== Grupo: Registrar ===== */}
            <li className={`menu-item group ${registrarActive ? 'active' : ''}`}>
              <button
                type="button"
                className="menu-link group-toggle"
                onClick={() => setOpenRegistrar((v) => !v)}
                aria-expanded={openRegistrar}
              >
                <img src="/img/factura.png" alt="" />
                <span>Registrar</span>
                <i className={`bx ${openRegistrar ? 'bx-chevron-up' : 'bx-chevron-down'}`} />
              </button>

              {openRegistrar && (
                <ul className="submenu">
                  {/* Cuadres (viewer y admin) */}
                  <li>
                    <NavLink
                      to="RegistrarCierre"
                      className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                    >
                      <span>Cuadres</span>
                    </NavLink>
                  </li>

                  {/* Pagos con efectivo (solo admin, como antes) */}
                  {isAdmin && (
                    <li>
                      <NavLink
                        to="RegistrarPagos"
                        className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                      >
                        <span>Pagos con efectivo</span>
                      </NavLink>
                    </li>
                  )}

                  {/* Servicios (todos) */}
                  <li>
                    <NavLink
                      to="RegistrarServicios"
                      className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                    >
                      <span>Servicios Básicos</span>
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>

            {/* ===== Grupo: Historial ===== */}
            <li className={`menu-item group ${historialActive ? 'active' : ''}`}>
              <button
                type="button"
                className="menu-link group-toggle"
                onClick={() => setOpenHistorial((v) => !v)}
                aria-expanded={openHistorial}
              >
                <img src="/img/pizza3.png" alt="" />
                <span>Historial</span>
                <i className={`bx ${openHistorial ? 'bx-chevron-up' : 'bx-chevron-down'}`} />
              </button>

              {openHistorial && (
                <ul className="submenu">
                  {/* Cuadres (viewer y admin) */}
                  <li>
                    <NavLink
                      to="HistorialCuadres"
                      className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                    >
                      <span>Cuadres</span>
                    </NavLink>
                  </li>

                  {/* Pagos con efectivo (solo admin, como antes) */}
                  {isAdmin && (
                    <li>
                      <NavLink
                        to="HistorialPagos"
                        className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                      >
                        <span>Pagos con efectivo</span>
                      </NavLink>
                    </li>
                  )}

                  {/* Servicios (todos) */}
                  <li>
                    <NavLink
                      to="HistorialServicios"
                      className={({ isActive }) => `submenu-link ${isActive ? 'active' : ''}`}
                    >
                      <span>Servicios Básicos</span>
                    </NavLink>
                  </li>
                </ul>
              )}
            </li>

            {/* ===== Otros menús solo admin (igual que antes) ===== */}
            {isAdmin && (
              <li className="menu-item">
                <NavLink
                  to="Sucursales"
                  className={({ isActive }) => `menu-link ${isActive ? 'active' : ''}`}
                >
                  <img src="/img/pizza3.png" alt="" />
                  <span>Sucursales</span>
                </NavLink>
              </li>
            )}

            {isAdmin && (
              <li className="menu-item">
                <NavLink
                  to="Usuarios"
                  className={({ isActive }) => `menu-link ${isActive ? 'active' : ''}`}
                >
                  <img src="/img/agregaru.png" alt="" />
                  <span>Usuarios</span>
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        {/* Footer del sidebar: cerrar sesión */}
        <div className="sb-footer">
          <div className="footer-actions">
            <button
              onClick={handleLogout}
              className="logout-button"
              type="button"
              title="Cerrar sesión"
            >
              <i className="bx bx-log-out" />
              <span>Salir</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Backdrop para cerrar tocando fuera (solo en móvil) */}
      <div
        className={`backdrop ${isSidebarOpen ? 'show' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Botón hamburguesa (solo móvil) */}
      <button
        type="button"
        className="mobile-trigger"
        onClick={() => setIsSidebarOpen(true)}
        aria-label="Abrir menú"
      >
        <i className="bx bx-menu"></i>
      </button>

      {/* Contenido */}
      <main className="admin-content">
        {/* Barra de usuario arriba */}
        <header className="userbar">
          <div className="theme">
            <button
              type="button"
              className="theme-button"
              onClick={toggleTheme}
              title="Cambiar tema"
            >
              <i className={`bx ${theme === 'dark' ? 'bx-sun' : 'bx-moon'}`} />
              <span>{theme === 'dark' ? ' ' : ' '}</span>
            </button>
          </div>
          <div className="actions">
            <button className="icon-btn" title="Notificaciones">
              <i className="bx bx-bell"></i>
            </button>
          </div>
          <div className="user-chip">
            <img src="/img/perfilusuario.png" alt="perfil-usuario" />
            <div className="meta">
              <strong>{email.split('@')[0] || 'Usuario'}</strong>
              <small>{email}</small>
            </div>
          </div>
        </header>

        <div className="content-card">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export default DashboardLayout;

