// src/MyCalendar.js
import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Calendar, momentLocalizer } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/es';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'react-big-calendar/lib/css/react-big-calendar.css';

import './MyCalendar.css';

moment.locale('es');
const localizer = momentLocalizer(moment);

const emptyEvent = {
  title:        '',
  description:  '',
  date:         '',
  startTime:    '',
  endTime:      '',
  priority:     'Media',
  alert:        false,
  alertTime:    'Al momento',
  alertChannel: 'Pestaña emergente',
  frequency:    'Nunca',
  category:     '',
  status:       'Pendiente',
  visibility:   'all',
  branchId:     '',
  ownerEmail:   ''
};

// Dia
const WEEKDAYS = ['dom','lun','mar','mié','jue','vie','sáb'];


const capitalize = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const dd = n => String(n).padStart(2, '0');

// ===== Toolbar personalizado =====
function MyToolbar({ date, view, label, onNavigate, onView, showAddButton }) {
  const [isNarrow, setIsNarrow] = useState(window.matchMedia('(max-width: 400px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 400px)');
    const h = e => setIsNarrow(e.matches);
    mq.addEventListener ? mq.addEventListener('change', h) : mq.addListener(h);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', h) : mq.removeListener(h));
  }, []);

  const m = moment(date);
  let primary = label;     // línea 1
  let secondary = '';      // línea 2 (solo en semana)

  if (view === 'month') {
    // Mes + Año (se mantiene como pediste)
    primary = capitalize(m.format('MMMM YYYY'));
  } else if (view === 'week') {
    // Línea 1: mes | Línea 2: (DD - DD)
    const start = moment(m).startOf('week'); // lunes por locale
    const end   = moment(m).endOf('week');
    if (start.isoWeekday() === 7) start.add(1, 'day');
    if (end.isoWeekday() === 6) end.add(1, 'day');
    primary = capitalize(m.format('MMMM'));
    secondary = `(${dd(start.date())} - ${dd(end.date())})`;
  } else if (view === 'day') {
    primary = `${dd(m.date())} de ${capitalize(m.format('MMMM'))}`;
  } else if (view === 'agenda') {
    primary = 'Agenda';
  }

  const semTxt = isNarrow ? 'Sem' : 'Semana';

  return (
    <div className="rbc-toolbar d-flex justify-content-between align-items-center mb-3 my-toolbar">
      <div className="rbc-btn-group">
        <button className="btn btn-outline-secondary btn-sm me-1" onClick={() => onNavigate('PREV')}>‹</button>
        <button className="btn btn-outline-secondary btn-sm me-1" onClick={() => onNavigate('TODAY')}>Hoy</button>
        <button className="btn btn-outline-secondary btn-sm" onClick={() => onNavigate('NEXT')}>›</button>
      </div>

      <div className="rbc-toolbar-label fw-bold toolbar-title">
        <div className="title-primary">{primary}</div>
        {view === 'week' && <div className="title-sub">{secondary}</div>}
      </div>

      <div className="rbc-btn-group d-flex align-items-center">
        <button className="btn btn-outline-secondary btn-sm me-1" onClick={() => onView('month')}>Mes</button>
        <button className="btn btn-outline-secondary btn-sm me-1" onClick={() => onView('week')}>{semTxt}</button>
        <button className="btn btn-outline-secondary btn-sm me-1" onClick={() => onView('day')}>Día</button>
        <button className="btn btn-outline-secondary btn-sm me-3" onClick={() => onView('agenda')}>Agenda</button>
        {showAddButton ? null : null}
      </div>
    </div>
  );
}

