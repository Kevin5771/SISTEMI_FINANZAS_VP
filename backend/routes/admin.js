// backend/routes/admin.js
const router = require('express').Router();
const { admin, db } = require('../firebaseAdmin');

/* =========================================================
   Helpers
   ========================================================= */
function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

async function verifyFirebaseToken(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ message: 'Falta Authorization Bearer' });
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUser = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Token inválido' });
  }
}

async function isAdminUID(uid) {
  // (A) Custom claim
  try {
    const user = await admin.auth().getUser(uid);
    if (user?.customClaims?.admin === true) return true;
  } catch {}
  // (B) Firestore
  try {
    const snap = await db.collection('usuarios').doc(uid).get();
    if (snap.exists && String((snap.data() || {}).role || '').toLowerCase() === 'admin') return true;
  } catch {}
  return false;
}

const lower = (s) => (s || '').toString().trim().toLowerCase();
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

/** Sincroniza el custom claim {admin:true|false} preservando otros claims */
async function setAdminClaim(uid, shouldBeAdmin) {
  try {
    const u = await admin.auth().getUser(uid);
    const current = !!(u.customClaims && u.customClaims.admin);
    const desired = !!shouldBeAdmin;
    if (current === desired) return false; // sin cambios

    const nextClaims = { ...(u.customClaims || {}), admin: desired };
    await admin.auth().setCustomUserClaims(uid, nextClaims);
    return true;
  } catch (e) {
    console.warn('setAdminClaim error:', e.message);
    return false;
  }
}

/* =========================================================
   DELETE USER (Auth + Firestore)
   body: { uid }
   ========================================================= */
router.post('/deleteUser', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.firebaseUser?.uid;
    if (!callerUid) return res.status(401).json({ message: 'No autenticado' });
    if (!(await isAdminUID(callerUid))) return res.status(403).json({ message: 'Solo admin' });

    const { uid } = req.body || {};
    if (!uid) return res.status(400).json({ message: 'uid requerido' });

    // Borra en Auth (ignora user-not-found)
    await admin.auth().deleteUser(uid).catch((e) => {
      if (e?.errorInfo?.code !== 'auth/user-not-found') throw e;
    });

    // Borra doc en Firestore
    await db.collection('usuarios').doc(uid).delete().catch(() => {});

    return res.json({ ok: true, message: 'Usuario eliminado en Auth y Firestore' });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Error al eliminar usuario' });
  }
});

/* =========================================================
   UPDATE USER (Auth + Firestore + Claims)
   body: {
     uid: string (requerido)
     // Auth (opcionales)
     email?: string
     password?: string
     authDisabled?: boolean
     // Firestore perfil (opcionales)
     username?: string
     role?: 'admin'|'viewer'
     sucursalId?: string | null   // null si es admin/todas
     disabled?: boolean           // "estado app" (se usa en login)
   }
   ========================================================= */
router.post('/updateUser', verifyFirebaseToken, async (req, res) => {
  try {
    const callerUid = req.firebaseUser?.uid;
    if (!callerUid) return res.status(401).json({ message: 'No autenticado' });
    if (!(await isAdminUID(callerUid))) return res.status(403).json({ message: 'Solo admin' });

    const {
      uid,
      email,
      password,
      authDisabled,

      username,
      role,
      sucursalId,
      disabled,
    } = req.body || {};

    if (!uid) return res.status(400).json({ message: 'uid requerido' });

    // Validaciones suaves
    if (email && !isEmail(email)) {
      return res.status(400).json({ message: 'Email inválido' });
    }
    if (password && String(password).length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    }
    if (role && !['admin', 'viewer'].includes(String(role).toLowerCase())) {
      return res.status(400).json({ message: 'Rol inválido (usa admin|viewer)' });
    }

    /* ---------- Leer estado actual para lógica dependiente ---------- */
    let currentDoc = null;
    try {
      const snap = await db.collection('usuarios').doc(uid).get();
      currentDoc = snap.exists ? (snap.data() || {}) : null;
    } catch {}

    const currentRole = lower(currentDoc?.role || currentDoc?.rol || (currentDoc?.isAdmin ? 'admin' : ''));
    const nextRole = role != null ? lower(role) : currentRole || ''; // rol final esperado

    /* ---------- 1) Actualizaciones en Auth ---------- */
    const authUpdate = {};
    if (typeof authDisabled === 'boolean') authUpdate.disabled = !!authDisabled;
    if (email) authUpdate.email = String(email).trim();
    if (password) authUpdate.password = String(password);

    let authUser = null;
    if (Object.keys(authUpdate).length) {
      authUser = await admin.auth().updateUser(uid, authUpdate);
    } else {
      // Lee el user por si lo necesitamos devolver igual
      try { authUser = await admin.auth().getUser(uid); } catch {}
    }

    /* ---------- 2) Actualizaciones en Firestore (perfil) ---------- */
    const fsUpdate = {};
    if (username != null) fsUpdate.username = String(username).trim();
    if (role != null) fsUpdate.role = nextRole;
    if (disabled != null) fsUpdate.disabled = !!disabled;

    // Si viewer => guardar sucursalId; si admin => poner en null
    if (role != null) {
      if (nextRole === 'viewer') {
        if (sucursalId == null || sucursalId === '') {
          return res.status(400).json({ message: 'sucursalId es requerido para role=viewer' });
        }
        fsUpdate.sucursalId = String(sucursalId);
      } else {
        fsUpdate.sucursalId = null;
      }
    } else if (sucursalId != null) {
      // permitir actualizar sucursal sin tocar rol, solo si ya es viewer
      if (currentRole === 'viewer') {
        if (sucursalId === '' || sucursalId == null) {
          return res.status(400).json({ message: 'sucursalId es requerido para role=viewer' });
        }
        fsUpdate.sucursalId = String(sucursalId);
      } else {
        // si es admin, forzamos null
        fsUpdate.sucursalId = null;
      }
    }

    // Si cambiamos email en Auth, también sincroniza en Firestore
    if (email) {
      fsUpdate.email = String(email).trim();
      fsUpdate.emailLower = String(email).trim().toLowerCase();
    }

    if (Object.keys(fsUpdate).length) {
      await db.collection('usuarios').doc(uid).set(fsUpdate, { merge: true });
    }

    /* ---------- 3) Claims: sincroniza {admin: bool} según rol final ---------- */
    let claimsUpdated = false;
    if (nextRole === 'admin' || nextRole === 'viewer') {
      claimsUpdated = await setAdminClaim(uid, nextRole === 'admin');
    } else if (role != null) {
      // rol desconocido → forzamos false por seguridad
      claimsUpdated = await setAdminClaim(uid, false);
    }
    // Nota UX: el usuario cuyo rol cambió debe volver a iniciar sesión para ver reflejado el claim.

    /* ---------- 4) Respuesta ---------- */
    return res.json({
      ok: true,
      message: 'Usuario actualizado',
      auth: authUser
        ? { uid: authUser.uid, email: authUser.email, disabled: !!authUser.disabled }
        : null,
      firestore: fsUpdate,
      finalRole: nextRole || null,
      claimsUpdated,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message || 'Error al actualizar usuario' });
  }
});

module.exports = router;
