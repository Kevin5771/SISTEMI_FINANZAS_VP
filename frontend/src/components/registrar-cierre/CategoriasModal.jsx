// src/components/registrar-cierre/CategoriasModal.jsx
import React, { useState } from 'react';
import Swal from 'sweetalert2';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';

export default function CategoriasModal({
  open,
  onClose,
  categorias,
  onChangeCategorias,
  /** 🔒 Ruta del documento en Firestore donde se guardará el array de categorías.
   *  Ej: "companies/ABC/config/categorias_gastos" */
  persistDocPath = null,
}) {
  const [editIdx, setEditIdx] = useState(null);
  const [editName, setEditName] = useState('');
  const [addMode, setAddMode] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  if (!open) return null;

  // Helper: docRef desde ruta tipo "a/b/c/d"
  const docRefFromPath = (path) => {
    if (!path) return null;
    const parts = String(path).split('/').filter(Boolean);
    return doc(db, ...parts);
  };

  const persistCategorias = async (arr) => {
    if (!persistDocPath) return; // si no se pasó ruta, solo actualiza UI
    const ref = docRefFromPath(persistDocPath);
    try {
      await setDoc(
        ref,
        { categorias: arr, updatedAt: Date.now() },
        { merge: true }
      );
    } catch (err) {
      console.error('Error guardando categorías:', err);
      throw err;
    }
  };

  const startEdit = (i) => {
    setEditIdx(i);
    setEditName(categorias[i]);
  };

  const saveEdit = async () => {
    if (editIdx === null) return;
    const name = (editName || '').trim();
    if (!name) return alert('Ingresa un nombre.');
    if (categorias.some((c, idx) => idx !== editIdx && c.toLowerCase() === name.toLowerCase())) {
      return alert('Ya existe una categoría con ese nombre.');
    }

    const before = categorias.slice();
    const updated = categorias.map((c, i) => (i === editIdx ? name : c));

    // Optimistic UI
    onChangeCategorias(updated, categorias[editIdx], name);

    try {
      await persistCategorias(updated);
      setEditIdx(null);
      setEditName('');
      Swal.fire({ icon: 'success', title: 'Categoría actualizada', timer: 900, showConfirmButton: false });
    } catch {
      // rollback
      onChangeCategorias(before, name, categorias[editIdx]);
      alert('No se pudo guardar en la base de datos.');
    }
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditName('');
  };

  const deleteCat = async (i) => {
    const removed = categorias[i];
    const before = categorias.slice();
    const updated = categorias.filter((_, idx) => idx !== i);

    // Optimistic UI
    onChangeCategorias(updated, removed, null);

    try {
      await persistCategorias(updated);
      Swal.fire({ icon: 'success', title: 'Categoría eliminada', timer: 900, showConfirmButton: false });
    } catch {
      onChangeCategorias(before, null, removed);
      alert('No se pudo eliminar en la base de datos.');
    }
  };

  const saveNew = async () => {
    const name = (newCatName || '').trim();
    if (!name) return alert('Ingresa un nombre.');
    if (categorias.some((c) => c.toLowerCase() === name.toLowerCase())) {
      return alert('Ya existe una categoría con ese nombre.');
    }

    const before = categorias.slice();
    const updated = [...categorias, name];

    // Optimistic UI
    onChangeCategorias(updated, null, name);

    try {
      await persistCategorias(updated);
      setAddMode(false);
      setNewCatName('');
      Swal.fire({ icon: 'success', title: 'Categoría agregada', timer: 900, showConfirmButton: false });
    } catch {
      onChangeCategorias(before, name, null);
      alert('No se pudo guardar en la base de datos.');
    }
  };

  return (
    <div className="rc-modal-mask" role="dialog" aria-modal="true">
      <div className="rc-modal-card">
        <div className="rc-modal-hd">
          <h4>Categorías de gastos</h4>
          <div className="rc-modal-actions">
            {addMode ? (
              <>
                <input
                  className="rc-input rc-input-sm"
                  placeholder="Nombre de categoría"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                />
                <button className="rc-btn rc-btn-primary" onClick={saveNew}>Guardar</button>
                <button
                  className="rc-btn"
                  onClick={() => { setAddMode(false); setNewCatName(''); }}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <button className="rc-btn" onClick={() => setAddMode(true)}>Agregar</button>
            )}
            <button className="rc-btn rc-btn-outline" onClick={onClose}>Cerrar</button>
          </div>
        </div>

        <div className="rc-modal-body">
          <table className="rc-table">
            <thead>
              <tr>
                <th style={{ width: '60px' }}>#</th>
                <th>Categoría</th>
                <th style={{ width: '220px' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat, i) => (
                <tr key={cat + i}>
                  <td>{i + 1}</td>
                  <td>
                    {editIdx === i ? (
                      <input
                        className="rc-input"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                      />
                    ) : (
                      cat
                    )}
                  </td>
                  <td className="rc-td-actions">
                    {editIdx === i ? (
                      <>
                        <button className="rc-btn rc-btn-primary" onClick={saveEdit}>Guardar</button>
                        <button className="rc-btn" onClick={cancelEdit}>Cancelar</button>
                      </>
                    ) : (
                      <>
                        <button className="rc-btn" onClick={() => startEdit(i)}>Editar</button>
                        <button className="rc-btn rc-btn-ghost danger" onClick={() => deleteCat(i)}>Eliminar</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {!categorias.length && (
                <tr>
                  <td colSpan={3} className="rc-empty">Sin categorías</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