const MyCalendar = forwardRef(({ showAddButton = true }, ref) => {
  const [events, setEvents]       = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editIndex, setEditIndex] = useState(null);
  const [newEvent, setNewEvent]   = useState(emptyEvent);

  const [currView, setCurrView] = useState('month');


  const role = (localStorage.getItem('role') || 'viewer').toLowerCase();
  const isAdmin = role === 'admin';
  const currentEmail = localStorage.getItem('email') || '';
  const activeSucursalId = (localStorage.getItem('activeSucursalId') || '').toLowerCase();

  let sucursales = [];
  try { const raw = localStorage.getItem('sucursales'); if (raw) sucursales = JSON.parse(raw); } catch {}

  const popupRefs = useRef({});

  useEffect(() => {
    const saved = localStorage.getItem('events');
    if (saved) {
      const parsed = JSON.parse(saved).map(evt => ({
        visibility: 'all',
        branchId: '',
        ownerEmail: '',
        ...evt,
        start: new Date(evt.start),
        end:   new Date(evt.end)
      }));
      setEvents(parsed);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('events', JSON.stringify(events.map(evt => ({
      ...evt,
      start: evt.start.toISOString(),
      end:   evt.end.toISOString()
    }))));
  }, [events]);

  useEffect(() => {
    if (modalOpen) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [modalOpen]);

  const handleChange = field => e => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setNewEvent(evt => ({ ...evt, [field]: val }));
  };

  const openAddModal = () => {
    if (!isAdmin) return;
    setIsEditing(false);
    setNewEvent({
      ...emptyEvent,
      ownerEmail: currentEmail,
      branchId: (activeSucursalId && activeSucursalId !== 'all') ? activeSucursalId : ''
    });
    setModalOpen(true);
  };

  useImperativeHandle(ref, () => ({ openAddModal }));

  const openEditModal = (event, index) => {
    if (!isAdmin) return;
    const date      = moment(event.start).format('YYYY-MM-DD');
    const startTime = moment(event.start).format('HH:mm');
    const endTime   = moment(event.end).format('HH:mm');
    setIsEditing(true);
    setEditIndex(index);
    setNewEvent({ ...event, date, startTime, endTime });
    setModalOpen(true);
  };

  const handleSave = () => {
    const { title, description, date, startTime, endTime, alert, alertTime, visibility, branchId } = newEvent;
    if (!title || !date || !startTime || !endTime) return window.alert('Completa título, fecha e horas');

    if (visibility === 'branch' && !branchId && (!activeSucursalId || activeSucursalId === 'all')) {
      return window.alert('Selecciona una sucursal para la visibilidad por sucursal.');
    }

    const start = new Date(`${date}T${startTime}`);
    const end   = new Date(`${date}T${endTime}`);
    const normalizedBranchId =
      visibility === 'branch'
        ? (branchId || ((activeSucursalId && activeSucursalId !== 'all') ? activeSucursalId : ''))
        : '';

    const evt = { ...newEvent, start, end, branchId: normalizedBranchId, ownerEmail: newEvent.ownerEmail || currentEmail };

    let eventoId;
    if (isEditing) {
      eventoId = editIndex;
      setEvents(evts => { const copy = [...evts]; copy[editIndex] = evt; return copy; });
    } else {
      setEvents(evts => { const newList = [...evts, evt]; eventoId = newList.length - 1; return newList; });
    }
    setModalOpen(false);

    if (alert) {
      let alertDate = new Date(start);
      switch (alertTime) {
        case '10 minutos antes': alertDate.setMinutes(alertDate.getMinutes() - 10); break;
        case '1 hora antes':     alertDate.setHours(alertDate.getHours() - 1); break;
        case '1 día antes':      alertDate.setDate(alertDate.getDate() - 1); break;
        case '3 días antes':     alertDate.setDate(alertDate.getDate() - 3); break;
        default: break;
      }

      const showPopup = () => {
        const popupName = `popup_event_${eventoId}`;
        const width = 400, height = 250;
        const left = window.screenX + (window.innerWidth - width) / 2;
        const top  = window.screenY + (window.innerHeight - height) / 3;
        let popup;
        if (popupRefs.current[eventoId] && !popupRefs.current[eventoId].closed) {
          popup = popupRefs.current[eventoId];
        } else {
          popup = window.open('', popupName, `width=${width},height=${height},left=${left},top=${top}`);
          popupRefs.current[eventoId] = popup;
        }
        if (popup) {
          popup.document.title = `Recordatorio: ${title}`;
          popup.document.body.style.margin = '0';
          popup.document.body.style.fontFamily = 'Arial, sans-serif';
          popup.document.body.style.display = 'flex';
          popup.document.body.style.flexDirection = 'column';
          popup.document.body.style.justifyContent = 'center';
          popup.document.body.style.alignItems = 'center';
          popup.document.body.style.height = '100vh';
          popup.document.body.style.backgroundColor = '#f8f9fa';
          popup.document.body.innerHTML = `
            <div style="text-align:center; padding: 1rem;">
              <h2 style="margin-bottom: 0.5rem;">🔔 Recordatorio</h2>
              <h4 style="margin-top:0; margin-bottom:1rem;">${title}</h4>
              <p style="margin:0; font-size:1rem;">${description || ''}</p>
              <button id="closeBtn" style="
                margin-top: 1.5rem; padding: 8px 16px; font-size: 1rem;
                background-color: #ca9e3fff; color: white; border: none; border-radius: 4px; cursor: pointer;">Cerrar</button>
            </div>`;
          const closeBtn = popup.document.getElementById('closeBtn');
          closeBtn.onclick = () => popup.close();
          popup.focus();
        } else {
          window.alert(`🔔 Recordatorio: ${title}\n${description || ''}`);
        }
      };

      const now = Date.now();
      const diffMs = new Date(alertDate).getTime() - now;
      diffMs > 0 ? setTimeout(showPopup, diffMs) : showPopup();
    }
  };

  const handleDelete = () => {
    if (isEditing) {
      if (popupRefs.current[editIndex] && !popupRefs.current[editIndex].closed) popupRefs.current[editIndex].close();
      setEvents(evts => evts.filter((_, i) => i !== editIndex));
      setModalOpen(false);
    }
  };

  // Filtrado
  const filteredEvents = events.filter(evt => {
    const vis = (evt.visibility || 'all');
    const evtBranch = (evt.branchId || '').toLowerCase();

    if (activeSucursalId === 'all' || activeSucursalId === '') {
      if (isAdmin) return true;
      if (vis === 'all') return true;
      if (vis === 'branch') return true;
      if (vis === 'mine') return (evt.ownerEmail || '') === currentEmail;
      return false;
    }
    if (vis === 'all') return true;
    if (vis === 'branch') return evtBranch === activeSucursalId;
    if (vis === 'mine') return (evt.ownerEmail || '') === currentEmail;
    return false;
  });

const formats = useMemo(() => ({
  // Encabezado de la fila de días (semana/mes) abreviado
   weekdayFormat: (date) => WEEKDAYS[moment(date).day()],

  dayHeaderFormat: (date) => `${capitalize(WEEKDAYS[moment(date).day()])} ${dd(moment(date).date())}`,

  // 🔹 Este era el responsable de mostrar “13”
  //     Lo cambiamos SOLO en la vista day
  dayFormat: (date) =>
    currView === 'day'
      ? capitalize(moment(date).format('dddd')) // "Sábado"
      : moment(date).format('D'),

  monthHeaderFormat: (date) => capitalize(moment(date).format('MMMM YYYY')),

  dayRangeHeaderFormat: ({ start, end }) => {
    const ms = moment(start), me = moment(end);
    return `${capitalize(ms.format('D MMM'))} – ${me.format('D MMM')}`;
  },

  timeGutterFormat: (date) => moment(date).format('HH:mm'),

  agendaHeaderFormat: ({ start, end }) => {
    const s = moment(start), e = moment(end);
    return `Agenda: ${s.format('D [de] MMMM')} – ${e.format('D [de] MMMM')}`;
  },

  agendaDateFormat: (date) => `${capitalize(WEEKDAYS[moment(date).day()])} ${dd(moment(date).date())}`,

  agendaTimeRangeFormat: ({ start, end }) =>
    `${moment(start).format('HH:mm')} – ${moment(end).format('HH:mm')}`,
}), [currView]);


  return (
    <div className="p-3">
      <div className="calendar-container">
        <Calendar
          localizer={localizer}
          events={filteredEvents}
          startAccessor="start"
          endAccessor="end"
          defaultView="month"
          views={['month', 'week', 'day', 'agenda']}
          style={{ height: 500 }}
          components={{ toolbar: props => <MyToolbar {...props} showAddButton={showAddButton} /> }}
          formats={formats}
          onView={(v) => setCurrView(v)}
          onSelectEvent={event => {
            if (!isAdmin) return;
            const idx = events.findIndex(e =>
              e.start.getTime() === event.start.getTime() &&
              e.end.getTime()   === event.end.getTime() &&
              e.title          === event.title
            );
            if (idx > -1) openEditModal(event, idx);
          }}
          dayPropGetter={date => {
            const today = new Date();
            if (date.getDate()===today.getDate() && date.getMonth()===today.getMonth() && date.getFullYear()===today.getFullYear()) {
              return { className: 'today-cell' };
            }
            return {};
          }}
          messages={{
            date: 'Fecha',
            time: 'Hora',
            event: 'Evento',
            allDay: 'Todo el día',
            week: 'Semana',
            work_week: 'Semana laboral',
            day: 'Día',
            month: 'Mes',
            previous: '‹',
            next: '›',
            yesterday: 'Ayer',
            tomorrow: 'Mañana',
            today: 'Hoy',
            agenda: 'Agenda',
            noEventsInRange: 'No hay eventos en este rango',
            showMore: total => `+ ${total} más`,
          }}
          scrollToTime={new Date(1970, 1, 1, 7, 0, 0)}
        />
      </div>
      {/* Modal (sin cambios) */}
      {modalOpen && (
        <>
          <div className="modal-backdrop show"></div>
          <div className="modal d-block" tabIndex={-1} role="dialog">
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{isEditing ? 'Editar Actividad' : 'Agregar Actividad'}</h5>
                  <button type="button" className="btn-close" onClick={() => setModalOpen(false)} />
                </div>
                <div className="modal-body">
                  <div className="mb-2">
                    <label className="form-label">Título</label>
                    <input type="text" className="form-control" value={newEvent.title} onChange={handleChange('title')} />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Descripción</label>
                    <textarea className="form-control" rows={2} value={newEvent.description} onChange={handleChange('description')} />
                  </div>
                  <div className="row mb-2">
                    <div className="col">
                      <label className="form-label">Fecha</label>
                      <input type="date" className="form-control" value={newEvent.date} onChange={handleChange('date')} />
                    </div>
                    <div className="col">
                      <label className="form-label">Hora inicio – fin</label>
                      <div className="d-flex">
                        <input type="time" className="form-control" value={newEvent.startTime} onChange={handleChange('startTime')} />
                        <span className="mx-2 align-self-center">–</span>
                        <input type="time" className="form-control" value={newEvent.endTime} onChange={handleChange('endTime')} />
                      </div>
                    </div>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Prioridad</label>
                    <select className="form-select" value={newEvent.priority} onChange={handleChange('priority')}>
                      <option value="Alta">Alta 🔴</option>
                      <option value="Media">Media 🟠</option>
                      <option value="Baja">Baja 🟢</option>
                    </select>
                  </div>
                  <div className="form-check mb-2">
                    <input type="checkbox" className="form-check-input" id="alertCheck" checked={newEvent.alert} onChange={handleChange('alert')} />
                    <label className="form-check-label" htmlFor="alertCheck">¿Deseas recibir alerta?</label>
                  </div>
                  {newEvent.alert && (
                    <div className="mb-2">
                      <label className="form-label">Momento alerta</label>
                      <select className="form-select" value={newEvent.alertTime} onChange={handleChange('alertTime')}>
                        <option value="Al momento">Al momento</option>
                        <option value="10 minutos antes">10 minutos antes</option>
                        <option value="1 hora antes">1 hora antes</option>
                        <option value="1 día antes">1 día antes</option>
                        <option value="3 días antes">3 días antes</option>
                      </select>
                    </div>
                  )}
                  <div className="mb-2">
                    <label className="form-label">Repetición</label>
                    <select className="form-select" value={newEvent.frequency} onChange={handleChange('frequency')}>
                      <option value="Nunca">Nunca</option>
                      <option value="Diario">Diario</option>
                      <option value="Semanal">Semanal</option>
                      <option value="Mensual">Mensual</option>
                    </select>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Categoría</label>
                    <input type="text" className="form-control" placeholder='Ej. "Trabajo", "Personal"' value={newEvent.category} onChange={handleChange('category')} />
                  </div>
                  <div className="mb-2">
                    <label className="form-label">Estado</label>
                    <select className="form-select" value={newEvent.status} onChange={handleChange('status')}>
                      <option value="Pendiente">Pendiente</option>
                      <option value="En curso">En curso</option>
                      <option value="Completado">Completado</option>
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label d-block">Visibilidad de actividad</label>
                    <div className="form-check">
                      <input className="form-check-input" type="radio" name="visibility" id="visMine" value="mine" checked={newEvent.visibility === 'mine'} onChange={handleChange('visibility')} />
                      <label className="form-check-label" htmlFor="visMine">Solo para mi</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="radio" name="visibility" id="visAll" value="all" checked={newEvent.visibility === 'all'} onChange={handleChange('visibility')} />
                      <label className="form-check-label" htmlFor="visAll">Todos</label>
                    </div>
                    <div className="form-check">
                      <input className="form-check-input" type="radio" name="visibility" id="visBranch" value="branch"
                        checked={newEvent.visibility === 'branch'}
                        onChange={e => {
                          const val = e.target.value;
                          setNewEvent(evt => ({
                            ...evt,
                            visibility: val,
                            branchId: evt.branchId || (activeSucursalId && activeSucursalId !== 'all' ? activeSucursalId : '')
                          }));
                        }} />
                      <label className="form-check-label" htmlFor="visBranch">Por sucursal</label>
                    </div>
                    {newEvent.visibility === 'branch' && (
                      <div className="mt-2">
                        <label className="form-label">Sucursal</label>
                        <select className="form-select" value={newEvent.branchId} onChange={handleChange('branchId')}>
                          <option value="">— Selecciona sucursal —</option>
                          {Array.isArray(sucursales) && sucursales.map(s => {
                            const ln = s.nombre || s.name || s.id;
                            const lu = s.ubicacion || s.location || '';
                            const lbl = lu ? `${ln} — ${lu}` : ln;
                            return <option key={s.id} value={s.id}>{lbl}</option>;
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
                  {isEditing && <button type="button" className="btn btn-danger me-auto" onClick={handleDelete}>🗑 Eliminar</button>}
                  <button type="button" className="btn btn-success" onClick={handleSave}>{isEditing ? 'Actualizar' : 'Guardar'}</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
});

export default MyCalendar;
